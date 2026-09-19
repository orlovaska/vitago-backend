#!/usr/bin/env bash
# CI deploy: syncs the repository to the VPS, loads the images built on the
# runner and restarts the stack. Secrets on the server are never touched.
#
# Env: DEPLOY_HOST, DEPLOY_USER, DEPLOY_PATH (default /opt/vitago/api),
#      IMAGES_ARCHIVE (docker save | gzip output).
set -euo pipefail

: "${DEPLOY_HOST:?DEPLOY_HOST is required}"
: "${DEPLOY_USER:?DEPLOY_USER is required}"
: "${IMAGES_ARCHIVE:?IMAGES_ARCHIVE is required}"
DEPLOY_PATH="${DEPLOY_PATH:-/opt/vitago/api}"
REMOTE="${DEPLOY_USER}@${DEPLOY_HOST}"
SSH_OPTIONS=(-o StrictHostKeyChecking=yes -o ServerAliveInterval=30)

echo "==> Sync repository to ${REMOTE}:${DEPLOY_PATH}"
ssh "${SSH_OPTIONS[@]}" "$REMOTE" "mkdir -p '${DEPLOY_PATH}'"
rsync -az --delete -e "ssh ${SSH_OPTIONS[*]}" \
  --exclude '.git/' \
  --exclude 'node_modules/' \
  --exclude 'dist/' \
  --exclude 'secrets/' \
  --exclude 'storage/' \
  --exclude 'logs/' \
  ./ "${REMOTE}:${DEPLOY_PATH}/"

echo "==> Upload images"
scp "${SSH_OPTIONS[@]}" "$IMAGES_ARCHIVE" "${REMOTE}:/tmp/vitago-images.tar.gz"

echo "==> Restart the stack"
ssh "${SSH_OPTIONS[@]}" "$REMOTE" DEPLOY_PATH="$DEPLOY_PATH" bash -s <<'REMOTE_SCRIPT'
set -euo pipefail
cd "$DEPLOY_PATH"

# First deploy: start from the templates. The API refuses placeholder secrets,
# so the stack stays down until real values are filled in on the server.
mkdir -p secrets
for file in postgres.env api.env nginx.env backup.env; do
  [ -f "secrets/$file" ] || [ ! -f "secrets.example/$file" ] || cp "secrets.example/$file" "secrets/$file"
done
chmod 600 secrets/*.env
chmod +x deploy/nginx/entrypoint.sh scripts/*.sh

gzip -dc /tmp/vitago-images.tar.gz | docker load
rm -f /tmp/vitago-images.tar.gz
docker compose up -d --no-build --remove-orphans --wait --wait-timeout 180

docker compose ps
curl -fsS -o /dev/null http://127.0.0.1/nginx-health
echo "DEPLOY_OK"
REMOTE_SCRIPT
