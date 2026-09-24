import { Transactional } from '@nestjs-cls/transactional';
import {
  type BeforeApplicationShutdown,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { MARKER_SPEC, MediaFacade } from '../../media';
import { MarkersStore } from '../stores/markers.store';

/**
 * Map markers of points. Nobody uploads them: the server draws each one from
 * the point's cover photo (see media/marker-image.ts) and keeps them in step
 * with it on its own.
 *
 * - Saving a point draws its marker in the same transaction.
 * - On start, and then every ten minutes, markers drawn with another shape are
 *   redrawn and marker files no point uses any more are deleted. A changed
 *   shape therefore needs only a deploy.
 */
@Injectable()
export class MarkersService implements OnApplicationBootstrap, BeforeApplicationShutdown {
  private readonly logger = new Logger(MarkersService.name);
  private running: Promise<void> | null = null;

  constructor(
    private readonly store: MarkersStore,
    private readonly media: MediaFacade,
  ) {}

  /**
   * Marker columns for a point being saved, to be written together with it.
   * Call it before touching the point row: the marker lock is taken first, so
   * a concurrent redraw never waits on this transaction while holding it.
   */
  async fieldsFor(
    imageId: string | null,
  ): Promise<{ markerId: string | null; markerSpec: string | null }> {
    await this.store.lock();
    return this.draw(imageId);
  }

  /** Does not wait for the start to finish: the API serves requests meanwhile. */
  onApplicationBootstrap(): void {
    void this.reconcile();
  }

  async beforeApplicationShutdown(): Promise<void> {
    await this.running;
  }

  @Cron(CronExpression.EVERY_10_MINUTES)
  reconcile(): Promise<void> {
    // One pass at a time: a slow start must not overlap the first scheduled run.
    this.running ??= this.pass()
      .catch((error: unknown) => {
        this.logger.error(
          `Marker upkeep failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      })
      .finally(() => {
        this.running = null;
      });
    return this.running;
  }

  private async pass(): Promise<void> {
    let redrawn = 0;
    for (const { id } of await this.store.outdated(MARKER_SPEC)) {
      const result = await this.redraw(id).catch((error: unknown) => {
        // A photo that cannot be drawn must not stop the rest; it is retried next pass.
        this.logger.warn(
          `Marker of point ${id} not drawn: ${error instanceof Error ? error.message : String(error)}`,
        );
        return 'skipped' as const;
      });
      // Someone is saving points right now; the next pass continues.
      if (result === 'busy') break;
      if (result === 'redrawn') redrawn += 1;
    }
    const deleted = await this.sweep();
    if (redrawn + deleted > 0) {
      this.logger.log(`Markers: ${redrawn} redrawn, ${deleted} unused files deleted`);
    }
  }

  /**
   * Never waits on a lock: a transaction that is saving points holds the
   * marker lock or the point row, and this one simply steps aside.
   */
  @Transactional()
  private async redraw(pointId: string): Promise<'redrawn' | 'busy' | 'skipped'> {
    const point = await this.store.claimPoint(pointId);
    if (!point) return 'skipped';
    if (!(await this.store.tryLock())) return 'busy';
    const fields = await this.draw(point.imageId);
    await this.store.setMarker(point.id, fields.markerId, fields.markerSpec);
    return 'redrawn';
  }

  /** Deletes registered marker files that no point uses; returns how many. */
  @Transactional()
  private async sweep(): Promise<number> {
    if (!(await this.store.tryLock())) return 0;
    const unused = await this.store.unused();
    for (const fileId of unused) {
      await this.media.remove(fileId);
      await this.store.forget(fileId);
    }
    return unused.length;
  }

  private async draw(
    imageId: string | null,
  ): Promise<{ markerId: string | null; markerSpec: string | null }> {
    if (!imageId) return { markerId: null, markerSpec: null };
    const marker = await this.media.markerFrom(imageId);
    await this.store.register(marker.id);
    return { markerId: marker.id, markerSpec: MARKER_SPEC };
  }
}
