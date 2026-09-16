"""Query functions for the GotLeaks API.

These are straight ports of the SQL that used to live inline inside
app.py's Streamlit tab code (see the Neptune repo's Water Usage tab) --
same queries, same precomputed meter_leak_status table, just returned as
JSON-ready data instead of rendered directly into a Streamlit widget.
"""
from __future__ import annotations

import pandas as pd


def _hoa_predicate(name_col: str) -> str:
    """SQL predicate matching HOA/community accounts by a standalone "HOA"
    word -- not a substring, so it doesn't also catch surnames like "Hoang"
    or "Ochoa". An HOA's own parcel record is one small lot, which
    understates the many properties its master meter actually serves;
    bucketing it there by that literal parcel size makes it look like a
    tiny lot with an enormous leak instead of what it is: a large shared
    account that belongs in the top zone regardless of its own lot size."""
    col = f"UPPER({name_col})"
    return (
        f"({col} = 'HOA' OR {col} LIKE 'HOA %' OR {col} LIKE '% HOA' OR "
        f"{col} LIKE '% HOA %' OR {col} LIKE '% HOA,%')"
    )


_TOP_LOT_ZONE_SQL = "(SELECT zone FROM lot_size_zones ORDER BY zone DESC LIMIT 1)"
_TOP_LOT_ZONE_LABEL_SQL = "(SELECT label FROM lot_size_zones ORDER BY zone DESC LIMIT 1)"
_IS_HOA_BILLING_NAME = _hoa_predicate("b.customer_name")

CUSTOMERS_WITH_ZONES_SQL = f"""
    SELECT c.account_number, b.customer_name, b.location, b.primary_phone,
           b.secondary_phone, b.email_address, c.meter_number, c.miu_id,
           c.cycle_route, c.meter_type, c.meter_size, b.parcel_id,
           ROUND(p.area_sqft) AS lot_size_sqft,
           CASE WHEN {_IS_HOA_BILLING_NAME} THEN {_TOP_LOT_ZONE_SQL} ELSE lz.zone END AS lot_zone,
           CASE WHEN {_IS_HOA_BILLING_NAME} THEN {_TOP_LOT_ZONE_LABEL_SQL} ELSE lz.label END AS lot_zone_label,
           ROUND(p.building_sqft) AS building_sqft, bz.zone AS bldg_zone, bz.label AS bldg_zone_label
    FROM customers c
    LEFT JOIN customer_billing b ON b.meter_id = c.miu_id
    LEFT JOIN meter_parcels mp ON mp.meter_id = c.miu_id
    LEFT JOIN parcels p ON p.parcel_id = mp.parcel_id
    LEFT JOIN lot_size_zones lz
        ON p.area_sqft >= lz.min_sqft
       AND (lz.max_sqft IS NULL OR p.area_sqft < lz.max_sqft)
    LEFT JOIN building_size_zones bz
        ON p.building_sqft >= bz.min_sqft
       AND (bz.max_sqft IS NULL OR p.building_sqft < bz.max_sqft)
    ORDER BY c.account_number
"""


def get_leak_status_window(conn):
    """The trailing-7-day window meter_leak_status was last computed for, or
    None if it hasn't been computed yet (fresh install / before first sync)."""
    row = pd.read_sql_query(
        "SELECT window_start, window_end FROM meter_leak_status LIMIT 1", conn
    )
    if row.empty:
        return None
    return {"window_start": row["window_start"].iloc[0], "window_end": row["window_end"].iloc[0]}


def get_usage_leaderboard(conn, zones: list[str] | None = None) -> pd.DataFrame:
    """Every meter with usage in the trailing 7 days, ranked by total gallons
    (highest first), with lot-size zone for filtering -- the same shape as
    the Water Usage tab's leaderboard in the Streamlit app."""
    weekly = pd.read_sql_query(
        "SELECT miu_id, reading_count, total_consumption FROM meter_leak_status "
        "WHERE total_consumption IS NOT NULL",
        conn,
    )
    customers_df = pd.read_sql_query(CUSTOMERS_WITH_ZONES_SQL, conn)
    board = weekly.merge(customers_df, on="miu_id", how="left")
    if board.empty:
        return board

    board["seven_day_avg"] = board["total_consumption"] / 7.0
    board["lot_zone_label"] = board["lot_zone_label"].fillna("No parcel match")

    if zones:
        board = board[board["lot_zone_label"].isin(zones)]

    return board.sort_values("total_consumption", ascending=False).reset_index(drop=True)


def get_continuous_users(conn, min_gph: float = 10.0, sort_by: str = "min_consumption") -> pd.DataFrame:
    """Meters with a zero-free week (>7 readings, zero_count==0) -- the same
    qualifying rule as the Continuous Users tab. sort_by is either
    'min_consumption' (raw floor) or 'roll3_min_consumption' (3-hr rolling
    floor); the threshold filter applies to whichever one is chosen."""
    if sort_by not in ("min_consumption", "roll3_min_consumption"):
        sort_by = "min_consumption"

    status = pd.read_sql_query("SELECT * FROM meter_leak_status", conn)
    qualifying = status[(status["zero_count"] == 0) & (status["reading_count"] > 7)]
    if qualifying.empty:
        return qualifying

    meta = pd.read_sql_query(
        "SELECT c.miu_id, c.meter_number, c.account_number, b.customer_name, "
        "       b.location AS address, b.primary_phone, b.secondary_phone, b.email_address "
        "FROM customers c LEFT JOIN customer_billing b ON b.meter_id = c.miu_id",
        conn,
    )
    merged = qualifying.merge(meta, on="miu_id", how="left")
    filtered = merged[merged[sort_by] >= min_gph]
    return filtered.sort_values(sort_by, ascending=False).reset_index(drop=True)


def get_meter_coords(conn) -> pd.DataFrame:
    """One row per meter with usage data AND a known lat/lon (from
    meter_parcels -- populated for 'geocoded'/'gis_survey' matches), for the
    nearby-meter comparison. Same HOA lot-zone override as
    CUSTOMERS_WITH_ZONES_SQL -- see _hoa_predicate."""
    return pd.read_sql_query(
        f"""
        SELECT c.miu_id, mp.lat, mp.lon, b.customer_name, b.location AS address,
               CASE WHEN {_IS_HOA_BILLING_NAME} THEN {_TOP_LOT_ZONE_SQL} ELSE lz.zone END AS lot_zone,
               CASE WHEN {_IS_HOA_BILLING_NAME} THEN {_TOP_LOT_ZONE_LABEL_SQL} ELSE lz.label END AS lot_zone_label
        FROM customers c
        JOIN meter_parcels mp ON mp.meter_id = c.miu_id AND mp.lat IS NOT NULL
        LEFT JOIN customer_billing b ON b.meter_id = c.miu_id
        LEFT JOIN parcels p ON p.parcel_id = mp.parcel_id
        LEFT JOIN lot_size_zones lz
            ON p.area_sqft >= lz.min_sqft
           AND (lz.max_sqft IS NULL OR p.area_sqft < lz.max_sqft)
        WHERE EXISTS (SELECT 1 FROM water_usage w WHERE w.miu_id = c.miu_id)
        """,
        conn,
    )


def get_meter_usage(
    conn, miu_id: str, since: str | None = None, until: str | None = None, days: int | None = None
) -> pd.DataFrame:
    """Raw hourly usage for one meter, optionally windowed. Mirrors
    _load_meter_usage in the Streamlit app. `days`, like get_daily_usage and
    get_window_totals_for_meters, anchors the window to this meter's own
    last reading rather than "now" (sync can lag behind real time by a
    day or more). `since`/`until` take precedence when both are given, for
    callers that already have an explicit range."""
    if since and until:
        return pd.read_sql_query(
            "SELECT reading_date, consumption_with_multiplier AS gallons_used "
            "FROM water_usage WHERE miu_id = ? AND reading_date > ? AND reading_date <= ? "
            "ORDER BY reading_date",
            conn, params=(miu_id, since, until),
        )
    if days is not None:
        row = conn.execute(
            "SELECT MAX(reading_date) AS m FROM water_usage WHERE miu_id = ?", (miu_id,)
        ).fetchone()
        if not row or not row[0]:
            return pd.DataFrame(columns=["reading_date", "gallons_used"])
        window_end = pd.Timestamp(row[0])
        window_start = window_end - pd.Timedelta(days=days)
        return pd.read_sql_query(
            "SELECT reading_date, consumption_with_multiplier AS gallons_used "
            "FROM water_usage WHERE miu_id = ? AND reading_date > ? AND reading_date <= ? "
            "ORDER BY reading_date",
            conn, params=(miu_id, window_start.isoformat(), row[0]),
        )
    return pd.read_sql_query(
        "SELECT reading_date, consumption_with_multiplier AS gallons_used "
        "FROM water_usage WHERE miu_id = ? ORDER BY reading_date",
        conn, params=(miu_id,),
    )


def get_meter_info(conn, miu_id: str) -> pd.DataFrame:
    """Customer/account info for one meter -- same join as
    CUSTOMERS_WITH_ZONES_SQL, filtered to a single miu_id, for the meter
    detail page header (customer name + address, not just the raw ID)."""
    return pd.read_sql_query(
        f"SELECT * FROM ({CUSTOMERS_WITH_ZONES_SQL}) WHERE miu_id = ?",
        conn, params=(miu_id,),
    )


def get_daily_usage(conn, miu_id: str, days: int) -> pd.DataFrame:
    """Per-day usage totals for one meter's trailing `days` window, anchored
    to that meter's own last reading (not "today") -- mirrors
    _cached_daily_usage in the Streamlit app. Lets the nearby-meter
    comparison's daily breakdown show which specific days drove the total,
    rather than just the window's average."""
    row = conn.execute(
        "SELECT MAX(reading_date) AS m FROM water_usage WHERE miu_id = ?", (miu_id,)
    ).fetchone()
    if not row or not row[0]:
        return pd.DataFrame(columns=["day", "gallons"])
    window_end = pd.Timestamp(row[0])
    window_start = window_end - pd.Timedelta(days=days)
    return pd.read_sql_query(
        "SELECT date(reading_date) AS day, SUM(consumption_with_multiplier) AS gallons "
        "FROM water_usage WHERE miu_id = ? AND reading_date > ? AND reading_date <= ? "
        "GROUP BY date(reading_date) ORDER BY day",
        conn, params=(miu_id, window_start.isoformat(), row[0]),
    )


def get_window_totals_for_meters(conn, miu_ids: tuple[str, ...], days: int) -> pd.DataFrame:
    """Live total consumption per meter over the trailing `days` window,
    anchored to the latest reading among the given meters -- mirrors
    _cached_window_totals_for_meters in the Streamlit app. Used for the
    nearby-meter comparison's Last week/Last month toggle; the precomputed
    meter_leak_status table only ever covers a fixed trailing week."""
    if not miu_ids:
        return pd.DataFrame(columns=["miu_id", "total_consumption"])
    placeholders = ",".join("?" for _ in miu_ids)
    row = conn.execute(
        f"SELECT MAX(reading_date) AS m FROM water_usage WHERE miu_id IN ({placeholders})",
        miu_ids,
    ).fetchone()
    if not row or not row[0]:
        return pd.DataFrame(columns=["miu_id", "total_consumption"])
    window_end = pd.Timestamp(row[0])
    window_start = window_end - pd.Timedelta(days=days)
    return pd.read_sql_query(
        f"SELECT miu_id, SUM(consumption_with_multiplier) AS total_consumption "
        f"FROM water_usage WHERE miu_id IN ({placeholders}) "
        f"AND reading_date > ? AND reading_date <= ? GROUP BY miu_id",
        conn, params=(*miu_ids, window_start.isoformat(), row[0]),
    )


def get_customers(conn, q: str | None = None) -> pd.DataFrame:
    """Same query the Water Usage leaderboard's join uses, but as its own
    endpoint -- the Customers tab's full account/meter/contact/zone list."""
    df = pd.read_sql_query(CUSTOMERS_WITH_ZONES_SQL, conn)
    if q:
        needle = q.lower()
        mask = df.apply(lambda r: needle in str(r.values).lower(), axis=1)
        df = df[mask]
    return df


def get_map_parcels(conn, threshold: float = 10.0) -> list[dict]:
    """Parcels matched via billing address (meter_parcels), colored by
    current leak status -- one dict per polygon RING (a MultiPolygon parcel
    contributes multiple rings), same flattening the Streamlit pydeck map
    used since the deck.gl runtime needs flat records, not nested geometry."""
    import json

    meter_parcels = pd.read_sql_query(
        """
        SELECT mp.meter_id, mp.parcel_id, mp.match_method, p.geometry,
               c.meter_number, b.customer_name
        FROM meter_parcels mp
        JOIN parcels p ON p.parcel_id = mp.parcel_id
        LEFT JOIN customers c ON c.miu_id = mp.meter_id
        LEFT JOIN customer_billing b ON b.meter_id = mp.meter_id
        """,
        conn,
    )
    status = pd.read_sql_query(
        "SELECT miu_id, min_consumption FROM meter_leak_status", conn
    ).set_index("miu_id")["min_consumption"]

    records = []
    for _, row in meter_parcels.iterrows():
        min_consumption = status.get(row["meter_id"])
        min_consumption = float(min_consumption) if min_consumption is not None and min_consumption == min_consumption else None
        is_leak = bool(min_consumption is not None and min_consumption >= threshold)
        label = row["customer_name"] if pd.notna(row["customer_name"]) else "(no billing match)"
        tooltip = f"{label} — meter {row['meter_number']}"
        if is_leak:
            tooltip += f" · continuous {min_consumption:.0f} gal/hr"
        try:
            geom = json.loads(row["geometry"])
        except (TypeError, ValueError):
            continue
        if geom.get("type") == "Polygon":
            rings = [geom["coordinates"][0]]
        elif geom.get("type") == "MultiPolygon":
            rings = [part[0] for part in geom["coordinates"]]
        else:
            continue
        color = _leak_color(min_consumption if is_leak else None, threshold)
        for ring in rings:
            records.append({
                "parcel_id": row["parcel_id"], "polygon": ring,
                "fill_color": color, "tooltip": tooltip, "is_leak": is_leak,
            })
    return records


def get_map_gis_meters(conn) -> list[dict]:
    """Surveyed meter-location points (red dots on the map), plus each
    point's matched parcel polygon -- for parcels the GIS survey matched
    that meter_parcels/billing never did (drawn in neutral blue)."""
    import json

    gis_meters = pd.read_sql_query(
        "SELECT meter_id, lat, lon, address, customer_name, parcel_id FROM gis_meters",
        conn,
    )
    points = gis_meters.replace({float("nan"): None}).where(gis_meters.notna(), None).to_dict(orient="records")

    already_drawn = {
        r[0] for r in conn.execute("SELECT DISTINCT parcel_id FROM meter_parcels").fetchall()
    }
    extra_parcels = pd.read_sql_query(
        """
        SELECT DISTINCT p.parcel_id, p.geometry
        FROM gis_meters g JOIN parcels p ON p.parcel_id = g.parcel_id
        WHERE g.parcel_id IS NOT NULL
        """,
        conn,
    )
    extra_records = []
    for _, row in extra_parcels.iterrows():
        if row["parcel_id"] in already_drawn:
            continue
        try:
            geom = json.loads(row["geometry"])
        except (TypeError, ValueError):
            continue
        if geom.get("type") == "Polygon":
            rings = [geom["coordinates"][0]]
        elif geom.get("type") == "MultiPolygon":
            rings = [part[0] for part in geom["coordinates"]]
        else:
            continue
        for ring in rings:
            extra_records.append({
                "parcel_id": row["parcel_id"], "polygon": ring,
                "fill_color": [70, 130, 220, 40],
                "tooltip": f"Parcel {row['parcel_id']} (GIS survey only, no billing match)",
                "is_leak": False,
            })

    return {"points": points, "extra_parcels": extra_records}


def _leak_color(min_consumption, threshold: float) -> list[int]:
    """Log-scaled yellow -> red for a leak's severity, blue for none --
    ported from the Streamlit app's _leak_color()."""
    import math

    if min_consumption is None or min_consumption != min_consumption or min_consumption < threshold:
        return [70, 130, 220, 90]
    t = min(1.0, math.log(min_consumption / threshold + 1) / math.log(20))
    r = 255
    g = int(220 * (1 - t))
    b = int(40 * (1 - t))
    return [int(r), int(g), int(b), 180]
