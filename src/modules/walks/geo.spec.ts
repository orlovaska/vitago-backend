import { describe, expect, it } from 'vitest';
import { haversineMeters, pointInPolygon, type Polygon, polygonBbox } from './geo';

/** A square around the centre of Saint Petersburg, drawn clockwise. */
const SQUARE: Polygon = {
  type: 'Polygon',
  coordinates: [
    [
      [30.3, 59.93],
      [30.4, 59.93],
      [30.4, 59.95],
      [30.3, 59.95],
      [30.3, 59.93],
    ],
  ],
};

/** Two squares joined by a narrow waist, so one latitude crosses four edges. */
const HOURGLASS: Polygon = {
  type: 'Polygon',
  coordinates: [
    [
      [30.0, 59.9],
      [30.4, 59.9],
      [30.22, 60.0],
      [30.4, 60.1],
      [30.0, 60.1],
      [30.18, 60.0],
      [30.0, 59.9],
    ],
  ],
};

describe('haversineMeters', () => {
  it('measures a known short distance', () => {
    // Palace Square to the Bronze Horseman, about 1.2 km apart.
    const meters = haversineMeters({ lat: 59.9386, lon: 30.3141 }, { lat: 59.9363, lon: 30.3022 });
    expect(meters).toBeGreaterThan(600);
    expect(meters).toBeLessThan(800);
  });

  it('is zero for one and the same place', () => {
    expect(haversineMeters({ lat: 59.9386, lon: 30.3141 }, { lat: 59.9386, lon: 30.3141 })).toBe(0);
  });
});

describe('polygonBbox', () => {
  it('takes the extremes of the outer ring', () => {
    expect(polygonBbox(SQUARE)).toEqual({
      minLat: 59.93,
      maxLat: 59.95,
      minLon: 30.3,
      maxLon: 30.4,
    });
  });
});

describe('pointInPolygon', () => {
  it('accepts a point in the middle', () => {
    expect(pointInPolygon({ lat: 59.94, lon: 30.35 }, SQUARE)).toBe(true);
  });

  it.each([
    ['west', { lat: 59.94, lon: 30.2 }],
    ['east', { lat: 59.94, lon: 30.5 }],
    ['south', { lat: 59.9, lon: 30.35 }],
    ['north', { lat: 59.99, lon: 30.35 }],
  ])('rejects a point to the %s of it', (_side, point) => {
    expect(pointInPolygon(point, SQUARE)).toBe(false);
  });

  it('counts a point on the outline as inside', () => {
    expect(pointInPolygon({ lat: 59.93, lon: 30.35 }, SQUARE)).toBe(true);
    expect(pointInPolygon({ lat: 59.94, lon: 30.3 }, SQUARE)).toBe(true);
  });

  it('counts a corner as inside', () => {
    expect(pointInPolygon({ lat: 59.93, lon: 30.3 }, SQUARE)).toBe(true);
  });

  it('rejects the gap of a concave shape, where a rectangle would accept it', () => {
    // Inside the bounding box, but between the two lobes of the hourglass.
    expect(pointInPolygon({ lat: 60.0, lon: 30.1 }, HOURGLASS)).toBe(false);
    expect(pointInPolygon({ lat: 59.95, lon: 30.1 }, HOURGLASS)).toBe(true);
    expect(pointInPolygon({ lat: 60.05, lon: 30.1 }, HOURGLASS)).toBe(true);
  });

  it('says no when the polygon has no ring at all', () => {
    expect(pointInPolygon({ lat: 59.94, lon: 30.35 }, { type: 'Polygon', coordinates: [] })).toBe(
      false,
    );
  });
});
