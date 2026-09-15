# Got Leaks AI — Project Overview

_Last updated 2026-09-10, based on the codebase in the `Neptune` folder on Jared's machine (`~/Neptune`)._

## Goal

An application for Providence City to:
1. Identify water leaks from meter data
2. Notify residents about leaks
3. Give residents the data they need to adjust consumption

## Current state

A working internal tool exists (Streamlit app, repo name "Neptune", app title "GotLeaks AI"). It covers leak *identification* and a data view residents/staff could act on, but does **not yet** send notifications to residents — see Gaps below.

### Data pipeline

- **Meters/accounts**: pulled from Neptune 360 SDK (`/api/v2/endpoints`) — no names/addresses/phone, just meter ↔ account_number ↔ premise_key. Stored in `customers` table.
- **Consumption history**: pulled from Neptune 360 SDK (`/api/v1/consumption`), per-meter. Stored in `water_usage`.
- **Real contact info** (name, address, phone, email): comes from a separate billing-system spreadsheet export, imported via `import_billing.py` into `customer_billing`, joined on `meter_id == miu_id`.
- **Parcel/GIS data**: county parcel GeoJSON (`import_gis.py`) geocoded via the free Census Bureau batch geocoder and matched to billing addresses (~83% match rate on first run). Upgraded further with the utility's own GPS-surveyed meter-location shapefile (`import_meter_locations.py`) via direct point-in-polygon matching (raised coverage to ~97%). Everything defaults/scopes to Providence specifically (verified ~1,700 of ~2,000 matched addresses were "Providence").
- Storage: local SQLite (`data/neptune.db`, gitignored).

### Rate limits & sync

Neptune caps the account at 500 API calls/day. The app enforces its own budget (`NEPTUNE_DAILY_CALL_BUDGET`, default 480) tracked in `api_call_log` (per-database, not per-site — so multiple checkouts syncing the same site can race each other against the real quota; mitigated by gating sync behind `NEPTUNE_ALLOW_SYNC`, which should only be `true` on the deployed server).

Three sync mechanisms:
- **Sync Customers** — cheap, run anytime.
- **Sync recent usage** — last few days, run daily via cron (`sync_daily.py`, `neptune-sync.timer` at 05:00 MDT) and also auto-triggered on login (throttled to once/30min across all sessions).
- **Historical backfill** — resumable, ~2 years of history, spends leftover daily budget each run and picks up where it left off (`backfill_once.py`, `neptune-backfill.timer` at 05:30 MDT). No-ops once complete.

### Leak detection

Defined as "continuous" usage: a meter with nonstop nonzero flow across a rolling week window. Severity uses the **lowest hourly reading** in the window as a conservative floor (a guaranteed minimum leak rate, not an estimate — log-scaled coloring since rates span single digits to very high values).

Surfaced in two UI places:
- **Continuous Users tab** — sortable/filterable table (default threshold 10 gal/hr, optional toggle down to 5 gal/hr), CSV export, shows "continuous since" timestamp.
- **Map tab** — parcels colored by leak status/severity (yellow→red), auto-fit to Providence's bounds, blue for parcels with no current leak or no billing match.

### Ask AI tab

Natural-language question → read-only SQL (rejects anything but a plain `SELECT`, runs against a read-only SQLite connection as a second guard) → results summarized in plain language. Only reads already-synced local data; never calls Neptune directly. Needs `ANTHROPIC_API_KEY`.

### Access / deployment

- `NEPTUNE_PUBLIC_MODE=true` requires per-user email/password login (for public deployment, e.g. `membergolfonline.com/water/`); `false` for local/private use.
- Three-tier roles: `viewer` (Customers / Water Usage / Continuous Users), `admin` (+ Manage Users), `global` (+ Sync & Backfill, Ask AI). Sync & Backfill additionally requires `NEPTUNE_ALLOW_SYNC=true` regardless of role.
- Passwords: salted PBKDF2-HMAC-SHA256, 200k iterations. Per-session lockout after 5 failed attempts (60s) — meant to be paired with rate limiting at the reverse proxy. No self-service password reset (no SMTP configured).
- First login bootstrapped via `NEPTUNE_SEED_GLOBAL_EMAIL`/`NEPTUNE_SEED_GLOBAL_PASSWORD`, inert after first use.

## Repo layout

| File | Purpose |
|---|---|
| `app.py` | Streamlit UI — Customers, Water Usage, Continuous Users, Map, Manage Users, Sync & Backfill, Ask AI |
| `neptune_client.py` | Auth + raw Neptune API calls, budget-enforced, retries on transient 5xx/timeout |
| `neptune_db.py` | SQLite schema, upserts, call log, resumable sync-state store |
| `neptune_sync.py` | Sync orchestration (customers, recent usage, backfill, ranked deep-dive) |
| `sync_daily.py` | Standalone daily cron script: customers + last 3 days usage |
| `backfill_once.py` | Standalone daily cron script: resumable historical backfill, no-ops once done |
| `import_billing.py` | Loads billing-system spreadsheet export → `customer_billing` |
| `import_gis.py` | Loads county parcel GeoJSON, geocodes, matches to parcels |
| `import_meter_locations.py` | Loads surveyed meter-location shapefile, upgrades parcel matches |
| `deploy.sh` | Git-based deploy script |

## Gaps / open questions (as of last review)

- **No resident-facing notifications yet.** No email/SMS/alert-sending code found. Leak data currently only surfaces inside the internal Streamlit dashboard (staff-facing), not pushed to residents — this is a named project goal not yet built.
- **No resident-facing consumption view.** The "give residents the data they need to adjust consumption" goal isn't yet served by a resident-facing surface — current tabs (Customers, Water Usage, Continuous Users, Map) read as internal/staff tooling behind the role system, not something a resident logs into.
- Parcel matching is ~97% but not 100% — some meters still unmatched to a parcel.
- Neptune's real 500 calls/day quota is shared account-wide but tracked per local database; only one checkout should ever run sync/backfill against a given site at a time.

## Next steps to consider

- Design/scope the resident notification mechanism (email/SMS, trigger conditions, opt-in/consent, message content).
- Design/scope a resident-facing view or portal (distinct from the internal `viewer`/`admin`/`global` roles) for consumption data.
