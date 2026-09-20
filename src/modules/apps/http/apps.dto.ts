import { z } from 'zod';
import { patchSchema, createZodDto } from '../../../platform/http';
import { type CurrentDocument } from '../../legal';
import { mediaUrl } from '../../media';
import { store } from '../apps.tables';
import { type AppRow, type AppVersionRow } from '../apps.store';
import { VERSION_PATTERN } from '../versions';

export const storeSchema = z.enum(store.enumValues);
const versionSchema = z.string().regex(VERSION_PATTERN, 'Expected major.minor.patch');
const optionalUrl = z.url().max(500).nullable();

const supportSchema = z.object({
  email: z.email().nullable(),
  telegramUrl: optionalUrl,
  vkUrl: optionalUrl,
  maxUrl: optionalUrl,
});

// ---- Mobile app ----

export const appConfigSchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  name: z.string(),
  urlScheme: z.string().nullable(),
  mapStyleUrl: z.string().nullable(),
  paymentStores: z.array(storeSchema),
  receiptEmailRequired: z.boolean(),
  support: supportSchema,
  /** Lottie JSON shown while the app starts. */
  loadingAnimationUrl: z.string().nullable(),
  /** Picture on the account recovery screen. */
  accountRecoveryImageUrl: z.string().nullable(),
});

const legalDocumentSchema = z.object({
  type: z.string(),
  versionId: z.uuid(),
  publicUrl: z.string().nullable(),
  fileUrl: z.string().nullable(),
});

/** Everything the app needs at start-up in one request. */
export class ClientConfigDto extends createZodDto(
  appConfigSchema.extend({
    /** Current terms and privacy policy; consent is checked separately when signed in. */
    legalDocuments: z.array(legalDocumentSchema),
    /** Server-tuned client behaviour, e.g. payment polling; see the settings catalog. */
    settings: z.record(z.string(), z.unknown()),
  }),
) {}

export const toLegalDocument = (document: CurrentDocument) => ({
  type: document.type,
  versionId: document.versionId,
  publicUrl: document.publicUrl,
  fileUrl: document.file?.url ?? null,
});

export class UpdateQueryDto extends createZodDto(
  z.object({ store: storeSchema, version: versionSchema }),
) {}

export class UpdateInfoDto extends createZodDto(
  z.object({
    latestVersion: z.string().nullable(),
    releaseNotes: z.string().nullable(),
    updateRequired: z.boolean(),
  }),
) {}

export class ReportInstallationDto extends createZodDto(
  z.object({ store: storeSchema, version: versionSchema }),
) {}

export const toAppConfig = (app: AppRow) => ({
  id: app.id,
  slug: app.slug,
  name: app.name,
  urlScheme: app.urlScheme,
  mapStyleUrl: app.mapStyleUrl,
  paymentStores: app.paymentStores,
  receiptEmailRequired: app.receiptEmailRequired,
  support: {
    email: app.supportEmail,
    telegramUrl: app.supportTelegramUrl,
    vkUrl: app.supportVkUrl,
    maxUrl: app.supportMaxUrl,
  },
  loadingAnimationUrl: app.loadingAnimationFileId && mediaUrl(app.loadingAnimationFileId),
  accountRecoveryImageUrl: app.accountRecoveryImageId && mediaUrl(app.accountRecoveryImageId),
});

// ---- Admin ----

const appInputSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]{2,32}$/, 'Lowercase letters, digits and dashes'),
  bundleId: z.string().regex(/^[a-zA-Z][\w-]*(\.[a-zA-Z][\w-]*)+$/, 'Reverse-DNS bundle id'),
  name: z.string().min(1).max(100),
  urlScheme: z
    .string()
    .regex(/^[a-z][a-z0-9+.-]*$/)
    .nullable()
    .default(null),
  mapStyleUrl: optionalUrl.default(null),
  paymentStores: z.array(storeSchema).default([]),
  receiptEmailRequired: z.boolean().default(false),
  support: supportSchema.partial().default({}),
  loadingAnimationFileId: z.uuid().nullable().default(null),
  accountRecoveryImageId: z.uuid().nullable().default(null),
});

export class CreateAppDto extends createZodDto(appInputSchema) {}
export class UpdateAppDto extends createZodDto(
  patchSchema(appInputSchema).extend({ support: supportSchema.partial().optional() }),
) {}

const adminAppSchema = appConfigSchema.extend({
  bundleId: z.string(),
  loadingAnimationFileId: z.uuid().nullable(),
  accountRecoveryImageId: z.uuid().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export class AdminAppDto extends createZodDto(adminAppSchema) {}
export class AdminAppListDto extends createZodDto(z.object({ items: z.array(adminAppSchema) })) {}

export const toAdminApp = (app: AppRow) => ({
  ...toAppConfig(app),
  bundleId: app.bundleId,
  loadingAnimationFileId: app.loadingAnimationFileId,
  accountRecoveryImageId: app.accountRecoveryImageId,
  createdAt: app.createdAt.toISOString(),
  updatedAt: app.updatedAt.toISOString(),
});

type SupportInput = Partial<z.infer<typeof supportSchema>>;

/** Maps the nested `support` object of a request onto table columns. */
export function supportColumns(support: SupportInput | undefined) {
  if (!support) return {};
  return {
    ...(support.email !== undefined && { supportEmail: support.email }),
    ...(support.telegramUrl !== undefined && { supportTelegramUrl: support.telegramUrl }),
    ...(support.vkUrl !== undefined && { supportVkUrl: support.vkUrl }),
    ...(support.maxUrl !== undefined && { supportMaxUrl: support.maxUrl }),
  };
}

const appVersionSchema = z.object({
  id: z.uuid(),
  store: storeSchema,
  version: z.string(),
  mandatory: z.boolean(),
  releaseNotes: z.string().nullable(),
  releasedAt: z.iso.datetime(),
});

export class AppVersionDto extends createZodDto(appVersionSchema) {}
export class AppVersionListDto extends createZodDto(
  z.object({ items: z.array(appVersionSchema) }),
) {}

export class CreateAppVersionDto extends createZodDto(
  z.object({
    store: storeSchema,
    version: versionSchema,
    mandatory: z.boolean().default(false),
    releaseNotes: z.string().max(2000).nullable().default(null),
  }),
) {}

export class AppVersionParamsDto extends createZodDto(
  z.object({ id: z.uuid(), versionId: z.uuid() }),
) {}

export const toAppVersion = (version: AppVersionRow) => ({
  id: version.id,
  store: version.store,
  version: version.version,
  mandatory: version.mandatory,
  releaseNotes: version.releaseNotes,
  releasedAt: version.releasedAt.toISOString(),
});
