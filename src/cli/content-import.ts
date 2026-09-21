import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';
import { type INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { AppsFacade } from '../modules/apps';
import { MediaFacade } from '../modules/media';
import { type PointInput, type TourInput, ToursFacade } from '../modules/tours';
import { loadDotEnvFile } from '../platform/config';
import {
  type ContentManifest,
  contentManifestSchema,
  type ManifestPoint,
  type ManifestTour,
} from './content-manifest';

const MIME_BY_EXTENSION: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.json': 'application/json',
  '.pdf': 'application/pdf',
};

/**
 * Imports content/<city>/manifest.json through the modules' facades, with the
 * same validation as the admin API. Safe to repeat: identical files are
 * stored once and everything else is matched by slug and replaced.
 *
 *   npm run content:import -- content/spb/manifest.json
 */
export class ContentImporter {
  private readonly uploaded = new Map<string, string>();

  constructor(
    private readonly app: INestApplicationContext,
    private readonly baseDir: string,
  ) {}

  async run(manifest: ContentManifest): Promise<{ appId: string; tours: number; points: number }> {
    const apps = this.app.get(AppsFacade);
    const tours = this.app.get(ToursFacade);

    const app = await apps.upsert(manifest.app);
    const categoryIds = new Map<string, string>();
    for (const category of manifest.categories) {
      categoryIds.set(
        category.slug,
        await tours.upsertCategory({ ...category, iconImageId: null }),
      );
    }

    let points = 0;
    for (const tour of manifest.tours) {
      const input = await this.tourInput(app.id, tour);
      const pointInputs = [];
      for (const point of tour.points) pointInputs.push(await this.pointInput(point, categoryIds));
      await tours.upsertTour(input, pointInputs);
      points += pointInputs.length;
      console.log(`  ${tour.slug}: ${pointInputs.length} points`);
    }
    return { appId: app.id, tours: manifest.tours.length, points };
  }

  private async tourInput(appId: string, tour: ManifestTour): Promise<TourInput> {
    const translations = [];
    for (const translation of tour.translations) {
      translations.push({
        locale: translation.locale,
        title: translation.title,
        subtitle: translation.subtitle ?? null,
        summary: translation.summary ?? null,
        description: translation.description ?? null,
        introAudioId: await this.file(translation.introAudio),
      });
    }
    const imageIds = [];
    for (const image of tour.images) imageIds.push((await this.file(image))!);
    return {
      appId,
      slug: tour.slug,
      status: tour.status,
      priceKopecks: tour.priceKopecks,
      position: tour.position,
      coverImageId: await this.file(tour.cover),
      distanceMeters: tour.distanceMeters ?? null,
      durationMinutes: tour.durationMinutes ?? null,
      mapViewport: tour.mapViewport ?? null,
      translations,
      imageIds,
    };
  }

  private async pointInput(
    point: ManifestPoint,
    categoryIds: Map<string, string>,
  ): Promise<PointInput> {
    const audioTranslations = [];
    for (const recording of point.audio?.translations ?? []) {
      audioTranslations.push({
        locale: recording.locale,
        audioFileId: (await this.file(recording.file))!,
        durationSeconds: recording.durationSeconds ?? null,
        transcript: recording.transcript ?? null,
        subtitles: recording.subtitles ?? null,
      });
    }
    const imageIds = [];
    for (const image of point.images) imageIds.push((await this.file(image))!);
    return {
      latitude: point.latitude,
      longitude: point.longitude,
      isFree: point.isFree,
      imageId: await this.file(point.image),
      imageIds,
      markerImageId: await this.file(point.marker),
      lockedMarkerImageId: await this.file(point.lockedMarker),
      categoryIds: point.categories.map((slug) => {
        const id = categoryIds.get(slug);
        if (!id) throw new Error(`Unknown category "${slug}"`);
        return id;
      }),
      translations: point.translations.map((translation) => ({
        locale: translation.locale,
        name: translation.name,
        description: translation.description ?? null,
        address: translation.address ?? null,
        openingHours: translation.openingHours ?? null,
      })),
      audio: point.audio
        ? {
            autoplayRadiusMeters: point.audio.autoplayRadiusMeters ?? 40,
            translations: audioTranslations,
          }
        : null,
    };
  }

  /** Uploads a file once per run and returns its media id. */
  private async file(relativePath: string | undefined): Promise<string | null> {
    if (!relativePath) return null;
    const path = resolve(this.baseDir, relativePath);
    const known = this.uploaded.get(path);
    if (known) return known;
    const mimeType = MIME_BY_EXTENSION[extname(path).toLowerCase()];
    if (!mimeType) throw new Error(`Unsupported file type: ${relativePath}`);
    const media = await this.app.get(MediaFacade).importFile(path, mimeType);
    this.uploaded.set(path, media.id);
    return media.id;
  }
}

async function main(): Promise<void> {
  const manifestPath = process.argv[2];
  if (!manifestPath) {
    console.error('usage: npm run content:import -- <path/to/manifest.json>');
    process.exit(2);
  }
  loadDotEnvFile();
  const manifest = contentManifestSchema.parse(
    JSON.parse(readFileSync(manifestPath, 'utf8')) as unknown,
  );
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    console.log(`Importing ${manifest.app.name} (${manifest.app.slug})`);
    const result = await new ContentImporter(app, dirname(resolve(manifestPath))).run(manifest);
    console.log(`Done: ${result.tours} tours, ${result.points} points`);
  } finally {
    await app.close();
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
