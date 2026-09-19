import { Injectable } from '@nestjs/common';
import { type AppContext, AppDirectory } from '../../platform/app-context';
import { type AppRow, AppsStore, type Store } from './apps.store';
import { AppsService } from './apps.service';

export interface AppSummary extends AppContext {
  name: string;
  urlScheme: string | null;
  paymentStores: Store[];
  receiptEmailRequired: boolean;
}

const toSummary = (app: AppRow): AppSummary => ({
  id: app.id,
  slug: app.slug,
  bundleId: app.bundleId,
  name: app.name,
  urlScheme: app.urlScheme,
  paymentStores: app.paymentStores,
  receiptEmailRequired: app.receiptEmailRequired,
});

/** What other modules may ask of `apps`. */
@Injectable()
export class AppsFacade {
  constructor(
    private readonly service: AppsService,
    private readonly store: AppsStore,
  ) {}

  async findById(appId: string): Promise<AppSummary | null> {
    const app = await this.store.findById(appId);
    return app && toSummary(app);
  }

  /** Account deletion step: forgets which versions the user ran. Idempotent. */
  async deleteUserData(userId: string): Promise<void> {
    await this.store.deleteUserVersions(userId);
  }

  /** Used by the AppDirectory binding; see AppsDirectory. */
  async findByBundleId(bundleId: string): Promise<AppSummary | null> {
    const app = await this.service.findByBundleId(bundleId);
    return app && toSummary(app);
  }
}

/** Implementation of the platform AppDirectory port, bound in AppModule. */
@Injectable()
export class AppsDirectory extends AppDirectory {
  constructor(private readonly apps: AppsFacade) {
    super();
  }

  findByBundleId(bundleId: string): Promise<AppContext | null> {
    return this.apps.findByBundleId(bundleId);
  }

  findById(id: string): Promise<AppContext | null> {
    return this.apps.findById(id);
  }
}
