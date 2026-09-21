import { type Locale, pickTranslation } from '../../../platform/i18n';
import { type PointDetails, type PointRow } from '../stores/points.store';
import { type SubtitleCue } from '../tours.tables';

/** Everything the app shows about one point, in one language. */
export interface PointContent {
  id: string;
  position: number;
  latitude: number;
  longitude: number;
  isFree: boolean;
  name: string;
  description: string | null;
  address: string | null;
  openingHours: string | null;
  /** Cover photo, the one shown in lists and on the marker card. */
  imageUrl: string | null;
  /** Carousel of the point page, in display order; the cover is not in it. */
  imageUrls: string[];
  markerImageUrl: string | null;
  lockedMarkerImageUrl: string | null;
  categoryIds: string[];
  /** Null for a point without narration. */
  audio: {
    url: string | null;
    autoplayRadiusMeters: number;
    durationSeconds: number | null;
    transcript: string | null;
    subtitles: SubtitleCue[] | null;
  } | null;
}

export function urlOf(urls: Map<string, string>, id: string | null | undefined): string | null {
  return (id && urls.get(id)) || null;
}

/**
 * One point as the app reads it. Shared by tours and by generated walks, so a
 * point looks the same wherever it is shown.
 */
export function pointContent(
  point: PointRow,
  details: PointDetails,
  locale: Locale,
  urls: Map<string, string>,
): PointContent {
  const translation = pickTranslation(
    details.translations.filter((row) => row.pointId === point.id),
    locale,
  );
  const audio = details.audio.find((row) => row.pointId === point.id);
  const recording =
    audio &&
    pickTranslation(
      details.audioTranslations.filter((row) => row.pointId === point.id),
      locale,
    );
  return {
    id: point.id,
    position: point.position,
    latitude: point.latitude,
    longitude: point.longitude,
    isFree: point.isFree,
    name: translation?.name ?? '',
    description: translation?.description ?? null,
    address: translation?.address ?? null,
    openingHours: translation?.openingHours ?? null,
    imageUrl: urlOf(urls, point.imageId),
    imageUrls: details.images
      .filter((image) => image.pointId === point.id)
      .map((image) => urlOf(urls, image.fileId))
      .filter((url): url is string => url != null),
    markerImageUrl: urlOf(urls, point.markerImageId),
    lockedMarkerImageUrl: urlOf(urls, point.lockedMarkerImageId),
    categoryIds: details.categoryLinks
      .filter((link) => link.pointId === point.id)
      .map((link) => link.categoryId),
    audio: audio
      ? {
          url: urlOf(urls, recording?.audioFileId),
          autoplayRadiusMeters: audio.autoplayRadiusMeters,
          durationSeconds: recording?.durationSeconds ?? null,
          transcript: recording?.transcript ?? null,
          subtitles: recording?.subtitles ?? null,
        }
      : null,
  };
}

/** The media ids a set of points needs resolved into URLs. */
export function pointFileIds(rows: PointRow[], details: PointDetails): (string | null)[] {
  return [
    ...rows.flatMap((point) => [point.imageId, point.markerImageId, point.lockedMarkerImageId]),
    ...details.images.map((image) => image.fileId),
    ...details.audioTranslations.map((audio) => audio.audioFileId),
  ];
}
