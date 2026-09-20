import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type AppConfig } from '../../platform/config';
import { ValhallaClient } from './valhalla.client';

/** polyline6 of (59.9343, 30.3351) -> (59.939, 30.3158). */
const SHAPE = 'wdbiqBwfozx@wdHfud@';
const FIRST: [number, number] = [30.3351, 59.9343];
const SECOND: [number, number] = [30.3158, 59.939];

const client = () =>
  new ValhallaClient({ env: { VALHALLA_URL: 'http://valhalla.test' } } as unknown as AppConfig);

const ok = (body: unknown) => ({ ok: true, status: 200, json: () => Promise.resolve(body) });

const routeAnswer = (lengthKm: number, timeSeconds: number) =>
  ok({ trip: { summary: { length: lengthKm, time: timeSeconds }, legs: [{ shape: SHAPE }] } });

describe('ValhallaClient', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const bodyOf = (call: number) =>
    JSON.parse((fetchMock.mock.calls[call]![1] as { body: string }).body) as Record<
      string,
      unknown
    >;

  describe('walkingRouteThrough', () => {
    it('asks once while the waypoints fit in one request', async () => {
      fetchMock.mockResolvedValue(routeAnswer(1.4235, 1024.6));
      const waypoints = [
        { lat: 59.9343, lon: 30.3351 },
        { lat: 59.939, lon: 30.3158 },
      ];

      const route = await client().walkingRouteThrough(waypoints);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0]![0]).toBe('http://valhalla.test/route');
      expect(bodyOf(0)).toMatchObject({ locations: waypoints, costing: 'pedestrian' });
      expect(route).toEqual({
        distanceMeters: 1424,
        durationSeconds: 1025,
        geometry: { type: 'LineString', coordinates: [FIRST, SECOND] },
      });
    });

    it('splits a long way into chunks that share a waypoint and sums the whole of it', async () => {
      fetchMock.mockResolvedValue(routeAnswer(1, 100));
      const waypoints = Array.from({ length: 39 }, (_, index) => ({
        lat: 59.9 + index / 1000,
        lon: 30.3 + index / 1000,
      }));

      const route = await client().walkingRouteThrough(waypoints);

      expect(fetchMock).toHaveBeenCalledTimes(2);
      // The chunks overlap by one waypoint, so the legs join without a gap.
      expect(bodyOf(0)).toMatchObject({ locations: waypoints.slice(0, 20) });
      expect(bodyOf(1)).toMatchObject({ locations: waypoints.slice(19, 39) });
      // Overlapping by a point and not by a leg is what makes the sums right.
      expect(route.distanceMeters).toBe(2000);
      expect(route.durationSeconds).toBe(200);
      // The repeated coordinate of the second chunk is dropped.
      expect(route.geometry.coordinates).toEqual([FIRST, SECOND, SECOND]);
    });

    it('refuses a single waypoint instead of asking the engine', async () => {
      await expect(
        client().walkingRouteThrough([{ lat: 59.9343, lon: 30.3351 }]),
      ).rejects.toThrow();
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('walkingMatrix', () => {
    it('asks for every pair at once and reads the times', async () => {
      const locations = [
        { lat: 59.9343, lon: 30.3351 },
        { lat: 59.939, lon: 30.3158 },
      ];
      fetchMock.mockResolvedValue(
        ok({
          sources_to_targets: [
            [
              { time: 0, distance: 0 },
              { time: 600, distance: 0.8 },
            ],
            [
              { time: 620, distance: 0.8 },
              { time: 0, distance: 0 },
            ],
          ],
        }),
      );

      const matrix = await client().walkingMatrix(locations);

      expect(fetchMock.mock.calls[0]![0]).toBe('http://valhalla.test/sources_to_targets');
      expect(bodyOf(0)).toMatchObject({
        sources: locations,
        targets: locations,
        costing: 'pedestrian',
      });
      expect(matrix).toEqual([
        [0, 600],
        [620, 0],
      ]);
    });

    it('turns an unreachable pair into Infinity, so it never wins a comparison', async () => {
      fetchMock.mockResolvedValue(
        ok({
          sources_to_targets: [
            [
              { time: 0, distance: 0 },
              { time: null, distance: null },
            ],
          ],
        }),
      );

      const [row] = await client().walkingMatrix([
        { lat: 59.9343, lon: 30.3351 },
        { lat: 0, lon: 0 },
      ]);

      expect(row).toEqual([0, Number.POSITIVE_INFINITY]);
    });
  });
});
