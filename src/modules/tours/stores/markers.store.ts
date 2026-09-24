import { Injectable } from '@nestjs/common';
import { and, eq, isNotNull, isNull, ne, or, sql } from 'drizzle-orm';
import { type DbTxHost, InjectDb } from '../../../platform/database';
import { markerFiles, points } from '../tours.tables';

/**
 * One lock for everything that points at marker files: saving a point and
 * sweeping unused files. Without it a sweep could delete a shared marker at
 * the moment a new point is being given the same file.
 */
const MARKER_LOCK = sql`hashtext('tours.markers')`;

@Injectable()
export class MarkersStore {
  constructor(@InjectDb() private readonly txHost: DbTxHost) {}

  private get db() {
    return this.txHost.tx;
  }

  /** Waits for the marker lock; it is held until the current transaction ends. */
  async lock(): Promise<void> {
    await this.db.execute(sql`select pg_advisory_xact_lock(${MARKER_LOCK})`);
  }

  /** Takes the marker lock if it is free; never waits. */
  async tryLock(): Promise<boolean> {
    const rows = await this.db.execute<{ locked: boolean }>(
      sql`select pg_try_advisory_xact_lock(${MARKER_LOCK}) as locked`,
    );
    return rows[0]?.locked === true;
  }

  /** Points whose marker is missing, drawn with another spec, or left over without a photo. */
  async outdated(spec: string): Promise<{ id: string }[]> {
    return this.db
      .select({ id: points.id })
      .from(points)
      .where(
        or(
          and(
            isNotNull(points.imageId),
            or(isNull(points.markerId), isNull(points.markerSpec), ne(points.markerSpec, spec)),
          ),
          and(isNull(points.imageId), isNotNull(points.markerId)),
        ),
      );
  }

  /** Locks the point row for a redraw; null when it is gone or another transaction holds it. */
  async claimPoint(id: string): Promise<{ id: string; imageId: string | null } | null> {
    const [row] = await this.db
      .select({ id: points.id, imageId: points.imageId })
      .from(points)
      .where(eq(points.id, id))
      .for('update', { skipLocked: true });
    return row ?? null;
  }

  async setMarker(pointId: string, markerId: string | null, spec: string | null): Promise<void> {
    await this.db.update(points).set({ markerId, markerSpec: spec }).where(eq(points.id, pointId));
  }

  async register(fileId: string): Promise<void> {
    await this.db.insert(markerFiles).values({ fileId }).onConflictDoNothing();
  }

  /** Registered marker files that no point uses. */
  async unused(): Promise<string[]> {
    const rows = await this.db
      .select({ fileId: markerFiles.fileId })
      .from(markerFiles)
      .where(
        sql`not exists (select 1 from ${points} where ${points.markerId} = ${markerFiles.fileId})`,
      );
    return rows.map((row) => row.fileId);
  }

  async forget(fileId: string): Promise<void> {
    await this.db.delete(markerFiles).where(eq(markerFiles.fileId, fileId));
  }
}
