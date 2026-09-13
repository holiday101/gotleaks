# GotLeaks

Ground-up rebuild of the "Got Leaks AI" water-leak-detection app for
Providence City -- FastAPI backend + Next.js frontend, replacing the
Streamlit app in `~/Neptune`.

## Why this exists

The Neptune/Streamlit app hit two walls: the whole-script-rerun execution
model that fights caching at every step, and a UI ceiling on how polished
an interactive leaderboard/map/comparison view can get inside Streamlit's
widget set. With residents eventually needing their own logins (not just
staff), a real backend + frontend split is worth the migration cost.

## What carries over, what doesn't

**Carries over unchanged:**
- The database. `backend/app/neptune_db.py`'s `DB_PATH` points at the
  SAME live SQLite file the Neptune checkout and the production server
  use (see `backend/.env`) -- never a copy. It's 2.9GB and updated daily;
  duplicating it would go stale immediately.
- The data pipeline. `neptune_client.py` / `neptune_db.py` /
  `neptune_sync.py` are copied into `backend/app/` verbatim -- they were
  already pure data logic, no Streamlit dependency. The production sync
  (`neptune-sync.timer` / `neptune-backfill.timer` on the EC2 server)
  keeps running exactly as it does today, completely independent of
  whichever UI is reading the database. Nothing about this rebuild
  requires touching or moving that.
- All the leak-detection logic: the precomputed `meter_leak_status`
  table, the 3-hour rolling floor, lot-size zones, nearby-meter
  comparison -- all just SQL, ported into `backend/app/queries.py`.

**Being rebuilt:**
- The UI. `app.py` (Streamlit) is not reused -- `frontend/` is a fresh
  Next.js app.

## Layout

```
backend/
  app/              neptune_client.py, neptune_db.py, neptune_sync.py, queries.py
  scripts/          copies of the standalone cron scripts (sync_daily.py,
                    backfill_once.py, import_*.py) -- NOT yet wired to
                    replace what's running on the server
  main.py           FastAPI app
  .env              secrets + DB_PATH (gitignored)
frontend/           Next.js (TypeScript, App Router, Tailwind)
```

## Running locally

Backend:
```
cd backend
.venv/bin/python -m uvicorn main:app --reload --port 8000
```

Frontend:
```
cd frontend
npm run dev
```

`backend/.env`'s `DB_PATH` is set to the real path of the Neptune
checkout's database (`/Users/jaredholland/Neptune/data/neptune.db`) --
correct when running directly in Terminal on this Mac.
