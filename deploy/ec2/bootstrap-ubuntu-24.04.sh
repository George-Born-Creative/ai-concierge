#!/usr/bin/env bash
set -euo pipefail

APP_USER="${APP_USER:-ai-concierge}"
APP_GROUP="${APP_GROUP:-$APP_USER}"
APP_ROOT="${APP_ROOT:-/srv/ai-concierge}"
CONFIG_DIR="${CONFIG_DIR:-/etc/ai-concierge}"
CONFIG_FILE="${CONFIG_FILE:-$CONFIG_DIR/backend.env}"
DB_NAME="${DB_NAME:-ai_concierge}"
DB_USER="${DB_USER:-ai_concierge}"
DB_PASSWORD="${DB_PASSWORD:-}"
NODE_VERSION="${NODE_VERSION:-22.22.3}"
NODE_ARCH="${NODE_ARCH:-x64}"
INSTALL_CERTBOT="${INSTALL_CERTBOT:-1}"

require_root() {
  if [ "$(id -u)" -ne 0 ]; then
    echo "Run this script as root." >&2
    exit 1
  fi
}

validate_identifier() {
  local label="$1"
  local value="$2"

  if [[ ! "$value" =~ ^[a-zA-Z_][a-zA-Z0-9_]*$ ]]; then
    echo "$label must match ^[a-zA-Z_][a-zA-Z0-9_]*$" >&2
    exit 1
  fi
}

escape_sql_literal() {
  printf '%s' "$1" | sed "s/'/''/g"
}

install_packages() {
  apt-get update
  apt-get install -y \
    build-essential \
    ca-certificates \
    curl \
    git \
    nginx \
    openssl \
    postgresql \
    postgresql-contrib \
    python3 \
    xz-utils

  if [ "$INSTALL_CERTBOT" = "1" ]; then
    apt-get install -y certbot python3-certbot-nginx
  fi
}

install_node() {
  local install_root="/usr/local/lib/nodejs"
  local dist="node-v${NODE_VERSION}-linux-${NODE_ARCH}"
  local archive="${dist}.tar.xz"
  local url="https://nodejs.org/dist/v${NODE_VERSION}/${archive}"
  local tmpdir

  if command -v node >/dev/null 2>&1; then
    local installed_major
    installed_major="$(node -p 'process.versions.node.split(".")[0]')"
    if [ "$installed_major" -ge 20 ]; then
      echo "Node $(node -v) already installed; keeping existing installation."
      return
    fi
  fi

  tmpdir="$(mktemp -d)"
  trap "rm -rf '$tmpdir'" EXIT

  curl -fsSL "$url" -o "$tmpdir/$archive"
  mkdir -p "$install_root"
  rm -rf "$install_root/$dist"
  tar -xJf "$tmpdir/$archive" -C "$install_root"
  ln -sfn "$install_root/$dist" "$install_root/current"
  ln -sfn "$install_root/current/bin/node" /usr/local/bin/node
  ln -sfn "$install_root/current/bin/npm" /usr/local/bin/npm
  ln -sfn "$install_root/current/bin/npx" /usr/local/bin/npx
  if [ -x "$install_root/current/bin/corepack" ]; then
    ln -sfn "$install_root/current/bin/corepack" /usr/local/bin/corepack
  fi
}

ensure_app_user() {
  if ! getent group "$APP_GROUP" >/dev/null 2>&1; then
    groupadd --system "$APP_GROUP"
  fi

  if ! id -u "$APP_USER" >/dev/null 2>&1; then
    useradd --system --create-home --gid "$APP_GROUP" --shell /bin/bash "$APP_USER"
  fi

  install -d -o "$APP_USER" -g "$APP_GROUP" "$APP_ROOT"
  chown -R "$APP_USER:$APP_GROUP" "$APP_ROOT"
  install -d -o root -g "$APP_GROUP" -m 750 "$CONFIG_DIR"

  if [ ! -f "$CONFIG_FILE" ]; then
    install -m 640 -o root -g "$APP_GROUP" /dev/null "$CONFIG_FILE"
  fi
}

configure_postgres() {
  local escaped_password
  escaped_password="$(escape_sql_literal "$DB_PASSWORD")"

  systemctl enable --now postgresql

  if runuser -u postgres -- psql -tAc "SELECT 1 FROM pg_roles WHERE rolname = '${DB_USER}'" | grep -q 1; then
    runuser -u postgres -- psql -v ON_ERROR_STOP=1 \
      -c "ALTER ROLE ${DB_USER} WITH LOGIN PASSWORD '${escaped_password}';"
  else
    runuser -u postgres -- psql -v ON_ERROR_STOP=1 \
      -c "CREATE ROLE ${DB_USER} LOGIN PASSWORD '${escaped_password}';"
  fi

  if ! runuser -u postgres -- psql -tAc "SELECT 1 FROM pg_database WHERE datname = '${DB_NAME}'" | grep -q 1; then
    runuser -u postgres -- createdb -O "${DB_USER}" "${DB_NAME}"
  fi

  runuser -u postgres -- psql -v ON_ERROR_STOP=1 \
    -c "GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER};"
}

main() {
  require_root
  validate_identifier "DB_NAME" "$DB_NAME"
  validate_identifier "DB_USER" "$DB_USER"

  if [ -z "$DB_PASSWORD" ]; then
    echo "Set DB_PASSWORD before running this script." >&2
    exit 1
  fi

  install_packages
  install_node
  ensure_app_user
  configure_postgres
  systemctl enable --now nginx

  cat <<EOF
Bootstrap complete.

Next steps:
1. Copy this repo to ${APP_ROOT}
2. Copy deploy/ec2/backend.env.example to ${CONFIG_FILE}
3. Install the systemd service and nginx site config
4. Run deploy/ec2/deploy-backend.sh as ${APP_USER}
EOF
}

main "$@"
