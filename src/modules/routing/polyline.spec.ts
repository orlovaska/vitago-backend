import { describe, expect, it } from 'vitest';
import { decodePolyline } from './polyline';

describe('decodePolyline', () => {
  it('decodes the reference example of the format', () => {
    // Google's documented example, encoded with five digits.
    expect(decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@', 1e5)).toEqual([
      [-120.2, 38.5],
      [-120.95, 40.7],
      [-126.453, 43.252],
    ]);
  });

  it('decodes Valhalla shapes with six digits', () => {
    // Two points in Saint Petersburg: (59.9343, 30.3351) and (59.939, 30.3158).
    expect(decodePolyline('wdbiqBwfozx@wdHfud@')).toEqual([
      [30.3351, 59.9343],
      [30.3158, 59.939],
    ]);
  });

  it('returns no positions for an empty shape', () => {
    expect(decodePolyline('')).toEqual([]);
  });
});
