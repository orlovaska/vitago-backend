# Map style and tiles

The apps render OpenStreetMap vector tiles from our own server with MapLibre.

- **Tiles**: `update-tiles.sh` extracts Russia from the daily Protomaps
  planet build into `/srv/tiles/russia.pmtiles`; martin serves it at
  `/tiles/russia/{z}/{x}/{y}`. Run it on the VPS when the map should be
  refreshed.
- **Style**: `build-style.mjs` generates `style-light-ru.json` from
  `@protomaps/basemaps` with our palette (`palette.mjs`), 3D buildings and
  labels MapLibre Native can render.

```bash
cd deploy/maps
npm install && npm run build
scp style-light-ru.json root@<server>:/srv/maps/
```

Fonts and sprites go to `/srv/maps/fonts` and `/srv/maps/sprites` once.
nginx caches style files for only five minutes, so a restyled map reaches
installed apps quickly; each app's style URL is part of its configuration in
the admin, so switching styles needs no release.
