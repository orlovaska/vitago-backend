#!/usr/bin/env bash
# CI only: builds secrets/*.env from the templates with strong random values,
# so the smoke test boots exactly like production (NODE_ENV=production refuses
# weak secrets). These files never reach the server: ci-deploy excludes secrets/.
set -euo pipefail

cd "$(dirname "$0")/.."
mkdir -p secrets
cp secrets.example/postgres.env secrets/postgres.env
cp secrets.example/api.env secrets/api.env
cp secrets.example/nginx.env secrets/nginx.env

random() {
  openssl rand -base64 48 | tr -d '\n/+='
}

# set_value <file> <key> <value>: replaces or appends KEY=value.
set_value() {
  local file="$1" key="$2" value="$3"
  if grep -q "^${key}=" "$file"; then
    # '|' as the sed separator: generated values never contain it.
    sed -i "s|^${key}=.*|${key}=${value}|" "$file"
  else
    printf '%s=%s\n' "$key" "$value" >> "$file"
  fi
}

db_password="$(random)"
set_value secrets/postgres.env POSTGRES_PASSWORD "$db_password"
set_value secrets/api.env DATABASE_URL "postgres://vitago:${db_password}@postgres:5432/vitago"
set_value secrets/api.env USER_JWT_SECRET "$(random)"
set_value secrets/api.env ADMIN_JWT_SECRET "$(random)"
set_value secrets/api.env DEVICE_SECRET_PEPPER "$(random)"
# No domain: nginx serves the API on any host over plain HTTP.
set_value secrets/nginx.env DOMAIN ""
set_value secrets/nginx.env API_DOMAIN ""

# Host directories the stack mounts; empty is fine for the smoke test.
for dir in /opt/vitago-web/dist /srv/maps /srv/tiles; do
  mkdir -p "$dir" 2>/dev/null || sudo mkdir -p "$dir"
done
