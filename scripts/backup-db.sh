#!/usr/bin/env bash
# PostgreSQL backups straight to Google Drive through rclone; nothing is kept on the VPS.
#
#   scripts/backup-db.sh           back up if the interval has passed (run hourly from cron)
#   scripts/backup-db.sh force     back up now
#   scripts/backup-db.sh list      list the backups on Drive
#
# Settings: secrets/backup.env (template in secrets.example/backup.env).
# Restore:  rclone cat "<remote>,root_folder_id=<id>:<file>" \
#             | docker compose exec -T postgres pg_restore --clean --if-exists -U vitago -d vitago
set -euo pipefail

cd "$(dirname "$0")/.."
export TZ=Europe/Moscow

setting() {
  local value
  value="$(grep -E "^$1=" secrets/backup.env 2>/dev/null | tail -1 | cut -d= -f2- | tr -d '\r' || true)"
  printf '%s' "${value:-$2}"
}

REMOTE="$(setting BACKUP_RCLONE_REMOTE gdrive)"
FOLDER_ID="$(setting BACKUP_DRIVE_FOLDER_ID '')"
ARCHIVE_FOLDER_ID="$(setting BACKUP_DRIVE_ARCHIVE_FOLDER_ID '')"
INTERVAL_HOURS="$(setting BACKUP_INTERVAL_HOURS 6)"
KEEP="$(setting BACKUP_KEEP 20)"
STATE_DIR="${BACKUP_STATE_DIR:-/var/lib/vitago-backup}"

[ -n "$FOLDER_ID" ] || { echo "BACKUP_DRIVE_FOLDER_ID is not set in secrets/backup.env" >&2; exit 2; }
[[ "$INTERVAL_HOURS" =~ ^[0-9]+$ && "$KEEP" =~ ^[0-9]+$ ]] || { echo "Interval and keep must be integers" >&2; exit 2; }

main_folder="${REMOTE},root_folder_id=${FOLDER_ID}:"
archive_folder="${REMOTE},root_folder_id=${ARCHIVE_FOLDER_ID}:"
log() { echo "$(date '+%F %T %Z') $*"; }

# Seconds since the time stored in a state file; a missing file counts as "long ago".
age_of() {
  local file="$STATE_DIR/$1"
  [ -f "$file" ] || { echo 999999999; return; }
  echo $(( $(date +%s) - $(cat "$file") ))
}

backup() {
  local name="vitago-$(date '+%Y-%m-%d_%H-%M')-MSK.dump"
  log "Dumping to ${name}"
  # POSTGRES_USER and POSTGRES_DB come from the container's own environment.
  docker compose exec -T postgres sh -c 'pg_dump -Fc -U "$POSTGRES_USER" "$POSTGRES_DB"' \
    | rclone rcat "${main_folder}${name}"
  mkdir -p "$STATE_DIR"
  date +%s > "$STATE_DIR/last-backup"

  # Keep the newest KEEP dumps; names sort by time.
  rclone lsf --files-only "$main_folder" | grep -E '^vitago-.*-MSK\.dump$' | sort | head -n "-${KEEP}" \
    | while read -r old; do
        log "Removing ${old}"
        rclone deletefile "${main_folder}${old}"
      done

  # Once a week a copy goes to the archive folder, which is never pruned.
  if [ -n "$ARCHIVE_FOLDER_ID" ] && [ "$(age_of last-archive)" -ge $((7 * 24 * 3600)) ]; then
    log "Archiving ${name}"
    rclone copyto "${main_folder}${name}" "${archive_folder}${name}"
    date +%s > "$STATE_DIR/last-archive"
  fi
  log "Done"
}

case "${1:-}" in
  force) backup ;;
  list) rclone lsl "$main_folder" ;;
  '')
    if [ "$INTERVAL_HOURS" -eq 0 ]; then log "Backups are off (BACKUP_INTERVAL_HOURS=0)"; exit 0; fi
    if [ "$(age_of last-backup)" -ge $((INTERVAL_HOURS * 3600 - 300)) ]; then backup; fi
    ;;
  *) echo "usage: $0 [force|list]" >&2; exit 2 ;;
esac
