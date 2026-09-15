# GotLeaks Migration — FastAPI + Next.js Rebuild

Started 2026-09-13. Ground-up rebuild of the Streamlit app (`~/Neptune`) as a new
project in `~/GotLeaks` on Jared's Mac, replacing the UI layer while reusing the
database and all data/business logic.

**Status as of 2026-09-15: deployed to production**, live at
`https://membergolfonline.com/water/`, serving from `master` at `a99e9ef`. The
cutover in "What's left" below (originally written for a cloud session that
couldn't reach the EC2 server over SSH) was completed from a local session with
working SSH access — see "Cutover completed" below.

## Why

Two pains drove this: Streamlit's whole-script-rerun execution model (fights
caching at every step — the Neptune app needed several rounds of precomputation
and `@st.cache_data` workarounds just to stay fast) and a UI ceiling on how
polished an interactive leaderboard/map/comparison view can get inside
Streamlit's widget set. Residents will eventually need their own logins (not
just staff — see `project-overview.md`'s Gaps section), and Streamlit has no
real per-user session/auth model, which made a proper backend+frontend split
worth the migration cost. Full reasoning was given directly to Jared in-chat;
this doc tracks status, not the original argument.

**Recommended and chosen architecture:** FastAPI backend + Next.js
(TypeScript, App Router, Tailwind) frontend. Chosen over Python-only
alternatives (Reflex, NiceGUI) specifically because this whole project is
built through Claude sessions rather than Jared hand-coding, and
FastAPI+React is the best-documented, most reliable combination for that.

## What carries over vs. what's rebuilt

**Carries over unchanged, nothing duplicated:**
- The database. GotLeaks' backend points `DB_PATH` at the SAME live
  `neptune.db` the Neptune checkout and production server use (it's
  2.9GB — copying it would go stale immediately). `neptune_db.py`'s
  `DB_PATH` was changed from a hardcoded relative path to read from an
  env var (falls back to the old relative default), so this is the only
  edit made to a copied file.
- `neptune_client.py`, `neptune_db.py`, `neptune_sync.py` — copied
  verbatim into `backend/app/`, since they were already pure data logic
  with no Streamlit dependency. `backend/app/__init__.py` adds itself to
  `sys.path` so these files' own unqualified sibling imports (`import
  neptune_db`, written for Neptune's flat layout) keep working unmodified
  now that they live inside a package.
- The production sync pipeline. `neptune-sync.timer` / `neptune-backfill.timer`
  on the EC2 server run `sync_daily.py` / `backfill_once.py` completely
  independently of any UI — nothing about this rebuild touches or needs to
  touch that, and the cutover runbook explicitly leaves both timers running.
- All the leak-detection logic built during this engagement: the
  precomputed `meter_leak_status` table, the 3-hour rolling floor,
  lot-size zones, nearby-meter comparison — ported as SQL into
  `backend/app/queries.py`.

**Not touched, staying live:** `~/Neptune` (the Streamlit checkout) and the
EC2 server's sync timers. `neptune-water.service` (the Streamlit web process)
is the one piece the cutover runbook does retire, once GotLeaks is confirmed
working — see `deploy/PRODUCTION_CUTOVER.md`.

**Rebuilt:** the entire UI, now with full tab parity — see below.

## Status as of 2026-09-15 (feature-complete session)

**Backend (`backend/`)** — FastAPI app, all endpoints implemented and tested
against the real database:
- `GET /health`
- `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me` —
  itsdangerous-signed httpOnly cookie session, no new DB table. Three-tier
  role ladder (viewer/admin/global) reused unchanged from `app_users`
  (`neptune_db.verify_user_password`/`create_user`/etc.). `NEPTUNE_PUBLIC_MODE`
  off (default, local/private use) makes every request a synthetic "global"
  user with no login prompt, exactly matching the Streamlit app's behavior.
- `GET /api/usage/leaderboard`, `GET /api/continuous-users`,
  `GET /api/meters/{id}/usage`, `GET /api/meters/{id}/neighbors` — unchanged
  from the first session.
- `GET /api/customers` — Customers tab, with the same filter-string search.
- `GET /api/map/parcels`, `GET /api/map/meters` — Map tab: leak-colored
  parcel polygons + GIS-surveyed meter points, flattened the same way the
  Streamlit pydeck map needed.
- `GET /api/users`, `POST /api/users`, `POST /api/users/{id}/active` —
  Manage Users tab, same admin/global create-role rules and
  last-global-can't-deactivate guard.
- `GET /api/sync/status`, `POST /api/sync/customers`,
  `POST /api/sync/recent-usage`, `POST /api/sync/backfill` — Sync & Backfill
  tab, gated by `NEPTUNE_ALLOW_SYNC` same as before.
- `POST /api/ask` — Ask AI tab, same NL-question → read-only-SQL → summary
  pipeline, with the same safety checks (SELECT-only regex gate, read-only
  SQLite connection).

One new file: `backend/app/auth.py` (session signing + `require_role()`
FastAPI dependency). `main.py` grew substantially but follows the same
pattern as the first session's four endpoints.

**Frontend (`frontend/`)** — every tab now has a page:
- `/` — Water Usage leaderboard, now with a lot-zone filter and click-through
  to meter detail.
- `/customers`, `/continuous-users` — straight ports, sortable via URL
  params, phone/email columns included.
- `/meters/[miu_id]` — shared detail view (usage chart via a small inline-SVG
  component, no new chart dependency, + the nearby-meter comparison) reused
  from every leaderboard's row click, matching the Streamlit app's shared
  `_render_usage_chart` pattern.
- `/map` — deck.gl (`@deck.gl/core`/`react`/`layers`), no basemap needed
  (matches `map_style=None` in the original), parcels + GIS meter dots with
  hover tooltips.
- `/users`, `/sync`, `/ask` — Manage Users, Sync & Backfill, Ask AI, each
  gated to admin/global/global respectively, each with a `Locked` message
  for under-privileged sessions (matching `_locked_message` in the original).
- `/login`, plus `middleware.ts` (redirects to login when `NEXT_PUBLIC_PUBLIC_MODE`
  is on and no session cookie is present) and `Nav.tsx` (role-aware link
  list + logout, mirrors the Streamlit sidebar).

Full stack was tested end-to-end (backend + a from-scratch build of the
frontend, run together, every page and API route hit with curl against the
real database) — all clean, no runtime errors. `npm run build` and
`npx tsc --noEmit` both pass. Two harmless ESLint `react-hooks/set-state-in-effect`
warnings remain on the auto-refreshing Sync/Users pages (a standard
fetch-on-mount pattern the newer lint rule flags conservatively) — not a
functional bug, not addressed.

**Production-readiness work done, not yet run:**
- `next.config.ts` supports `NEXT_BASE_PATH` so the app can be served at
  `membergolfonline.com/water/` (same URL as the Streamlit app) instead of a
  new subdomain — set via `frontend/.env.production` on the server only,
  local dev is unaffected.
- `frontend/src/lib/api.ts` splits client-side vs. server-side (SSR) backend
  URLs (`NEXT_PUBLIC_API_URL` vs. `BACKEND_INTERNAL_URL`) — a real bug caught
  during this session before it could hit production: without the split,
  server-rendered pages would have tried to fetch a relative path with no
  server-side meaning.
- `deploy/gotleaks-backend.service`, `deploy/gotleaks-frontend.service`,
  `deploy/nginx-water-location.conf`, `deploy/deploy-gotleaks.sh`,
  `deploy/PRODUCTION_CUTOVER.md` — full runbook for the actual cutover.

## What's left (all require Jared's own terminal)

This session's network cannot reach the EC2 server over SSH at all (tested
directly — raw TCP connect and a proxied SSH attempt both failed) and cannot
run local git commands past a filesystem quirk on the device-bridge mount
(individual commands were worked around, but this isn't reliable enough to
lean on repeatedly) — so from here on, `deploy/PRODUCTION_CUTOVER.md` is the
literal step-by-step:

1. Push GotLeaks to a new GitHub remote (doesn't have one yet).
2. First-time server setup: clone, venv/npm install, write `.env` /
   `.env.production` with real production values (`SECRET_KEY`,
   `NEPTUNE_PUBLIC_MODE=true`, seed admin login, `DB_PATH` pointed at the
   shared database, `NEPTUNE_ALLOW_SYNC=false` so it doesn't double-sync
   against Neptune's own cron timers).
3. Install and start the two systemd services.
4. Swap the server's nginx `/water/` location block for GotLeaks' (the repo
   has the new block ready; Jared needs to paste the *current* config back
   so the exact diff can be worked out, since this session has never seen
   it).
5. Confirm the site works, then stop/disable `neptune-water.service`
   (Streamlit) — leaving the sync timers running untouched.

## Cutover completed (2026-09-15)

All five steps from `deploy/PRODUCTION_CUTOVER.md` are done:

1. Pushed to `github.com/holiday101/gotleaks`.
2. Server setup done: repo cloned to `~/gotleaks`, backend venv + frontend
   `node_modules` installed, `backend/.env` and `frontend/.env.production`
   written with real production values.
3. `gotleaks-backend.service` / `gotleaks-frontend.service` installed and
   active (verified `GET /health` → 200, frontend → 200 on the login page).
4. Nginx's `/water/` block swapped from Streamlit's `proxy_pass
   http://127.0.0.1:8501` to GotLeaks' backend (`:8000`, under
   `/water/api/`) and frontend (`:3000`, under `/water`) — confirmed live at
   `https://membergolfonline.com/water/login` (200) and
   `/water/api/auth/me` (401, expected when logged out).
5. `neptune-water.service` stopped and disabled. `neptune-sync.timer` /
   `neptune-backfill.timer` confirmed still active and untouched.

## Next steps to consider (post-cutover)

- Decide whether to eventually retire Neptune's own cron scripts in favor of
  `backend/scripts/`'s copies (currently both exist; only Neptune's actually
  run). Not part of this cutover.
- Everything in `backlog.md` that's about new features (resident
  notifications, building-size zone data, etc.) rather than migration parity
  — this doc was strictly about reaching parity plus deployment.
