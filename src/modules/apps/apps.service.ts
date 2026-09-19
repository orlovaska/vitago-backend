import { Injectable } from '@nestjs/common';
import { isUniqueViolation } from '../../platform/database';
import { AppError } from '../../platform/http';
import { MediaFacade } from '../media';
import {
  type AppInput,
  type AppRow,
  type AppVersionRow,
  AppsStore,
  type Store,
} from './apps.store';
import { compareVersions } from './versions';

export interface UpdateInfo {
  latestVersion: string | null;
  releaseNotes: string | null;
  /** A mandatory version newer than the client's exists: the app must update first. */
  updateRequired: boolean;
}

@Injectable()
export class AppsService {
  /**
   * Every @RequiresApp() request resolves its bundle id; apps change rarely and
   * only through this service, so a per-process cache dropped on write is exact.
   */
  private byBundleId: Promise<Map<string, AppRow>> | null = null;

  constructor(
    private readonly store: AppsStore,
    private readonly media: MediaFacade,
  ) {}

  async findByBundleId(bundleId: string): Promise<AppRow | null> {
    this.byBundleId ??= this.store
      .list()
      .then((rows) => new Map(rows.map((row) => [row.bundleId, row])))
      .catch((error: unknown) => {
        this.byBundleId = null;
        throw error;
      });
    return (await this.byBundleId).get(bundleId) ?? null;
  }

  list(): Promise<AppRow[]> {
    return this.store.list();
  }

  async get(id: string): Promise<AppRow> {
    const app = await this.store.findById(id);
    if (!app) throw AppError.notFound('app_not_found', `App ${id} not found`);
    return app;
  }

  async create(input: AppInput): Promise<AppRow> {
    await this.assertFilesExist(input);
    const app = await this.withUniqueCheck(() => this.store.create(input));
    this.byBundleId = null;
    return app;
  }

  async update(id: string, input: Partial<AppInput>): Promise<AppRow> {
    await this.assertFilesExist(input);
    const app = await this.withUniqueCheck(() => this.store.update(id, input));
    if (!app) throw AppError.notFound('app_not_found', `App ${id} not found`);
    this.byBundleId = null;
    return app;
  }

  async remove(id: string): Promise<void> {
    await this.store.delete(id);
    this.byBundleId = null;
  }

  listVersions(appId: string): Promise<AppVersionRow[]> {
    return this.store.listVersions(appId);
  }

  async addVersion(
    appId: string,
    version: { store: Store; version: string; mandatory: boolean; releaseNotes: string | null },
  ): Promise<AppVersionRow> {
    await this.get(appId);
    try {
      return await this.store.addVersion({ appId, ...version });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw AppError.conflict(
          'version_exists',
          `${version.version} for ${version.store} already exists`,
        );
      }
      throw error;
    }
  }

  async removeVersion(appId: string, versionId: string): Promise<void> {
    if (!(await this.store.deleteVersion(appId, versionId))) {
      throw AppError.notFound('version_not_found', `Version ${versionId} not found`);
    }
  }

  async updateInfo(appId: string, store: Store, currentVersion: string): Promise<UpdateInfo> {
    const versions = (await this.store.listVersions(appId))
      .filter((version) => version.store === store)
      .sort((a, b) => compareVersions(a.version, b.version));
    const latest = versions.at(-1);
    return {
      latestVersion: latest?.version ?? null,
      releaseNotes: latest?.releaseNotes ?? null,
      updateRequired: versions.some(
        (version) => version.mandatory && compareVersions(version.version, currentVersion) > 0,
      ),
    };
  }

  reportUserVersion(userId: string, appId: string, store: Store, version: string): Promise<void> {
    return this.store.reportUserVersion(userId, appId, store, version);
  }

  private async assertFilesExist(input: Partial<AppInput>): Promise<void> {
    const ids = [input.loadingAnimationFileId, input.accountRecoveryImageId].filter(
      (id): id is string => !!id,
    );
    const missing = await this.media.findMissing(ids);
    if (missing.length > 0) {
      throw AppError.badRequest('file_not_found', `Unknown file ids: ${missing.join(', ')}`);
    }
  }

  private async withUniqueCheck<T>(write: () => Promise<T>): Promise<T> {
    try {
      return await write();
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw AppError.conflict('app_exists', 'Another app already uses this slug or bundle id');
      }
      throw error;
    }
  }
}
