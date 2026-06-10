#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="${APP_ROOT:-/srv/ai-concierge}"
BACKEND_DIR="${BACKEND_DIR:-$APP_ROOT/backend}"
ENV_FILE="${ENV_FILE:-/etc/ai-concierge/backend.env}"
RUN_SEED="${RUN_SEED:-0}"

if [ "$(id -u)" -eq 0 ]; then
  echo "Run this script as the app user, not root." >&2
  exit 1
fi

if [ ! -d "$BACKEND_DIR" ]; then
  echo "Backend directory not found: $BACKEND_DIR" >&2
  exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
  echo "Env file not found: $ENV_FILE" >&2
  exit 1
fi

cd "$BACKEND_DIR"
ln -sfn "$ENV_FILE" .env
npm ci
npx prisma generate
npm run build
npm run prisma:migrate:deploy

if [ "$RUN_SEED" = "1" ]; then
  npm run seed
fi

cat <<EOF
Backend build, Prisma generate, and migration deploy completed.

Restart the service:
  sudo systemctl restart ai-concierge-api
  sudo systemctl status --no-pager ai-concierge-api
EOF
