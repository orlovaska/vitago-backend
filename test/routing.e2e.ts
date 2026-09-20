import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { adminBearer } from './support/auth';
import { FakeValhalla } from './support/fake-valhalla';
import { createTestApp, type TestApp } from './support/test-app';

const SPB_REGIONS = {
  spb: {
    sourcePbfUrl: 'https://download.geofabrik.de/russia/northwestern-fed-district-latest.osm.pbf',
    bbox: { minLon: 29.4, minLat: 59.6, maxLon: 30.8, maxLat: 60.2 },
  },
};

describe('routing', () => {
  let t: TestApp;
  let admin: string;
  const valhalla = new FakeValhalla();

  beforeAll(async () => {
    await valhalla.start();
    t = await createTestApp({
      env: { ...valhalla.env(), ROUTING_REGIONS: JSON.stringify(SPB_REGIONS) },
    });
  });

  beforeEach(async () => {
    await t.truncateAll();
    valhalla.reset();
    admin = await adminBearer(t);
  });

  afterAll(async () => {
    await t.close();
    await valhalla.stop();
  });

  const route = (body: object, bearer = admin) =>
    request(t.server).post('/v1/admin/routing/route').set('authorization', bearer).send(body);

  const fromTo = { from: { lat: 59.9343, lon: 30.3351 }, to: { lat: 59.939, lon: 30.3158 } };

  it('returns the walking route with distance, duration and a GeoJSON line', async () => {
    const response = await route(fromTo).expect(200);
    expect(response.body).toEqual({
      distanceMeters: 1424,
      durationSeconds: 1025,
      geometry: {
        type: 'LineString',
        coordinates: [
          [30.3351, 59.9343],
          [30.3158, 59.939],
        ],
      },
    });
    expect(valhalla.routeRequests).toEqual([
      expect.objectContaining({
        locations: [fromTo.from, fromTo.to],
        costing: 'pedestrian',
      }),
    ]);
  });

  it.each([
    [171, 'No suitable edges near location', 'routing_point_out_of_area'],
    [442, 'No path could be found for input', 'routing_route_not_found'],
  ])('turns Valhalla error %i into 422 %s', async (errorCode, error, code) => {
    valhalla.failNext(errorCode, error);
    const response = await route(fromTo).expect(422);
    expect(response.body.code).toBe(code);
  });

  it('rejects coordinates outside the valid range', async () => {
    await route({ from: { lat: 95, lon: 30 }, to: fromTo.to }).expect(400);
    expect(valhalla.routeRequests).toHaveLength(0);
  });

  it('is for administrators only', async () => {
    await request(t.server).post('/v1/admin/routing/route').send(fromTo).expect(401);
  });

  it('reports the engine version and the configured areas', async () => {
    const response = await request(t.server)
      .get('/v1/admin/routing/status')
      .set('authorization', admin)
      .expect(200);
    expect(response.body).toEqual({
      version: '3.8.3',
      tilesetLastModified: 1_758_000_000,
      regions: ['spb'],
    });
  });

  describe('without a reachable engine', () => {
    let offline: TestApp;

    beforeAll(async () => {
      // Nothing listens on port 9 (discard) on the test machine.
      offline = await createTestApp({ env: { VALHALLA_URL: 'http://127.0.0.1:9' } });
    });

    afterAll(async () => {
      await offline.close();
    });

    it('answers 503 routing_unavailable', async () => {
      // Signed in here: the outer beforeEach empties the tables, administrators included.
      const offlineAdmin = await adminBearer(offline);
      const response = await request(offline.server)
        .post('/v1/admin/routing/route')
        .set('authorization', offlineAdmin)
        .send(fromTo)
        .expect(503);
      expect(response.body.code).toBe('routing_unavailable');
    });
  });
});
