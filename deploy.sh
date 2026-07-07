#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/var/www/npo-polet-next2"
cd "$APP_DIR"

echo "→ Fetching latest changes"
git fetch origin main
git reset --hard origin/main

echo "→ Building and restarting containers"
docker compose -f docker-compose.prod.yml build app
docker compose -f docker-compose.prod.yml up -d --remove-orphans

echo "→ Running Payload migrations"
docker compose -f docker-compose.prod.yml exec -T app node ./node_modules/.bin/payload migrate

echo "→ Cleaning up unused images"
docker image prune -f

echo "✅ Deploy finished: $(date)"