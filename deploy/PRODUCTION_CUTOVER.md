# Production cutover -- GotLeaks replacing the Streamlit app

**Status: completed 2026-09-15.** All five steps below were carried out (from
a local session with working SSH access, unlike the cloud sandbox this doc
was originally written for) and verified live at
`https://membergolfonline.com/water/`. `neptune-water.service` is stopped and
disabled; the sync timers were left running throughout. See
`docs/gotleaks-ai/migration.md`'s "Cutover completed" section for the
verification detail. Kept below as a reference for future re-deploys of this
kind, not as an outstanding task list.

This session (a cloud sandbox linked to your Mac) could build, test, and
commit everything, but it cannot reach the EC2 server over SSH -- that
network path is blocked from here regardless of credentials. Everything
below has to run from your own Mac Terminal. Paste output back and I can
keep guiding you through any step.

## What's already done (this session)

- Backend: session auth, Customers/Map/Manage Users/Sync & Backfill/Ask AI
  endpoints -- full parity with the Streamlit app. Tested end-to-end against
  the real database.
- Frontend: every remaining page (Continuous Users, Customers, Map via
  deck.gl, Manage Users, Sync & Backfill, Ask AI, login, meter detail),
  role-gated nav, middleware. Built and smoke-tested successfully.
- `next.config.ts` now supports `NEXT_BASE_PATH` so the app can be served at
  `membergolfonline.com/water/` (same URL the Streamlit app used) instead of
  a new subdomain.
- `deploy/gotleaks-backend.service`, `deploy/gotleaks-frontend.service`,
  `deploy/nginx-water-location.conf`, `deploy/deploy-gotleaks.sh` -- ready to
  install on the server.
- Committed locally as `b66200d` on `master`. **Not pushed anywhere yet** --
  GotLeaks has no git remote configured.

## One thing to decide first

Your existing `neptune-sync.timer` / `neptune-backfill.timer` on the server
keep the shared database fresh, completely independent of which app serves
the UI. **This cutover does not touch them** -- they keep running exactly as
they are. GotLeaks's own Sync & Backfill page exists but should stay
disabled in production (`NEPTUNE_ALLOW_SYNC=false` in its `.env`, same as
your Neptune checkout's local `.env` today) so nothing double-syncs against
Neptune's shared 500-calls/day budget. Retiring the old scripts in favor of
GotLeaks's copies is a separate future decision, not part of this cutover.

## Step 1 -- push GotLeaks to GitHub (one-time)

From your Mac:

```bash
cd ~/GotLeaks
git status   # should be clean, on master, at commit b66200d
```

Create a new empty repo on GitHub (e.g. `holiday101/gotleaks`, matching how
`neptune-water` is named), then:

```bash
git remote add origin https://github.com/holiday101/gotleaks.git
git push -u origin master
```

## Step 2 -- first-time server setup

SSH in and clone it:

```bash
ssh -i ~/.ssh/my-ec2-key.pem ubuntu@54.226.186.201
git clone https://github.com/holiday101/gotleaks.git ~/gotleaks
cd ~/gotleaks/backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

Create `~/gotleaks/backend/.env` (copy from `.env.example`, then fill in):
- Same `NEPTUNE_*` credentials as the server's existing Neptune `.env`
- `NEPTUNE_ALLOW_SYNC=false` (see above)
- `DB_PATH=/home/ubuntu/neptune-water/data/neptune.db` (point at the SAME
  file the Streamlit app and cron timers use -- confirm the exact path with
  `cat ~/neptune-water/.env | grep -i db` or check `neptune_db.py`'s default
  if `DB_PATH` isn't set there)
- `NEPTUNE_PUBLIC_MODE=true` (this is the public server)
- `SECRET_KEY=` -- generate with `python3 -c "import secrets; print(secrets.token_hex(32))"`
- `COOKIE_SECURE=true` (served over https)
- `NEPTUNE_SEED_GLOBAL_EMAIL` / `NEPTUNE_SEED_GLOBAL_PASSWORD` -- your first
  login; pick a real password, you can change it via the Manage Users page
  after logging in once
- `CORS_ORIGINS=https://membergolfonline.com` (belt-and-suspenders -- the
  production frontend calls same-origin through nginx, not cross-origin, so
  this mostly matters if you ever call the API directly)

Then the frontend:

```bash
cd ~/gotleaks/frontend
npm install
```

Create `~/gotleaks/frontend/.env.production` (copy from
`.env.production.example` -- the three values there are already correct,
nothing to fill in) then:

```bash
npm run build
```

## Step 3 -- install the systemd services

```bash
sudo cp ~/gotleaks/deploy/gotleaks-backend.service /etc/systemd/system/
sudo cp ~/gotleaks/deploy/gotleaks-frontend.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now gotleaks-backend.service
sudo systemctl enable --now gotleaks-frontend.service
sudo systemctl status gotleaks-backend.service gotleaks-frontend.service
```

Sanity-check both respond locally before touching nginx:

```bash
curl -s http://127.0.0.1:8000/health
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/water/
```

## Step 4 -- nginx cutover

Find the current config:

```bash
sudo nginx -T | less
```

or

```bash
ls /etc/nginx/sites-enabled/
```

Paste me the `server { }` block for `membergolfonline.com` (redact nothing
sensitive is normally in there, but check) and I'll give you the exact
diff -- it likely has a `location /water/ { proxy_pass
http://127.0.0.1:8501; ... }` block (Streamlit's default port) with
WebSocket upgrade headers that needs to be replaced with the two location
blocks in `deploy/nginx-water-location.conf`.

```bash
sudo nginx -t          # validate before reloading
sudo systemctl reload nginx
```

Then check `https://membergolfonline.com/water/` in a browser -- you should
see the GotLeaks login page (or the app directly, if `NEPTUNE_PUBLIC_MODE`
ends up false, which it shouldn't for a public server).

## Step 5 -- retire the old Streamlit service (once confirmed working)

```bash
sudo systemctl stop neptune-water.service
sudo systemctl disable neptune-water.service
```

Leave `neptune-sync.timer` and `neptune-backfill.timer` running -- do not
stop or disable those.

## Ongoing deploys

Once set up, `deploy/deploy-gotleaks.sh` (run from your Mac, same pattern as
Neptune's `deploy.sh`) does the git pull + rebuild + restart + health check
for future changes.
