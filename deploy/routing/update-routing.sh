#!/usr/bin/env bash
# Builds the walking-routing graph for the app areas in ROUTING_REGIONS and
# starts Valhalla on it. The one command for routing data; run it again to add
# an app or to refresh OpenStreetMap data.
#
# 1. Downloads the regional OpenStreetMap extract each app names (Geofabrik),
#    once per distinct file, and only when it changed since the last run.
# 2. Cuts every app's bounding box out of it and merges the cuts into
#    region.osm.pbf, so the graph never holds more than these areas.
# 3. Builds a new graph next to the one in service, swaps them, restarts
#    valhalla and checks that every area is in the graph.
#
# ROUTING_REGIONS is read from the environment or from secrets/api.env
# (ROUTING_ENV_FILE overrides the path). Run on the VPS:
#   deploy/routing/update-routing.sh
set -euo pipefail

ROUTING_DIR="${VITAGO_ROUTING_DIR:-/srv/routing}"
STACK_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
ENV_FILE="${ROUTING_ENV_FILE:-$STACK_DIR/secrets/api.env}"
VALHALLA_URL="http://127.0.0.1:8002"
OSMIUM_IMAGE="debian:bookworm-slim"
NEXT_TILESET="valhalla_tiles_next"
MIN_FREE_GB=5
# Git Bash on Windows would otherwise rewrite container paths such as /data.
export MSYS_NO_PATHCONV=1

log() { echo "[$(date -u +%FT%TZ)] $*"; }
fail() { log "ERROR: $*"; exit 1; }
compose() { (cd "$STACK_DIR" && docker compose --profile routing "$@"); }

# ---- Areas ----

if [ -z "${ROUTING_REGIONS:-}" ]; then
  [ -f "$ENV_FILE" ] || fail "ROUTING_REGIONS is not set and $ENV_FILE does not exist"
  ROUTING_REGIONS="$(grep -E '^ROUTING_REGIONS=' "$ENV_FILE" | tail -1 | cut -d= -f2- | tr -d '\r')"
fi
[ -n "$ROUTING_REGIONS" ] || fail "ROUTING_REGIONS is empty"
export ROUTING_REGIONS

mkdir -p "$ROUTING_DIR/source" "$ROUTING_DIR/extracts"
free_gb=$(df -BG --output=avail "$ROUTING_DIR" | tail -1 | tr -dc '0-9')
[ "$free_gb" -ge "$MIN_FREE_GB" ] || fail "only ${free_gb} GB free, need ${MIN_FREE_GB}"

# One line per app: slug url minLon minLat maxLon maxLat. The same checks as the
# API's env schema, run with the Python of the Valhalla image, so the host needs
# nothing but Docker.
regions="$(compose run --rm --no-deps -T -e ROUTING_REGIONS --entrypoint python3 valhalla -c '
import json, os, re, sys

try:
    regions = json.loads(os.environ["ROUTING_REGIONS"])
except ValueError as error:
    sys.exit(f"ROUTING_REGIONS is not valid JSON: {error}")
if not isinstance(regions, dict) or not regions:
    sys.exit("ROUTING_REGIONS lists no apps")

for slug, region in regions.items():
    def bad(message):
        sys.exit(f"ROUTING_REGIONS.{slug}: {message}")
    if not re.fullmatch(r"[a-z0-9_-]+", slug):
        bad("the slug may hold lower-case latin letters, digits, dashes and underscores")
    try:
        url = region["sourcePbfUrl"]
        box = [float(region["bbox"][key]) for key in ("minLon", "minLat", "maxLon", "maxLat")]
    except (KeyError, TypeError, ValueError):
        bad("expected {\"sourcePbfUrl\": …, \"bbox\": {\"minLon\", \"minLat\", \"maxLon\", \"maxLat\"}}")
    if not isinstance(url, str) or not re.fullmatch(r"https?://\S+\.osm\.pbf", url):
        bad("sourcePbfUrl must be an http(s) link to an .osm.pbf file")
    min_lon, min_lat, max_lon, max_lat = box
    if not (-180 <= min_lon < max_lon <= 180 and -90 <= min_lat < max_lat <= 90):
        bad("the bbox needs -180 <= minLon < maxLon <= 180 and -90 <= minLat < maxLat <= 90")
    print(slug, url, *box)
')" || fail "ROUTING_REGIONS is invalid (see above)"
log "areas: $(cut -d' ' -f1 <<< "$regions" | paste -sd' ')"

# ---- 1. Regional extracts ----

declare -A fetched=()
while read -r slug url _; do
  [ -z "${fetched[$url]:-}" ] || continue
  fetched[$url]=1
  file="$ROUTING_DIR/source/$(basename "$url")"
  args=(-fL --retry 3 -sS -R -o "$file.part")
  # Geofabrik answers 304 when the file has not changed since our copy.
  [ -s "$file" ] && args+=(-z "$file")
  log "downloading $url"
  rm -f "$file.part"
  curl "${args[@]}" "$url" || fail "cannot download $url"
  if [ -s "$file.part" ]; then
    mv -f "$file.part" "$file"
  else
    rm -f "$file.part"
    log "unchanged since the last run"
  fi
done <<< "$regions"

# ---- 2. Cut the areas and merge them ----

commands="set -e
apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq osmium-tool >/dev/null
rm -f /data/extracts/*.osm.pbf"
cuts=""
while read -r slug url min_lon min_lat max_lon max_lat; do
  commands+="
echo 'cutting $slug: $min_lon,$min_lat,$max_lon,$max_lat'
osmium extract --strategy smart --bbox $min_lon,$min_lat,$max_lon,$max_lat \
  -o /data/extracts/$slug.osm.pbf /data/source/$(basename "$url")"
  cuts+=" /data/extracts/$slug.osm.pbf"
done <<< "$regions"
# Overlapping areas share objects; merge writes each of them once.
commands+="
osmium merge --overwrite -f pbf -o /data/region.osm.pbf.part$cuts
osmium fileinfo -F pbf /data/region.osm.pbf.part >/dev/null"

log "cutting the areas out of the extracts"
rm -f "$ROUTING_DIR/region.osm.pbf.part"
docker run --rm -v "$ROUTING_DIR:/data" "$OSMIUM_IMAGE" sh -c "$commands" \
  || fail "osmium could not cut the areas"
[ -s "$ROUTING_DIR/region.osm.pbf.part" ] || fail "the merged extract is empty"
# Valhalla builds from every .pbf in its directory: region.osm.pbf must be the only one.
mv -f "$ROUTING_DIR/region.osm.pbf.part" "$ROUTING_DIR/region.osm.pbf"
log "region.osm.pbf: $(du -h "$ROUTING_DIR/region.osm.pbf" | cut -f1)"

# ---- 3. Build a new graph, then swap it in ----

# The running service keeps answering from the old graph while the new one builds;
# a failed build leaves it untouched.
rm -rf "$ROUTING_DIR/$NEXT_TILESET" "$ROUTING_DIR/$NEXT_TILESET.tar"
log "building the routing graph"
compose run --rm --no-deps -T -e serve_tiles=False -e tileset_name="$NEXT_TILESET" valhalla build_tiles \
  || fail "Valhalla could not build the graph"
[ -s "$ROUTING_DIR/$NEXT_TILESET.tar" ] || fail "the new graph is missing"

log "swapping the graph and restarting valhalla"
compose stop valhalla >/dev/null 2>&1 || true
rm -rf "$ROUTING_DIR/valhalla_tiles" "$ROUTING_DIR/valhalla_tiles.tar"
mv "$ROUTING_DIR/$NEXT_TILESET" "$ROUTING_DIR/valhalla_tiles"
mv "$ROUTING_DIR/$NEXT_TILESET.tar" "$ROUTING_DIR/valhalla_tiles.tar"
# On start the image points valhalla.json back at valhalla_tiles.tar.
compose up -d --force-recreate --wait --wait-timeout 300 valhalla \
  || fail "valhalla did not become healthy"

# ---- Check every area ----

# The centre of a box may be water, so a route from it proves little; instead
# ask for the nearest walkable way, which exists only where the graph has data.
while read -r slug _ min_lon min_lat max_lon max_lat; do
  read -r lat lon < <(awk -v a="$min_lat" -v b="$max_lat" -v c="$min_lon" -v d="$max_lon" \
    'BEGIN { printf "%.6f %.6f\n", (a + b) / 2, (c + d) / 2 }')
  body="{\"locations\":[{\"lat\":$lat,\"lon\":$lon}],\"costing\":\"pedestrian\"}"
  answer="$(curl -fsS --max-time 30 -H 'Content-Type: application/json' -d "$body" "$VALHALLA_URL/locate")" \
    || fail "valhalla does not answer /locate"
  nearest="$(grep -o '"correlated_lat":[0-9.-]*,"correlated_lon":[0-9.-]*' <<< "$answer" | head -1)"
  [ -n "$nearest" ] || fail "the graph has no walkable ways near the centre of $slug"
  log "$slug: in the graph, nearest walkable way to the centre: $nearest"
done <<< "$regions"
log "done"
