// Builds style-light-ru.json for our own tile server.
//
//   npm install && npm run build
//   MAP_BASE_URL=https://api.example.test npm run build   # another host
//
// Upload the result to /srv/maps on the server; apps pick it up through the
// map style URL in their configuration, without a release.
import { writeFileSync } from 'node:fs';
import { layers, namedFlavor } from '@protomaps/basemaps';
import { BUILDING_3D_COLOR, WARM_LIGHT } from './palette.mjs';

const BASE_URL = process.env.MAP_BASE_URL ?? 'https://api.vitagoguides.ru';
const TILESET = 'russia';
const MAX_ZOOM = 15;
const ATTRIBUTION =
  '<a href="https://openstreetmap.org/copyright" target="_blank">&copy; OpenStreetMap</a>';

/**
 * 3D buildings as two layers. Tiles carry whole outlines (kind=building) and
 * detailed parts (kind=building_part: base, tower, spire). In one layer the
 * outline box would rise over its parts and hide the silhouette. Heights are
 * never invented: an object without a height stays flat, and the ordinary
 * buildings layer still draws its footprint.
 */
function extrudedBuildings() {
  const paint = {
    'fill-extrusion-color': BUILDING_3D_COLOR,
    'fill-extrusion-base': ['coalesce', ['get', 'min_height'], 0],
    // Rise smoothly between z15 and z16 instead of popping up.
    'fill-extrusion-height': [
      'interpolate',
      ['linear'],
      ['zoom'],
      15,
      0,
      16,
      ['coalesce', ['get', 'height'], 0],
    ],
    'fill-extrusion-opacity': 1,
    'fill-extrusion-vertical-gradient': true,
  };
  return ['building', 'building_part'].map((kind) => ({
    id: kind === 'building' ? 'buildings_3d' : 'buildings_3d_parts',
    type: 'fill-extrusion',
    source: 'protomaps',
    'source-layer': 'buildings',
    minzoom: 15,
    filter: ['==', ['get', 'kind'], kind],
    paint,
  }));
}

/**
 * MapLibre Native drops a whole layer when its text-field uses
 * is-supported-script or pgf: fields, which the generated label expressions
 * do; street, district and POI names then vanish. Russian and Latin names need
 * none of that, so affected layers get a plain name:ru → name expression.
 */
function withPlainLabels(styleLayers) {
  const plain = ['coalesce', ['get', 'name:ru'], ['get', 'name']];
  let changed = 0;
  const result = styleLayers.map((layer) => {
    const field = layer.layout?.['text-field'];
    const text = field ? JSON.stringify(field) : '';
    if (!text.includes('is-supported-script') && !text.includes('pgf:')) return layer;
    changed++;
    return { ...layer, layout: { ...layer.layout, 'text-field': plain } };
  });
  console.log(`plain labels: ${changed} layers`);
  return result;
}

function buildStyle(flavorName, palette) {
  const base = withPlainLabels(
    layers('protomaps', { ...namedFlavor(flavorName), ...palette }, { lang: 'ru' }),
  );
  // Buildings go right above flat buildings: over the ground, under the labels.
  const at = base.findIndex((layer) => layer.id === 'buildings') + 1 || base.length;
  return {
    version: 8,
    name: `Vitago ${flavorName}`,
    glyphs: `${BASE_URL}/maps/fonts/{fontstack}/{range}.pbf`,
    sprite: `${BASE_URL}/maps/sprites/v4/${flavorName}`,
    sources: {
      protomaps: {
        type: 'vector',
        tiles: [`${BASE_URL}/tiles/${TILESET}/{z}/{x}/{y}`],
        minzoom: 0,
        maxzoom: MAX_ZOOM,
        attribution: ATTRIBUTION,
      },
    },
    layers: [...base.slice(0, at), ...extrudedBuildings(), ...base.slice(at)],
  };
}

const style = buildStyle('light', WARM_LIGHT);
writeFileSync('style-light-ru.json', JSON.stringify(style));
console.log(
  `style-light-ru.json: ${style.layers.length} layers, ${Math.round(JSON.stringify(style).length / 1024)} KB`,
);
