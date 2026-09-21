import { Transactional } from '@nestjs-cls/transactional';
import { HttpStatus, Injectable } from '@nestjs/common';
import { type AppContext } from '../../../platform/app-context';
import { AppError } from '../../../platform/http';
import { type Locale } from '../../../platform/i18n';
import { PaymentsFacade, type StartedCheckout } from '../../payments';
import { type RouteGeometry, RoutingFacade } from '../../routing';
import { SettingsFacade } from '../../settings';
import { ToursFacade, type WalkPointContent } from '../../tours';
import { type Polygon } from '../../../platform/geo';
import { type WalkRow, WalksStore } from '../walks.store';
import { type PlanRequest, WalkPlannerService } from './walk-planner.service';
import { walkPrice } from './walk-pricing';

/** A point of a walk, with whether this user may listen to it. */
export interface WalkPoint extends WalkPointContent {
  accessible: boolean;
}

/** Initial camera for the map: the same shape a tour uses. */
export interface WalkViewport {
  center: { latitude: number; longitude: number };
  zoom: number;
  bounds: { south: number; west: number; north: number; east: number };
}

export interface WalkView {
  id: string;
  status: WalkRow['status'];
  /** When an unsaved walk disappears; null once it is kept. */
  expiresAt: string | null;
  requestedMinutes: number;
  start: { lat: number; lon: number };
  endMode: WalkRow['endMode'];
  end: { lat: number; lon: number } | null;
  /** Either every category, or the ones the user picked. */
  categories: 'all' | string[];
  area: Polygon | null;
  points: WalkPoint[];
  route: RouteGeometry | null;
  mapViewport: WalkViewport | null;
  distanceMeters: number;
  walkingSeconds: number;
  visitSeconds: number;
  /** Walking and visiting together: what the user asked to fit in. */
  totalSeconds: number;
  /** Absent when nothing is locked: then there is nothing to sell. */
  walkUnlock?: { lockedCount: number; amountKopecks: number };
}

export interface GenerateRequest {
  durationMinutes: number;
  start: { lat: number; lon: number };
  endMode: WalkRow['endMode'];
  end: { lat: number; lon: number } | null;
  categories: 'all' | string[];
  area: Polygon | null;
}

const HOUR_MS = 60 * 60 * 1000;

/** Padding around the points of a walk, as a share of their span. */
const VIEWPORT_MARGIN = 0.15;

@Injectable()
export class WalksService {
  constructor(
    private readonly walks: WalksStore,
    private readonly planner: WalkPlannerService,
    private readonly tours: ToursFacade,
    private readonly routing: RoutingFacade,
    private readonly payments: PaymentsFacade,
    private readonly settings: SettingsFacade,
  ) {}

  /**
   * Builds a walk and keeps it: the app can reopen it after a restart, and a
   * payment can name it. It disappears on its own unless the user saves it.
   */
  async generate(
    userId: string,
    app: AppContext,
    locale: Locale,
    request: GenerateRequest,
  ): Promise<WalkView> {
    await this.checkRate(userId);

    const categoryIds = request.categories === 'all' ? undefined : request.categories;
    const plan: PlanRequest = {
      appId: app.id,
      locale,
      durationMinutes: request.durationMinutes,
      start: request.start,
      end: request.endMode === 'custom' ? request.end : null,
      ...(categoryIds ? { categoryIds } : {}),
      ...(request.area ? { area: request.area } : {}),
    };
    const planned = await this.planner.plan(plan);
    const points = await this.points(userId, planned.pointIds, locale);
    const lockedCount = points.filter((point) => !point.accessible).length;

    const [ttlDays, pricing] = await Promise.all([
      this.settings.get('walks.defaultTtlDays'),
      this.pricing(),
    ]);
    const row = await this.walks.insert({
      userId,
      appId: app.id,
      requestedMinutes: request.durationMinutes,
      startLat: request.start.lat,
      startLon: request.start.lon,
      endMode: request.endMode,
      endLat: request.end?.lat ?? null,
      endLon: request.end?.lon ?? null,
      categoryIds: categoryIds ? [...categoryIds] : null,
      area: request.area,
      pointIds: planned.pointIds,
      route: planned.route,
      routeKey: routeKey(request.start, points, request.end),
      distanceMeters: planned.distanceMeters,
      walkingSeconds: planned.walkingSeconds,
      visitSeconds: planned.visitSeconds,
      status: 'active',
      expiresAt: new Date(Date.now() + ttlDays * 24 * HOUR_MS),
      lockedCount,
      // TODO: the price is frozen here. If it turns out that buying a tour in
      // the meantime should make a walk cheaper, recalculate it on read from
      // a stored snapshot of these settings instead of from the live ones.
      amountKopecks: walkPrice(lockedCount, pricing),
    });

    return this.view(row, points, planned.route);
  }

  /**
   * A walk of this user, with live points: a place that was edited shows its
   * new text, and one that is gone drops out. The line is rebuilt when the
   * points it was drawn for are no longer the points of the walk.
   */
  async read(userId: string, appId: string, locale: Locale, id: string): Promise<WalkView> {
    const row = await this.owned(userId, appId, id);
    const points = await this.points(userId, row.pointIds, locale);
    const settled = await this.settle(row, points);
    return this.view(settled.row, points, settled.route);
  }

  /** The walks the user keeps, newest first. */
  async list(userId: string, appId: string, locale: Locale): Promise<WalkView[]> {
    const rows = await this.walks.listForUser(userId, appId);
    return Promise.all(
      rows.map(async (row) =>
        this.view(row, await this.points(userId, row.pointIds, locale), row.route),
      ),
    );
  }

  /**
   * Drops a point from the walk. The line is drawn again through what is
   * left — that is `settle`'s job, and it happens on the next read anyway —
   * and the price follows: a walk with one locked place fewer costs less.
   *
   * A paid walk keeps its price and its status: what was bought stays bought.
   */
  async removePoint(
    userId: string,
    appId: string,
    locale: Locale,
    id: string,
    pointId: string,
  ): Promise<WalkView> {
    const row = await this.owned(userId, appId, id);
    if (!row.pointIds.includes(pointId)) {
      throw AppError.notFound('point_not_in_walk', `Point ${pointId} is not in this walk`);
    }
    if (row.pointIds.length <= 1) {
      throw AppError.badRequest('walk_needs_a_point', 'A walk cannot be left without points');
    }

    const pointIds = row.pointIds.filter((current) => current !== pointId);
    const points = await this.points(userId, pointIds, locale);
    const lockedCount = points.filter((point) => !point.accessible).length;
    // The time a place took goes with it: otherwise totalSeconds would keep
    // counting narration the walk no longer has. Walking time and distance
    // are settle's to recompute when it redraws the line.
    const visitSeconds = await this.visitSeconds(points);
    const fields =
      row.status === 'purchased'
        ? { pointIds, visitSeconds }
        : {
            pointIds,
            visitSeconds,
            lockedCount,
            amountKopecks: walkPrice(lockedCount, await this.pricing()),
          };

    const updated = (await this.walks.update(id, fields)) ?? row;
    const settled = await this.settle(updated, points);
    return this.view(settled.row, points, settled.route);
  }

  /** Keeps the walk for good. Saving an already saved walk changes nothing. */
  async save(userId: string, appId: string, locale: Locale, id: string): Promise<WalkView> {
    const row = await this.owned(userId, appId, id);
    const kept =
      row.status === 'active'
        ? ((await this.walks.update(id, {
            status: 'saved',
            expiresAt: null,
            savedAt: new Date(),
          })) ?? row)
        : row;
    return this.view(kept, await this.points(userId, kept.pointIds, locale), kept.route);
  }

  /**
   * Forgets the walk. What was paid for is not forgotten: the unlocked points
   * live in the payments module and stay open in other walks.
   */
  async remove(userId: string, appId: string, id: string): Promise<void> {
    await this.owned(userId, appId, id);
    await this.walks.delete(id);
  }

  /** Starts paying to open every locked point of this walk. */
  async startUnlock(
    userId: string,
    app: AppContext,
    locale: Locale,
    id: string,
    payment: { store: 'app_store' | 'google_play' | 'rustore'; email?: string },
  ): Promise<StartedCheckout> {
    const row = await this.owned(userId, app.id, id);
    if (row.lockedCount === 0 || row.amountKopecks === 0) {
      throw AppError.badRequest('walk_is_free', 'This walk has nothing locked to pay for');
    }
    const points = await this.points(userId, row.pointIds, locale);
    return this.payments.startWalkUnlock({
      userId,
      app,
      walkId: row.id,
      amountKopecks: row.amountKopecks,
      // Everything in the walk, so a later edit cannot narrow what was bought.
      pointIds: points.map((point) => point.id),
      title: unlockTitle(row, points.length),
      store: payment.store,
      ...(payment.email ? { email: payment.email } : {}),
    });
  }

  /** Account deletion: a walk is personal and goes with the user. */
  async deleteUserData(userId: string): Promise<void> {
    await this.walks.deleteAllOfUser(userId);
  }

  private async owned(userId: string, appId: string, id: string): Promise<WalkRow> {
    const row = await this.walks.findById(id);
    // Someone elses walk is simply not there: the answer must not tell whether
    // an id exists.
    if (!row || row.userId !== userId || row.appId !== appId) {
      throw AppError.notFound('walk_not_found', `Walk ${id} not found`);
    }
    return row;
  }

  private async checkRate(userId: string): Promise<void> {
    const limit = await this.settings.get('walks.generationsPerHour');
    const made = await this.walks.countSince(userId, new Date(Date.now() - HOUR_MS));
    if (made >= limit) {
      throw new AppError(
        HttpStatus.TOO_MANY_REQUESTS,
        'walk_rate_limited',
        'Too many walks were generated in the last hour',
      );
    }
  }

  private async points(
    userId: string,
    pointIds: readonly string[],
    locale: Locale,
  ): Promise<WalkPoint[]> {
    const contents = await this.tours.pointContents(pointIds, locale);
    if (contents.length === 0) return [];
    const [purchased, unlocked] = await Promise.all([
      this.payments.purchasedTourIds(userId, [...new Set(contents.map((p) => p.tourId))]),
      this.payments.unlockedPointIds(
        userId,
        contents.map((p) => p.id),
      ),
    ]);
    return contents.map((point) => ({
      ...point,
      accessible: point.isFree || purchased.has(point.tourId) || unlocked.has(point.id),
    }));
  }

  /**
   * Brings a stored walk up to date: a paid walk is marked as such, and a line
   * drawn for points that have since changed is drawn again.
   */
  @Transactional()
  private async settle(
    row: WalkRow,
    points: WalkPoint[],
  ): Promise<{ row: WalkRow; route: RouteGeometry | null }> {
    let current = row;
    if (current.status !== 'purchased' && (await this.payments.hasWalkUnlock(row.userId, row.id))) {
      current =
        (await this.walks.update(row.id, { status: 'purchased', expiresAt: null })) ?? current;
    }

    const key = routeKey(
      { lat: current.startLat, lon: current.startLon },
      points,
      current.endLat !== null && current.endLon !== null
        ? { lat: current.endLat, lon: current.endLon }
        : null,
    );
    if (current.routeKey === key) return { row: current, route: current.route };
    if (points.length === 0) return { row: current, route: null };

    // The points moved, or some are gone: the stored line no longer leads
    // where the walk goes, so the engine draws it again.
    try {
      const end =
        current.endMode === 'custom' && current.endLat !== null && current.endLon !== null
          ? { lat: current.endLat, lon: current.endLon }
          : { lat: current.startLat, lon: current.startLon };
      const route = await this.routing.walkingRouteThrough([
        { lat: current.startLat, lon: current.startLon },
        ...points.map((point) => ({ lat: point.latitude, lon: point.longitude })),
        end,
      ]);
      const updated = await this.walks.update(current.id, {
        route: route.geometry,
        routeKey: key,
        pointIds: points.map((point) => point.id),
        distanceMeters: route.distanceMeters,
        walkingSeconds: route.durationSeconds,
      });
      return { row: updated ?? current, route: route.geometry };
    } catch {
      // Routing being down is no reason to lose the walk: the map shows the
      // points, and the next read tries again.
      return { row: current, route: current.route };
    }
  }

  /**
   * How long the places themselves take: the narration plus a fixed overhead
   * each. The same formula the planner used — anything else and an edited
   * walk would disagree with the time promised when it was built.
   */
  private async visitSeconds(points: readonly WalkPoint[]): Promise<number> {
    const [defaultVisitSeconds, pointOverheadSeconds] = await Promise.all([
      this.settings.get('walks.defaultVisitSeconds'),
      this.settings.get('walks.pointOverheadSeconds'),
    ]);
    return points.reduce(
      (total, point) =>
        total + (point.audio?.durationSeconds ?? defaultVisitSeconds) + pointOverheadSeconds,
      0,
    );
  }

  private async pricing() {
    const [mode, perPointKopecks, minKopecks, maxKopecks, tiers] = await Promise.all([
      this.settings.get('walks.pricing.mode'),
      this.settings.get('walks.pricing.perPointKopecks'),
      this.settings.get('walks.pricing.minKopecks'),
      this.settings.get('walks.pricing.maxKopecks'),
      this.settings.get('walks.pricing.tiers'),
    ]);
    return { mode, perPointKopecks, minKopecks, maxKopecks, tiers };
  }

  private view(row: WalkRow, points: WalkPoint[], route: RouteGeometry | null): WalkView {
    const lockedCount = points.filter((point) => !point.accessible).length;
    const sellable = row.status !== 'purchased' && lockedCount > 0 && row.amountKopecks > 0;
    return {
      id: row.id,
      status: row.status,
      expiresAt: row.expiresAt?.toISOString() ?? null,
      requestedMinutes: row.requestedMinutes,
      start: { lat: row.startLat, lon: row.startLon },
      endMode: row.endMode,
      end: row.endLat !== null && row.endLon !== null ? { lat: row.endLat, lon: row.endLon } : null,
      categories: row.categoryIds ?? 'all',
      area: row.area,
      points,
      route,
      mapViewport: viewportOf(points),
      distanceMeters: row.distanceMeters,
      walkingSeconds: row.walkingSeconds,
      visitSeconds: row.visitSeconds,
      totalSeconds: row.walkingSeconds + row.visitSeconds,
      ...(sellable ? { walkUnlock: { lockedCount, amountKopecks: row.amountKopecks } } : {}),
    };
  }
}

/** The points a line was drawn for: their order and their coordinates. */
function routeKey(
  start: { lat: number; lon: number },
  points: readonly { latitude: number; longitude: number }[],
  end: { lat: number; lon: number } | null,
): string {
  const places = [
    start,
    ...points.map((point) => ({ lat: point.latitude, lon: point.longitude })),
    end ?? start,
  ];
  return places.map(({ lat, lon }) => `${lat},${lon}`).join(';');
}

function unlockTitle(row: WalkRow, pointCount: number): string {
  const hours = Math.round((row.requestedMinutes / 60) * 10) / 10;
  const duration = row.requestedMinutes < 60 ? `${row.requestedMinutes} мин` : `${hours} ч`;
  return `Прогулка на ${duration}, точек: ${pointCount}`;
}

/** A camera that holds the whole walk, with a little air around it. */
function viewportOf(points: readonly WalkPoint[]): WalkViewport | null {
  if (points.length === 0) return null;
  const latitudes = points.map((point) => point.latitude);
  const longitudes = points.map((point) => point.longitude);
  const south = Math.min(...latitudes);
  const north = Math.max(...latitudes);
  const west = Math.min(...longitudes);
  const east = Math.max(...longitudes);
  const latitudeMargin = Math.max((north - south) * VIEWPORT_MARGIN, 0.002);
  const longitudeMargin = Math.max((east - west) * VIEWPORT_MARGIN, 0.002);
  const span = Math.max(north - south, east - west) + 2 * latitudeMargin;
  return {
    center: { latitude: (south + north) / 2, longitude: (west + east) / 2 },
    // Rough web-mercator fit: the whole span across one screen height.
    zoom: Math.min(17, Math.max(11, Math.log2(360 / Math.max(span, 0.001)) - 1)),
    bounds: {
      south: south - latitudeMargin,
      north: north + latitudeMargin,
      west: west - longitudeMargin,
      east: east + longitudeMargin,
    },
  };
}
