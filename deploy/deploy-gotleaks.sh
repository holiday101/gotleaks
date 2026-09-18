#!/bin/bash
set -euo pipefail

# Run this FROM YOUR MAC (same pattern as Neptune's deploy.sh) -- it SSHes
# to the server and does the work there. Requires GotLeaks to already be
# pushed to a git remote the server can pull from (see
# deploy/PRODUCTION_CUTOVER.md for the one-time setup).

SSH_HOST="ubuntu@54.226.186.201"
SSH_KEY="$HOME/.ssh/my-ec2-key.pem"
REMOTE_DIR="/home/ubuntu/gotleaks"
HEALTH_URL="https://membergolfonline.com/water/"

echo "Deploying to $SSH_HOST..."

ssh -i "$SSH_KEY" "$SSH_HOST" bash -s << ENDSSH
set -euo pipefail
cd "$REMOTE_DIR"

echo "-- Pulling latest code..."
git pull --ff-only origin master

echo "-- Backend: installing dependencies..."
cd backend
.venv/bin/pip install -q -r requirements.txt
cd ..

echo "-- Frontend: installing dependencies and building..."
cd frontend
npm install
npm run build
cd ..

echo "-- Restarting services..."
sudo -n systemctl restart gotleaks-backend.service
sudo -n systemctl restart gotleaks-frontend.service
sleep 2
sudo -n systemctl is-active gotleaks-backend.service
sudo -n systemctl is-active gotleaks-frontend.service

echo "Deploy complete."
ENDSSH

echo "-- Health check..."
sleep 2
CODE=$(curl -sSL -o /dev/null -w "%{http_code}" --max-time 15 "$HEALTH_URL")
if [ "$CODE" = "200" ]; then
  echo "$HEALTH_URL responded HTTP $CODE"
else
  echo "$HEALTH_URL responded HTTP $CODE -- check server logs"
  exit 1
fi
