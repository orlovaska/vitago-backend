/** The city app a request comes from. */
export interface AppContext {
  id: string;
  /** Short stable name used in URLs and configuration, e.g. `spb`. */
  slug: string;
  bundleId: string;
}

/**
 * Port for looking up apps, implemented by the `apps` module. It lives in
 * platform so that any module can learn the calling app without importing
 * `apps`, which itself depends on several of them.
 */
export abstract class AppDirectory {
  abstract findByBundleId(bundleId: string): Promise<AppContext | null>;
  abstract findById(id: string): Promise<AppContext | null>;
  /** For public links, whose path names the city rather than the bundle. */
  abstract findBySlug(slug: string): Promise<AppLinkTarget | null>;
}

/** What a public link needs to hand the visitor over to the app. */
export interface AppLinkTarget extends AppContext {
  /** Store name of the app, shown on its pages. */
  name: string;
  /** The app's own URL scheme, e.g. `audio-guide-spb`; null when it has none. */
  urlScheme: string | null;
}
