#!/usr/bin/env bash
# Refreshes the Russia base map from the daily Protomaps planet build.
#
# Nothing is rendered here: `pmtiles extract` cuts Russia out of the ready
# planet archive with HTTP range requests, downloading only the needed bytes
# (about 13 GB up to z15). Run on the VPS: deploy/maps/update-tiles.sh
set -euo pipefail

TILES_DIR="${VITAGO_TILES_DIR:-/srv/tiles}"
STACK_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
ARCHIVE="$TILES_DIR/russia.pmtiles"
PARTIAL="$ARCHIVE.part"
REGION="$TILES_DIR/russia.geojson"
MAX_ZOOM=15
MIN_FREE_GB=16
MIN_ARCHIVE_BYTES=9000000000

log() { echo "[$(date -u +%FT%TZ)] $*"; }
fail() { log "ERROR: $*"; exit 1; }

mkdir -p "$TILES_DIR"
free_gb=$(df -BG --output=avail "$TILES_DIR" | tail -1 | tr -dc '0-9')
[ "$free_gb" -ge "$MIN_FREE_GB" ] || fail "only ${free_gb} GB free, need ${MIN_FREE_GB}"

if ! command -v pmtiles >/dev/null; then
  log "installing the pmtiles CLI"
  version=$(curl -fsS https://api.github.com/repos/protomaps/go-pmtiles/releases/latest \
    | grep -oP '"tag_name":\s*"v\K[^"]+')
  curl -fsSL "https://github.com/protomaps/go-pmtiles/releases/download/v${version}/go-pmtiles_${version}_Linux_x86_64.tar.gz" \
    | tar xz -C /usr/local/bin pmtiles
fi

# Region outline from Geofabrik's .poly file, converted to GeoJSON once.
if [ ! -s "$REGION" ]; then
  log "building the region outline"
  curl -fsSL https://download.geofabrik.de/russia.poly | python3 -c '
import json, sys
polygons, ring, hole = [], None, False
for line in list(sys.stdin)[1:]:
    text = line.strip()
    if text == "END":
        if ring is None:
            break
        if ring[0] != ring[-1]:
            ring.append(ring[0])
        if hole and polygons:
            polygons[-1].append(ring)
        else:
            polygons.append([ring])
        ring = None
    elif ring is None and text:
        hole, ring = text.startswith("!"), []
    elif text:
        lon, lat = map(float, text.split()[:2])
        # Chukotka crosses the antimeridian, which GeoJSON does not allow.
        ring.append([max(-179.999999, min(179.999999, lon)), lat])
json.dump({"type": "MultiPolygon", "coordinates": polygons}, sys.stdout)
' > "$REGION"
fi

# The newest available build; builds are kept for about a week.
build=""
for days_back in $(seq 0 10); do
  day=$(date -u -d "-${days_back} day" +%Y%m%d)
  if curl -fsS -o /dev/null -r 0-0 --max-time 30 "https://build.protomaps.com/${day}.pmtiles"; then
    build="$day"
    break
  fi
done
[ -n "$build" ] || fail "no Protomaps build found in the last 10 days"
log "extracting Russia from build ${build}, z0-${MAX_ZOOM}"

rm -f "$PARTIAL"
pmtiles extract "https://build.protomaps.com/${build}.pmtiles" "$PARTIAL" \
  --region="$REGION" --maxzoom="$MAX_ZOOM" --download-threads=8 --overfetch=0.05

# A broken archive must never replace a working one.
size=$(stat -c%s "$PARTIAL")
[ "$size" -gt "$MIN_ARCHIVE_BYTES" ] || fail "archive is suspiciously small: ${size} bytes"
pmtiles show "$PARTIAL" >/dev/null || fail "the new archive cannot be read"
mv -f "$PARTIAL" "$ARCHIVE"
log "archive replaced: $(numfmt --to=iec "$size")"

# martin keeps the old file open.
(cd "$STACK_DIR" && docker compose restart martin)
sleep 5
curl -fsS -o /dev/null "http://127.0.0.1/tiles/russia/6/39/20" || fail "tiles are not served after the restart"
log "done"
