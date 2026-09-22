import { Injectable } from '@nestjs/common';
import { type Locale } from '../../../platform/i18n';
import { MediaFacade } from '../../media';
import { type AppPointRow, type Bbox, PointsStore } from '../stores/points.store';
import {
  audioSeconds as audioSecondsOf,
  type PointContent,
  pointContent,
  pointFileIds,
} from './point-content';

/** What the walk planner needs to know about a point to choose it. */
export interface WalkCandidate {
  id: string;
  tourId: string;
  latitude: number;
  longitude: number;
  isFree: boolean;
  categoryIds: string[];
  /** Length of the narration in the requested language; null without audio. */
  audioSeconds: number | null;
}

/** A point of a generated walk: the same content as in a tour, plus its tour. */
export interface WalkPointContent extends PointContent {
  tourId: string;
}

export interface CandidateFilter {
  /** Pre-filter by a rectangle before any exact geometry is applied. */
  bbox?: Bbox;
  /** Undefined means every category. */
  categoryIds?: readonly string[];
}

/**
 * Points of an app as material for a generated walk: candidates to choose
 * from, and the full content of the ones that made it into the route.
 */
@Injectable()
export class WalkPointsService {
  constructor(
    private readonly points: PointsStore,
    private readonly media: MediaFacade,
  ) {}

  async candidates(
    appId: string,
    locale: Locale,
    filter: CandidateFilter = {},
  ): Promise<WalkCandidate[]> {
    const rows = await this.points.byApp(appId, filter.bbox);
    if (rows.length === 0) return [];
    const details = await this.points.details(rows);

    // The length of the narration lives on the audio file, so the files of the
    // recordings are resolved before the planner can weigh the points.
    const files = await this.media.findMany(
      details.audioTranslations.map((audio) => audio.audioFileId),
    );
    const audioSeconds = new Map<string, number | null>();
    for (const row of rows) {
      const recording = details.audioTranslations.find(
        (audio) => audio.pointId === row.id && audio.locale === locale,
      );
      const fallback = details.audioTranslations.find((audio) => audio.pointId === row.id);
      audioSeconds.set(row.id, audioSecondsOf(files, (recording ?? fallback)?.audioFileId));
    }
    const categories = new Map<string, string[]>();
    for (const link of details.categoryLinks) {
      categories.set(link.pointId, [...(categories.get(link.pointId) ?? []), link.categoryId]);
    }

    const candidates = deduplicate(rows, audioSeconds).map((row) => ({
      id: row.id,
      tourId: row.tourId,
      latitude: row.latitude,
      longitude: row.longitude,
      isFree: row.isFree,
      categoryIds: categories.get(row.id) ?? [],
      audioSeconds: audioSeconds.get(row.id) ?? null,
    }));

    if (!filter.categoryIds) return candidates;
    const wanted = new Set(filter.categoryIds);
    return candidates.filter((candidate) => candidate.categoryIds.some((id) => wanted.has(id)));
  }

  /** Full content of the given points, in the given order; unknown ids are skipped. */
  async contents(pointIds: readonly string[], locale: Locale): Promise<WalkPointContent[]> {
    const rows = await this.points.byIds(pointIds);
    if (rows.length === 0) return [];
    const details = await this.points.details(rows);
    const files = await this.media.findMany(
      pointFileIds(rows, details).filter((id): id is string => !!id),
    );
    const byId = new Map(
      rows.map((row) => [
        row.id,
        { ...pointContent(row, details, locale, files), tourId: row.tourId },
      ]),
    );
    return pointIds.flatMap((id) => byId.get(id) ?? []);
  }
}

/**
 * The same place appears as a separate point row in every tour that passes it,
 * so an app-wide selection would offer it several times. One row per
 * coordinate survives: with narration first, then free, then from the tour
 * that comes earliest in the list.
 */
function deduplicate(rows: AppPointRow[], audioSeconds: Map<string, number | null>): AppPointRow[] {
  const best = new Map<string, AppPointRow>();
  for (const row of rows) {
    const key = `${row.latitude.toFixed(5)},${row.longitude.toFixed(5)}`;
    const rival = best.get(key);
    if (!rival || better(row, rival, audioSeconds)) best.set(key, row);
  }
  return [...best.values()];
}

function better(
  row: AppPointRow,
  rival: AppPointRow,
  audioSeconds: Map<string, number | null>,
): boolean {
  const hasAudio = (point: AppPointRow) => (audioSeconds.get(point.id) ?? null) !== null;
  if (hasAudio(row) !== hasAudio(rival)) return hasAudio(row);
  if (row.isFree !== rival.isFree) return row.isFree;
  if (row.tourPosition !== rival.tourPosition) return row.tourPosition < rival.tourPosition;
  return row.id < rival.id;
}
