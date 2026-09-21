import { Injectable } from '@nestjs/common';
import { type Bbox, haversineMeters, type LatLon } from '../../../platform/geo';
import { type Locale } from '../../../platform/i18n';
import { type WalkPointContent, WalkPointsService } from './walk-points.service';

/** A point of the app with how far it is from where the user stands. */
export interface NearbyPoint extends WalkPointContent {
  distanceMeters: number;
}

export interface NearbyQuery {
  at: LatLon;
  radiusMeters: number;
  limit: number;
}

/** Metres in one degree of latitude; longitude shrinks towards the poles. */
const METERS_PER_LATITUDE_DEGREE = 111_320;
const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/**
 * The rectangle around a circle, used as a cheap pre-filter before the exact
 * distance. TODO: a box crossing the antimeridian needs two ranges; every city
 * the app covers today is far from it.
 */
function bboxAround(at: LatLon, radiusMeters: number): Bbox {
  const latDelta = radiusMeters / METERS_PER_LATITUDE_DEGREE;
  // At 60° the same metre is twice as many degrees of longitude as at the
  // equator; near the poles the cosine collapses, so it has a floor.
  const lonScale = Math.max(0.01, Math.cos(toRadians(at.lat)));
  return {
    minLat: at.lat - latDelta,
    maxLat: at.lat + latDelta,
    minLon: at.lon - latDelta / lonScale,
    maxLon: at.lon + latDelta / lonScale,
  };
}

/**
 * Points of the app around a place, nearest first.
 *
 * Built on the same selection a generated walk uses, so the same place that
 * several tours pass appears once — a list of "near you" must not repeat the
 * Hermitage as many times as there are tours through it.
 */
@Injectable()
export class NearbyPointsService {
  constructor(private readonly walkPoints: WalkPointsService) {}

  async near(appId: string, locale: Locale, query: NearbyQuery): Promise<NearbyPoint[]> {
    const candidates = await this.walkPoints.candidates(appId, locale, {
      bbox: bboxAround(query.at, query.radiusMeters),
    });

    const closest = candidates
      .map((candidate) => ({
        id: candidate.id,
        distanceMeters: Math.round(
          haversineMeters(query.at, {
            lat: candidate.latitude,
            lon: candidate.longitude,
          }),
        ),
      }))
      // The rectangle keeps its corners, which lie outside the circle.
      .filter((candidate) => candidate.distanceMeters <= query.radiusMeters)
      .sort((a, b) => a.distanceMeters - b.distanceMeters)
      .slice(0, query.limit);
    if (closest.length === 0) return [];

    const distances = new Map(closest.map((item) => [item.id, item.distanceMeters]));
    const contents = await this.walkPoints.contents(
      closest.map((item) => item.id),
      locale,
    );
    return contents.map((content) => ({
      ...content,
      distanceMeters: distances.get(content.id) ?? 0,
    }));
  }
}
