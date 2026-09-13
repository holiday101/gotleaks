"""GotLeaks API -- FastAPI backend replacing the Streamlit app's query code.

Reuses neptune_db.py / neptune_sync.py / neptune_client.py unchanged from the
Neptune project; this file and queries.py are the only new code. Points at
the SAME live SQLite database as the Neptune checkout and the production
server (see DB_PATH in .env) -- nothing here duplicates or migrates data.
"""
from __future__ import annotations

import os

from dotenv import load_dotenv

load_dotenv()  # must run before importing app.neptune_db, which reads DB_PATH at import time

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from app import neptune_db as db
from app import queries

app = FastAPI(title="GotLeaks API")


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

origins = [o.strip() for o in os.environ.get("CORS_ORIGINS", "").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok", "db_path": db.DB_PATH}


@app.get("/api/usage/leaderboard")
def usage_leaderboard(zone: list[str] | None = Query(default=None)):
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
def meter_usage(miu_id: str, since: str | None = None, until: str | None = None):
    conn = db.get_conn(readonly=True)
    try:
        usage = queries.get_meter_usage(conn, miu_id, since=since, until=until)
        if usage.empty:
            raise HTTPException(status_code=404, detail="No usage data for this meter/window")
        return _records(usage)
    finally:
        conn.close()


@app.get("/api/meters/{miu_id}/neighbors")
def meter_neighbors(miu_id: str, n: int = Query(default=10, ge=1, le=100)):
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
