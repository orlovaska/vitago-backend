import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_LOCALE } from '../../../platform/i18n';
import { NearbyPointsService } from './nearby-points.service';
import type { WalkCandidate, WalkPointContent, WalkPointsService } from './walk-points.service';

const APP = 'app-1';
/** Palace Square, and places measured out from it along the same latitude. */
const AT = { lat: 59.9386, lon: 30.3141 };

const candidate = (id: string, lat: number, lon: number): WalkCandidate => ({
  id,
  tourId: 'tour-1',
  latitude: lat,
  longitude: lon,
  isFree: true,
  categoryIds: [],
  audioSeconds: null,
});

const content = (id: string): WalkPointContent =>
  ({ id, tourId: 'tour-1', name: id }) as unknown as WalkPointContent;

function service(candidates: WalkCandidate[]) {
  const contents = vi.fn((ids: readonly string[]) => Promise.resolve(ids.map(content)));
  const walkPoints = {
    candidates: vi.fn(() => Promise.resolve(candidates)),
    contents,
  } as unknown as WalkPointsService;
  return { service: new NearbyPointsService(walkPoints), walkPoints, contents };
}

describe('NearbyPointsService', () => {
  it('answers nearest first', async () => {
    const { service: nearby } = service([
      candidate('far', AT.lat + 0.008, AT.lon),
      candidate('near', AT.lat + 0.001, AT.lon),
      candidate('middle', AT.lat + 0.004, AT.lon),
    ]);

    const found = await nearby.near(APP, DEFAULT_LOCALE, {
      at: AT,
      radiusMeters: 2000,
      limit: 10,
    });

    expect(found.map((point) => point.id)).toEqual(['near', 'middle', 'far']);
    expect(found[0]!.distanceMeters).toBeLessThan(found[1]!.distanceMeters);
  });

  it('drops what lies outside the circle, though the box kept it', async () => {
    // The corner of the bounding box is further away than its edge.
    const { service: nearby } = service([
      candidate('corner', AT.lat + 0.0089, AT.lon + 0.0178),
      candidate('inside', AT.lat + 0.002, AT.lon),
    ]);

    const found = await nearby.near(APP, DEFAULT_LOCALE, {
      at: AT,
      radiusMeters: 1000,
      limit: 10,
    });

    expect(found.map((point) => point.id)).toEqual(['inside']);
  });

  it('asks for the content of the closest ones only', async () => {
    const { service: nearby, contents } = service([
      candidate('a', AT.lat + 0.001, AT.lon),
      candidate('b', AT.lat + 0.002, AT.lon),
      candidate('c', AT.lat + 0.003, AT.lon),
    ]);

    const found = await nearby.near(APP, DEFAULT_LOCALE, {
      at: AT,
      radiusMeters: 2000,
      limit: 2,
    });

    expect(found).toHaveLength(2);
    expect(contents).toHaveBeenCalledWith(['a', 'b'], DEFAULT_LOCALE);
  });

  it('nothing within reach means no request for content', async () => {
    const { service: nearby, contents } = service([candidate('far', AT.lat + 0.05, AT.lon)]);

    const found = await nearby.near(APP, DEFAULT_LOCALE, {
      at: AT,
      radiusMeters: 500,
      limit: 10,
    });

    expect(found).toEqual([]);
    expect(contents).not.toHaveBeenCalled();
  });
});
