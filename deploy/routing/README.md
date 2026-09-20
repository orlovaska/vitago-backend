# Walking routing (Valhalla)

The API builds walking routes between points with a self-hosted
[Valhalla](https://github.com/valhalla/valhalla) (`costing: "pedestrian"`). No
third-party routing API is involved.

Valhalla cannot use the map tiles in `deploy/maps`: vector tiles are simplified
for drawing and carry no road network. It builds its own graph from raw
OpenStreetMap data (`.osm.pbf`), and only for the areas the apps need.

## Areas

Each app's area is a bounding box in `ROUTING_REGIONS` in `secrets/api.env`,
as JSON keyed by app slug, like `TBANK_TERMINALS`:

```
ROUTING_REGIONS={"spb":{"sourcePbfUrl":"https://download.geofabrik.de/russia/northwestern-fed-district-latest.osm.pbf","bbox":{"minLon":29.4,"minLat":59.6,"maxLon":30.8,"maxLat":60.2}}}
```

- `sourcePbfUrl`: an OpenStreetMap extract that contains the whole box. Take the
  smallest one from [Geofabrik](https://download.geofabrik.de/russia.html):
  Russia is split into federal districts (Saint Petersburg is in
  `northwestern-fed-district`, Moscow in `central-fed-district`, Perm in
  `volga-fed-district`). Apps that share a file download it once.
- `bbox`: longitude and latitude in degrees. Pick it on
  [bboxfinder.com](http://bboxfinder.com) or read it off a map. Only data inside
  it gets into the graph.

A new app is a new key in that JSON. The API checks the value at start-up, and
the script checks it again before it builds anything.

## Build and run: one command

On the VPS, from the stack directory:

```bash
deploy/routing/update-routing.sh
```

It downloads the extracts (skipping unchanged ones), cuts every box out with
`osmium extract --bbox` and merges them into `/srv/routing/region.osm.pbf`,
builds the Valhalla graph next to the one in service, swaps them, starts the
`valhalla` container and checks that every area is in the graph. A failed step
leaves the running graph as it was. Run it again after changing
`ROUTING_REGIONS`, or monthly to pick up OpenStreetMap edits. osmium runs in a
throwaway container, so the host needs only Docker.

Once on a new server, so deploys keep Valhalla running, add to `.env` next to
`docker-compose.yml`:

```
COMPOSE_PROFILES=routing
```

The `valhalla` service stays behind this profile because it cannot start
without `region.osm.pbf`; CI runs the stack without it.

Settings, all optional: `VITAGO_ROUTING_DIR` (data directory, default
`/srv/routing`), `VALHALLA_THREADS` (default 2), `VALHALLA_MEM_LIMIT`
(default `2g`).

Locally (Git Bash on Windows works): generate throwaway secrets once with
`scripts/ci-prepare-secrets.sh`, then
`VITAGO_ROUTING_DIR=C:/path/to/routing deploy/routing/update-routing.sh` and
set `VALHALLA_URL=http://localhost:8002` in `.env`.

## Check

Valhalla itself, on the server (the port is bound to loopback only):

```bash
curl -s http://127.0.0.1:8002/status
curl -s http://127.0.0.1:8002/route -H 'Content-Type: application/json' -d '{
  "locations": [{"lat": 59.9343, "lon": 30.3351}, {"lat": 59.9390, "lon": 30.3158}],
  "costing": "pedestrian", "directions_type": "none"}'
```

Through the API, with an administrator token:

```bash
curl -s https://api.vitagoguides.ru/v1/admin/routing/route \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"from": {"lat": 59.9343, "lon": 30.3351}, "to": {"lat": 59.9390, "lon": 30.3158}}'
```

The answer holds `distanceMeters`, `durationSeconds` and `geometry`, a GeoJSON
LineString in the same form as a tour's `route`. `GET /v1/admin/routing/status`
shows the Valhalla version and the configured areas. Errors:
`routing_point_out_of_area` and `routing_route_not_found` (422),
`routing_unavailable` (503).

The container's own healthcheck calls `/status`. `/health/ready` of the API does
not include Valhalla: a routing outage must not take the API down.

## Hardware

Measured for Saint Petersburg (the box above, on 2026-09-19); Russia is an
estimate.

|                     | One city (Saint Petersburg box)               | All of Russia          |
| ------------------- | --------------------------------------------- | ---------------------- |
| `.osm.pbf`          | 0.6 GB district extract → 76 MB after the cut | ~4 GB                  |
| Graph on disk       | 161 MB                                        | ~5–8 GB                |
| Disk during a build | ~2 GB                                         | ~25–35 GB              |
| RAM during a build  | 1–2 GB                                        | 8–16 GB                |
| Build time          | ~5 min in all, ~3 min of it the graph         | 2–4 h                  |
| RAM in service      | ~100 MB                                       | 1–2 GB plus page cache |

Each further city adds roughly as much as one city. A whole country is not
needed for walking tours; if it ever is, build the graph on a larger machine
and copy `valhalla_tiles.tar` to the server.
