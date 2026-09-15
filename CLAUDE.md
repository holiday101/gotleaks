# GotLeaks AI — Project Context

Water-leak detection & resident-notification app for Providence City, built through
Claude Code sessions rather than hand-coded. Full project history lives in
`docs/gotleaks-ai/` (`project-overview.md`, `backlog.md`, `migration.md`) — read
those for anything beyond this summary.

## What this is

FastAPI backend + Next.js (TypeScript, App Router, Tailwind) frontend — a ground-up
rebuild of the original Streamlit app at `~/Neptune`, replacing only the UI layer
while reusing the database and all data/business logic unchanged. Started
2026-09-13.

## Critical shared state — read before touching data code

- This backend reads the SAME live SQLite database Neptune uses (`neptune.db`,
  ~2.9GB), via the `DB_PATH` env var. Never copy it — it would go stale immediately.
- Neptune's production cron timers (`neptune-sync.timer`, `neptune-backfill.timer`
  on the EC2 server) keep syncing that database independently of this app. This
  rebuild must not duplicate that work — any sync call here is gated behind
  `NEPTUNE_ALLOW_SYNC`.
- `neptune_client.py`, `neptune_db.py`, `neptune_sync.py` in `backend/app/` are
  copied verbatim from Neptune (pure data logic, no Streamlit dependency) — keep
  them in sync with Neptune's copies if a bug gets fixed in one place.

## Status (as of 2026-09-15)

**Deployed to production.** Feature-complete, all tabs ported (leaderboard,
customers, continuous users, map, manage users, sync & backfill, ask-AI), live at
`https://membergolfonline.com/water/` on the EC2 server, serving from `master` at
`a99e9ef`. `gotleaks-backend.service` / `gotleaks-frontend.service` are installed
and active; nginx's `/water/` location block points at them; `neptune-water.service`
(the old Streamlit app) is stopped and disabled. `neptune-sync.timer` /
`neptune-backfill.timer` were left running untouched throughout, as intended.

Full runbook (now historical): `deploy/PRODUCTION_CUTOVER.md`.

## Repo layout

- `backend/app/` — FastAPI app (auth, queries, sync endpoints, ask-AI)
- `frontend/` — Next.js app, one page per tab (`/`, `/customers`,
  `/continuous-users`, `/meters/[miu_id]`, `/map`, `/users`, `/sync`, `/ask`,
  `/login`)
- `deploy/` — systemd unit files, nginx config, cutover runbook

## Next features to consider (not yet built)

- Resident notification: daily "yesterday's usage" email digest, with multi-select
  recipient UI — the first concrete step toward actually notifying residents.
- Resident-facing consumption portal (distinct from the internal
  viewer/admin/global roles).
- Building-size zone data (infrastructure already built, no data source imported
  yet — needs a county assessor "improvements" file from Jared).
- A unified cross-category leaderboard, including "usage vs. neighborhood average"
  as its own sortable metric — flagged in the backlog as the sharpest unbuilt
  signal.
