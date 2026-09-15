"""GotLeaks API -- FastAPI backend replacing the Streamlit app's query code.

Reuses neptune_db.py / neptune_sync.py / neptune_client.py unchanged from the
Neptune project; this file and queries.py/auth.py are the only new code.
Points at the SAME live SQLite database as the Neptune checkout and the
production server (see DB_PATH in .env) -- nothing here duplicates or
migrates data.
"""
from __future__ import annotations

import os
import re
from contextlib import asynccontextmanager

from dotenv import load_dotenv

load_dotenv()  # must run before importing app.neptune_db, which reads DB_PATH at import time

import pandas as pd
from fastapi import Depends, FastAPI, HTTPException, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware

from app import auth
from app import neptune_client as nc
from app import neptune_db as db
from app import neptune_sync as sync
from app import queries


def _records(df):
    """DataFrame -> list of dicts, with NaN/Inf converted to None -- plain
    json.dumps (what FastAPI uses by default) rejects NaN/Infinity outright,
    and pandas leaves them as float('nan') in to_dict() output."""
    return df.replace({float("nan"): None}).where(df.notna(), None).to_dict(orient="records")


def _safe_float(value):
    try:
        if value is None or value != value:  # NaN check without importing math/numpy here
            return None
    except Exception:
        pass
    return float(value)


ALLOW_SYNC = os.environ.get("NEPTUNE_ALLOW_SYNC", "false").strip().lower() == "true"


@asynccontextmanager
async def lifespan(app: FastAPI):
    # A write connection runs schema migration + seeds the first global user
    # / lot-size / building-size zones -- see get_conn(readonly=False) in
    # neptune_db.py. Every other endpoint below opens its own connection, but
    # something has to trigger this once on startup since none of them are
    # writes by themselves.
    conn = db.get_conn(readonly=False)
    conn.close()
    yield


app = FastAPI(title="GotLeaks API", lifespan=lifespan)

origins = [o.strip() for o in os.environ.get("CORS_ORIGINS", "").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok", "db_path": db.DB_PATH, "public_mode": auth.PUBLIC_MODE}


# ------------------------------------------------------------------- auth --

@app.post("/api/auth/login")
def login(payload: dict, response: Response):
    email, password = payload.get("email", ""), payload.get("password", "")
    conn = db.get_conn(readonly=False)
    try:
        user = db.verify_user_password(conn, email, password)
        if not user:
            raise HTTPException(status_code=401, detail="Incorrect email or password.")
        auth.issue_session_cookie(response, user)
        return {"email": user["email"], "role": user["role"]}
    finally:
        conn.close()


@app.post("/api/auth/logout")
def logout(response: Response):
    auth.clear_session_cookie(response)
    return {"ok": True}


@app.get("/api/auth/me")
def me(user: dict | None = Depends(auth.get_current_user)):
    if user is None:
        raise HTTPException(status_code=401, detail="Not logged in")
    return {"email": user["email"], "role": user["role"], "public_mode": auth.PUBLIC_MODE}


# --------------------------------------------------------------- customers --

@app.get("/api/customers")
def customers(q: str | None = None, user=Depends(auth.require_role("viewer"))):
    conn = db.get_conn(readonly=True)
    try:
        return {"rows": _records(queries.get_customers(conn, q=q))}
    finally:
        conn.close()


# ------------------------------------------------------------ water usage --

@app.get("/api/usage/leaderboard")
def usage_leaderboard(zone: list[str] | None = Query(default=None), user=Depends(auth.require_role("viewer"))):
    conn = db.get_conn(readonly=True)
    try:
        window = queries.get_leak_status_window(conn)
        if window is None:
            return {"window": None, "rows": []}
        board = queries.get_usage_leaderboard(conn, zones=zone)
        return {"window": window, "rows": _records(board)}
    finally:
        conn.close()


@app.get("/api/continuous-users")
def continuous_users(
    min_gph: float = Query(default=10.0),
    sort_by: str = Query(default="min_consumption"),
    user=Depends(auth.require_role("viewer")),
):
    conn = db.get_conn(readonly=True)
    try:
        window = queries.get_leak_status_window(conn)
        if window is None:
            return {"window": None, "rows": []}
        rows = queries.get_continuous_users(conn, min_gph=min_gph, sort_by=sort_by)
        return {"window": window, "rows": _records(rows)}
    finally:
        conn.close()


@app.get("/api/meters/{miu_id}/usage")
def meter_usage(miu_id: str, since: str | None = None, until: str | None = None, user=Depends(auth.require_role("viewer"))):
    conn = db.get_conn(readonly=True)
    try:
        usage = queries.get_meter_usage(conn, miu_id, since=since, until=until)
        if usage.empty:
            raise HTTPException(status_code=404, detail="No usage data for this meter/window")
        return _records(usage)
    finally:
        conn.close()


@app.get("/api/meters/{miu_id}/neighbors")
def meter_neighbors(miu_id: str, n: int = Query(default=10, ge=1, le=100), user=Depends(auth.require_role("viewer"))):
    import numpy as np

    conn = db.get_conn(readonly=True)
    try:
        coords = queries.get_meter_coords(conn)
        me = coords[coords["miu_id"] == miu_id]
        if me.empty:
            raise HTTPException(status_code=404, detail="No surveyed GPS location for this meter")
        me = me.iloc[0]

        others = coords[coords["miu_id"] != miu_id].copy()
        r_m = 6371000.0
        phi1, phi2 = np.radians(me["lat"]), np.radians(others["lat"].to_numpy(dtype=float))
        dphi = np.radians(others["lat"].to_numpy(dtype=float) - me["lat"])
        dlambda = np.radians(others["lon"].to_numpy(dtype=float) - me["lon"])
        a = np.sin(dphi / 2) ** 2 + np.cos(phi1) * np.cos(phi2) * np.sin(dlambda / 2) ** 2
        others["distance_ft"] = 2 * r_m * np.arcsin(np.sqrt(a)) * 3.28084

        nearest = others.nsmallest(n, "distance_ft")
        weekly = queries.get_usage_leaderboard(conn)[["miu_id", "total_consumption"]]
        nearest = nearest.merge(weekly, on="miu_id", how="left")
        nearest["seven_day_avg"] = nearest["total_consumption"] / 7.0

        my_weekly = weekly[weekly["miu_id"] == miu_id]["total_consumption"]
        my_avg = my_weekly.iloc[0] / 7.0 if not my_weekly.empty else None

        return {
            "my_seven_day_avg": _safe_float(my_avg),
            "neighborhood_avg": _safe_float(nearest["seven_day_avg"].mean()) if not nearest.empty else None,
            "neighbors": _records(nearest.sort_values("distance_ft")),
        }
    finally:
        conn.close()


# -------------------------------------------------------------------- map --

@app.get("/api/map/parcels")
def map_parcels(threshold: float = Query(default=10.0), user=Depends(auth.require_role("viewer"))):
    conn = db.get_conn(readonly=True)
    try:
        return {"records": queries.get_map_parcels(conn, threshold=threshold)}
    finally:
        conn.close()


@app.get("/api/map/meters")
def map_meters(user=Depends(auth.require_role("viewer"))):
    conn = db.get_conn(readonly=True)
    try:
        return queries.get_map_gis_meters(conn)
    finally:
        conn.close()


# ------------------------------------------------------------------ users --

@app.get("/api/users")
def list_users(user=Depends(auth.require_role("admin"))):
    conn = db.get_conn(readonly=True)
    try:
        return {"rows": db.list_users(conn), "your_email": user["email"], "your_role": user["role"]}
    finally:
        conn.close()


@app.post("/api/users")
def create_user(payload: dict, user=Depends(auth.require_role("admin"))):
    email = (payload.get("email") or "").strip()
    password = payload.get("password") or ""
    role = payload.get("role") or "viewer"

    if role == "global" and user["role"] != "global":
        raise HTTPException(status_code=403, detail="Only global accounts can create other global accounts.")
    if role not in db.VALID_ROLES:
        raise HTTPException(status_code=400, detail=f"Invalid role: {role!r}")
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="Enter a valid email address.")
    if len(password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters.")

    conn = db.get_conn(readonly=False)
    try:
        if db.get_user_by_email(conn, email):
            raise HTTPException(status_code=400, detail="That email already has an account.")
        db.create_user(conn, email, password, role, created_by=user["email"])
        return {"ok": True}
    finally:
        conn.close()


@app.post("/api/users/{user_id}/active")
def set_user_active(user_id: int, payload: dict, user=Depends(auth.require_role("admin"))):
    active = bool(payload.get("active"))
    conn = db.get_conn(readonly=False)
    try:
        target = conn.execute("SELECT * FROM app_users WHERE id = ?", (user_id,)).fetchone()
        if not target:
            raise HTTPException(status_code=404, detail="No such user")
        if target["email"] == user["email"]:
            raise HTTPException(status_code=400, detail="You can't deactivate your own account.")
        if (
            target["role"] == "global"
            and target["active"]
            and not active
            and db.count_users_with_role(conn, "global", active_only=True) <= 1
        ):
            raise HTTPException(status_code=400, detail="Can't deactivate the last global account.")
        db.set_user_active(conn, user_id, active)
        return {"ok": True}
    finally:
        conn.close()


# ------------------------------------------------------------------- sync --

def _get_client(conn):
    try:
        return nc.NeptuneClient(conn=conn)
    except KeyError as e:
        raise HTTPException(status_code=500, detail=f"Missing required setting in .env: {e}")


@app.get("/api/sync/status")
def sync_status(user=Depends(auth.require_role("global"))):
    if not ALLOW_SYNC:
        return {"allow_sync": False}
    conn = db.get_conn(readonly=True)
    try:
        client = _get_client(conn)
        remaining = client.calls_remaining()
        row_counts = {
            "customers": conn.execute("SELECT COUNT(*) AS n FROM customers").fetchone()["n"],
            "water_usage_rows": conn.execute("SELECT COUNT(*) AS n FROM water_usage").fetchone()["n"],
        }
        progress = sync.backfill_progress(conn)
        return {
            "allow_sync": True,
            "calls_used": client.daily_budget - remaining,
            "daily_budget": client.daily_budget,
            "site_id": client.site_id,
            "row_counts": row_counts,
            "backfill_progress": progress,
        }
    finally:
        conn.close()


@app.post("/api/sync/customers")
def sync_customers_endpoint(user=Depends(auth.require_role("global"))):
    if not ALLOW_SYNC:
        raise HTTPException(status_code=403, detail="Sync & Backfill is disabled on this machine.")
    conn = db.get_conn(readonly=False)
    try:
        client = _get_client(conn)
        result = sync.sync_customers(client)
        return {"customers_synced": result["customers_synced"]}
    except (nc.NeptuneAPIError, nc.BudgetExceeded) as e:
        raise HTTPException(status_code=502, detail=str(e))
    finally:
        conn.close()


@app.post("/api/sync/recent-usage")
def sync_recent_usage_endpoint(payload: dict | None = None, user=Depends(auth.require_role("global"))):
    if not ALLOW_SYNC:
        raise HTTPException(status_code=403, detail="Sync & Backfill is disabled on this machine.")
    days = (payload or {}).get("days", 3)
    conn = db.get_conn(readonly=False)
    try:
        client = _get_client(conn)
        n = sync.sync_water_usage_recent(client, days=days)
        return {"rows_written": n}
    except (nc.NeptuneAPIError, nc.BudgetExceeded) as e:
        raise HTTPException(status_code=502, detail=str(e))
    finally:
        conn.close()


@app.post("/api/sync/backfill")
def sync_backfill_endpoint(payload: dict, user=Depends(auth.require_role("global"))):
    if not ALLOW_SYNC:
        raise HTTPException(status_code=403, detail="Sync & Backfill is disabled on this machine.")
    start_date, end_date = payload.get("start_date"), payload.get("end_date")
    actual = bool(payload.get("actual_only", False))
    conn = db.get_conn(readonly=False)
    try:
        client = _get_client(conn)
        result = sync.start_or_resume_backfill(client, start_date, end_date, actual)
        return result
    except (nc.NeptuneAPIError, nc.BudgetExceeded) as e:
        raise HTTPException(status_code=502, detail=str(e))
    finally:
        conn.close()


# -------------------------------------------------------------------- ask --

_ASK_SCHEMA_TEXT = (
    "CREATE TABLE customers (miu_id TEXT PRIMARY KEY, site_id TEXT, "
    "account_number TEXT, premise_key TEXT, register_id TEXT, meter_number TEXT, "
    "meter_type TEXT, meter_size TEXT, meter_manufacturer TEXT, dials TEXT, "
    "multiplier TEXT, unit_of_measure TEXT, cycle_route TEXT, synced_at TEXT);\n"
    "CREATE TABLE water_usage (site_id TEXT, miu_id TEXT, meter_number TEXT, "
    "reading_date TEXT, consumption REAL, consumption_with_multiplier REAL, "
    "synced_at TEXT);\n"
    "-- Name/address/phone/email from the billing system (not from Neptune).\n"
    "-- Join to customers/water_usage via meter_id = miu_id.\n"
    "CREATE TABLE customer_billing (meter_id TEXT PRIMARY KEY, account_number TEXT, "
    "customer_name TEXT, location TEXT, location_no TEXT, parcel_id TEXT, "
    "primary_phone TEXT, secondary_phone TEXT, email_address TEXT);"
)


@app.post("/api/ask")
def ask(payload: dict, user=Depends(auth.require_role("global"))):
    question = (payload.get("question") or "").strip()
    if not question:
        raise HTTPException(status_code=400, detail="Ask a question.")

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="ANTHROPIC_API_KEY is not set in .env.")

    from anthropic import Anthropic

    ai_client = Anthropic(api_key=api_key)
    model = os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-5")

    sql_resp = ai_client.messages.create(
        model=model,
        max_tokens=500,
        system=(
            "You write a single read-only SQLite SELECT query to answer the "
            "user's question, given this schema:\n\n" + _ASK_SCHEMA_TEXT +
            "\n\nRespond with ONLY the SQL in a ```sql fenced code block. "
            "Never write INSERT/UPDATE/DELETE/DROP/ATTACH/PRAGMA. "
            "reading_date is an ISO datetime string; use date()/strftime() as needed."
        ),
        messages=[{"role": "user", "content": question}],
    )
    sql_text = sql_resp.content[0].text
    m = re.search(r"```sql\s*(.*?)```", sql_text, re.DOTALL) or re.search(r"```\s*(.*?)```", sql_text, re.DOTALL)
    sql = (m.group(1) if m else sql_text).strip().rstrip(";")

    if not re.match(r"(?is)^\s*select\b", sql) or re.search(
        r"(?i)\b(insert|update|delete|drop|alter|attach|pragma|create|replace)\b", sql
    ):
        return {"sql": sql, "error": "The generated query wasn't a safe read-only SELECT. Try rephrasing.", "answer": None, "rows": []}

    ro_conn = db.get_conn(readonly=True)
    try:
        result_df = pd.read_sql_query(sql, ro_conn)
    except Exception as e:
        return {"sql": sql, "error": f"Query failed: {e}", "answer": None, "rows": []}
    finally:
        ro_conn.close()

    answer_resp = ai_client.messages.create(
        model=model,
        max_tokens=500,
        messages=[{
            "role": "user",
            "content": (
                f"Question: {question}\n\nQuery result (CSV, up to 200 rows):\n"
                f"{result_df.head(200).to_csv(index=False)}\n\n"
                "Answer the question in plain language based on this data."
            ),
        }],
    )

    return {
        "sql": sql,
        "error": None,
        "answer": answer_resp.content[0].text,
        "rows": _records(result_df.head(200)),
        "row_count": len(result_df),
    }
