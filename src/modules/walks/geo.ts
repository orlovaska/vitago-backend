/**
 * The geometry a walk needs. Kept here rather than pulled from a library: it
 * is three short functions, and the project has no geographic dependency.
 *
 * Positions are GeoJSON order — [longitude, latitude].
 */

export interface LatLon {
  lat: number;
  lon: number;
}

export type Position = [number, number];

/** A GeoJSON polygon with one outer ring, closed (first position = last). */
export interface Polygon {
  type: 'Polygon';
  coordinates: Position[][];
}

export interface Bbox {
  minLat: number;
  minLon: number;
  maxLat: number;
  maxLon: number;
}

const EARTH_RADIUS_METERS = 6_371_008.8;
const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/** Distance over the surface of the Earth, in metres. */
export function haversineMeters(from: LatLon, to: LatLon): number {
  const dLat = toRadians(to.lat - from.lat);
  const dLon = toRadians(to.lon - from.lon);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(from.lat)) * Math.cos(toRadians(to.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * The rectangle around a polygon, used as a cheap pre-filter before the exact
 * test. TODO: a polygon crossing the antimeridian needs two ranges; every city
 * the app covers today is far from it.
 */
export function polygonBbox(polygon: Polygon): Bbox {
  const ring = outerRing(polygon);
  const lons = ring.map(([lon]) => lon);
  const lats = ring.map(([, lat]) => lat);
  return {
    minLat: Math.min(...lats),
    maxLat: Math.max(...lats),
    minLon: Math.min(...lons),
    maxLon: Math.max(...lons),
  };
}

/**
 * Whether a point lies inside the polygon, by counting how often a ray to the
 * east crosses the outline. A point exactly on the outline counts as inside:
 * the user drew around it, and half a metre of rounding must not drop it.
 */
export function pointInPolygon(point: LatLon, polygon: Polygon): boolean {
  const ring = outerRing(polygon);
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [lonI, latI] = ring[i]!;
    const [lonJ, latJ] = ring[j]!;
    if (onSegment(point, ring[i]!, ring[j]!)) return true;
    const crosses = latI > point.lat !== latJ > point.lat;
    if (!crosses) continue;
    const lonAtLatitude = lonI + ((point.lat - latI) * (lonJ - lonI)) / (latJ - latI);
    if (point.lon < lonAtLatitude) inside = !inside;
  }
  return inside;
}

const EPSILON = 1e-12;

function onSegment(point: LatLon, a: Position, b: Position): boolean {
  const [aLon, aLat] = a;
  const [bLon, bLat] = b;
  const cross = (bLon - aLon) * (point.lat - aLat) - (bLat - aLat) * (point.lon - aLon);
  if (Math.abs(cross) > EPSILON) return false;
  return (
    point.lon >= Math.min(aLon, bLon) - EPSILON &&
    point.lon <= Math.max(aLon, bLon) + EPSILON &&
    point.lat >= Math.min(aLat, bLat) - EPSILON &&
    point.lat <= Math.max(aLat, bLat) + EPSILON
  );
}

function outerRing(polygon: Polygon): Position[] {
  return polygon.coordinates[0] ?? [];
}
