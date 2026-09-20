/** Valhalla encodes route shapes with six decimal digits (polyline6). */
const PRECISION = 1e6;

/**
 * Decodes an encoded polyline into GeoJSON positions, [longitude, latitude].
 * Format: https://developers.google.com/maps/documentation/utilities/polylinealgorithm
 */
export function decodePolyline(encoded: string, precision = PRECISION): [number, number][] {
  const positions: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lon = 0;

  const nextDelta = (): number => {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };

  while (index < encoded.length) {
    lat += nextDelta();
    lon += nextDelta();
    positions.push([lon / precision, lat / precision]);
  }
  return positions;
}
