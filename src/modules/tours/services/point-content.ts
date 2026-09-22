import { type Locale, pickTranslation } from '../../../platform/i18n';
import { type MediaFile } from '../../media';
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

export function urlOf(files: Map<string, MediaFile>, id: string | null | undefined): string | null {
  return (id && files.get(id)?.url) || null;
}

/**
 * One point as the app reads it. Shared by tours and by generated walks, so a
 * point looks the same wherever it is shown.
 */
export function pointContent(
  point: PointRow,
  details: PointDetails,
  locale: Locale,
  files: Map<string, MediaFile>,
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
    imageUrl: urlOf(files, point.imageId),
    imageUrls: details.images
      .filter((image) => image.pointId === point.id)
      .map((image) => urlOf(files, image.fileId))
      .filter((url): url is string => url != null),
    markerImageUrl: urlOf(files, point.markerImageId),
    lockedMarkerImageUrl: urlOf(files, point.lockedMarkerImageId),
    categoryIds: details.categoryLinks
      .filter((link) => link.pointId === point.id)
      .map((link) => link.categoryId),
    audio: audio
      ? {
          url: urlOf(files, recording?.audioFileId),
          autoplayRadiusMeters: audio.autoplayRadiusMeters,
          // Measured on the file itself when it was uploaded, never entered by hand.
          durationSeconds: audioSeconds(files, recording?.audioFileId),
          transcript: recording?.transcript ?? null,
          subtitles: recording?.subtitles ?? null,
        }
      : null,
  };
}

/** Playing time of a recording, as measured when its file was uploaded. */
export function audioSeconds(
  files: Map<string, MediaFile>,
  audioFileId: string | null | undefined,
): number | null {
  return audioFileId ? (files.get(audioFileId)?.durationSeconds ?? null) : null;
}

/** The media ids a set of points needs resolved into URLs. */
export function pointFileIds(rows: PointRow[], details: PointDetails): (string | null)[] {
  return [
    ...rows.flatMap((point) => [point.imageId, point.markerImageId, point.lockedMarkerImageId]),
    ...details.images.map((image) => image.fileId),
    ...details.audioTranslations.map((audio) => audio.audioFileId),
  ];
}
