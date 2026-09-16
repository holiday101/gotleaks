"""Storage for the resident-notification feature (email template + send log).

Deliberately its OWN sqlite file, separate from neptune.db: neptune_db.py is
copied verbatim from Neptune and must stay that way (see CLAUDE.md), and
neptune.db already takes writes from Neptune's own sync/backfill cron timers
independently of this app. Notification state is GotLeaks-only, so it lives
in a small file this app owns outright instead of adding a second writer to
that shared 2.9GB database.
"""
from __future__ import annotations

import os
import sqlite3
from datetime import datetime, timezone

NOTIFICATIONS_DB_PATH = os.environ.get(
    "NOTIFICATIONS_DB_PATH",
    os.path.join(os.path.dirname(__file__), "..", "data", "gotleaks.db"),
)

DEFAULT_TEMPLATE_NAME = "leak_notice"

# Seeded from Providence City's own leak-notice letter, with the source
# document's [Bracket] placeholders translated to this app's {{tag}} syntax
# (see UPLOAD_FIELD_MAP in email_render.py for that translation table).
_DEFAULT_SUBJECT = "Possible Water Leak Identified at {{service_address}}"
_DEFAULT_BODY_HTML = """
<p>{{letter_date}}</p>
<p>{{resident_name}}<br>{{service_address}}</p>
<p><strong>RE: Possible Water Leak Identified at {{service_address}}</strong></p>
<p>Dear {{resident_name}},</p>
<p>Providence City's Public Works Department regularly reviews water meter data from across the
city's water system to look for continuous water flow &mdash; water moving nonstop, hour after
hour, rather than the on-and-off pattern typical of normal household use. During a recent review,
the meter serving your property recorded a sustained, continuous flow over the past 7 days.</p>
<ul>
<li>Water Use, Prior 7 Days: <strong>{{prior_7day_usage_gal}} gallons</strong></li>
<li>Continuous Flow Rate: <strong>{{continuous_flow_gph}} gallons/hour</strong></li>
<li>Estimated 7-Day Leak Volume: <strong>{{estimated_leak_gal}} gallons</strong></li>
</ul>
<p>This estimate is based on your recorded meter data and is provided to help you investigate
further. It is not a bill or a formal notice of violation. A flagged pattern does not always mean
there is a leak &mdash; it can also result from irrigation, filling a pool or hot tub, guests in
the home, or other higher-than-usual but intentional use.</p>
<p><strong>What you can check</strong></p>
<ul>
<li>Toilets: listen or look for water trickling into the bowl, or add a few drops of food coloring
to the tank and check the bowl after 10 minutes without flushing.</li>
<li>Faucets, hose bibs, and water softener: check for dripping or continuous flow.</li>
<li>Irrigation or sprinkler system: check for broken heads, stuck valves, or a controller running
longer or more often than intended.</li>
<li>Service line: a soft or unusually green patch of ground between the meter and the house can
indicate an underground leak.</li>
<li>Meter check: with all water fixtures inside and outside the home turned off, watch the small
leak indicator (triangle or dial) on the water meter. If it is moving, water is flowing somewhere
on your side of the meter.</li>
</ul>
<p>Leaks on the customer side of the meter are the property owner's responsibility to locate and
repair. If you have questions about this notice or would like help interpreting your meter data,
please contact Providence City Utility Billing at (435) 752-9441 or visit
www.providencecity.com.</p>
<p>Thank you for helping us conserve water and keep utility costs down for all Providence City
residents.</p>
<p>Sincerely,<br>{{sender_name}}</p>
""".strip()


def get_conn() -> sqlite3.Connection:
    os.makedirs(os.path.dirname(NOTIFICATIONS_DB_PATH), exist_ok=True)
    conn = sqlite3.connect(NOTIFICATIONS_DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS email_templates (
            name        TEXT PRIMARY KEY,
            subject     TEXT NOT NULL,
            body_html   TEXT NOT NULL,
            updated_at  TEXT NOT NULL,
            updated_by  TEXT
        );

        CREATE TABLE IF NOT EXISTS notification_log (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            miu_id          TEXT NOT NULL,
            recipient_email TEXT NOT NULL,
            template_name   TEXT NOT NULL,
            subject         TEXT NOT NULL,
            merge_data      TEXT NOT NULL,
            status          TEXT NOT NULL,
            error           TEXT,
            provider_id     TEXT,
            sent_by         TEXT,
            sent_at         TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_notification_log_miu ON notification_log(miu_id);
        """
    )
    conn.commit()
    return conn


def get_template(conn: sqlite3.Connection, name: str = DEFAULT_TEMPLATE_NAME) -> dict:
    row = conn.execute("SELECT * FROM email_templates WHERE name = ?", (name,)).fetchone()
    if row:
        return dict(row)
    return {
        "name": name,
        "subject": _DEFAULT_SUBJECT,
        "body_html": _DEFAULT_BODY_HTML,
        "updated_at": None,
        "updated_by": None,
    }


def save_template(
    conn: sqlite3.Connection, subject: str, body_html: str, updated_by: str | None, name: str = DEFAULT_TEMPLATE_NAME
) -> dict:
    updated_at = datetime.now(timezone.utc).isoformat()
    conn.execute(
        """
        INSERT INTO email_templates (name, subject, body_html, updated_at, updated_by)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(name) DO UPDATE SET
            subject = excluded.subject,
            body_html = excluded.body_html,
            updated_at = excluded.updated_at,
            updated_by = excluded.updated_by
        """,
        (name, subject, body_html, updated_at, updated_by),
    )
    conn.commit()
    return get_template(conn, name)


def log_notification(
    conn: sqlite3.Connection,
    *,
    miu_id: str,
    recipient_email: str,
    template_name: str,
    subject: str,
    merge_data_json: str,
    status: str,
    error: str | None,
    provider_id: str | None,
    sent_by: str | None,
) -> None:
    conn.execute(
        """
        INSERT INTO notification_log
            (miu_id, recipient_email, template_name, subject, merge_data, status, error, provider_id, sent_by, sent_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            miu_id,
            recipient_email,
            template_name,
            subject,
            merge_data_json,
            status,
            error,
            provider_id,
            sent_by,
            datetime.now(timezone.utc).isoformat(),
        ),
    )
    conn.commit()


def list_recent_notifications(conn: sqlite3.Connection, limit: int = 100) -> list[dict]:
    rows = conn.execute(
        "SELECT * FROM notification_log ORDER BY sent_at DESC LIMIT ?", (limit,)
    ).fetchall()
    return [dict(r) for r in rows]
