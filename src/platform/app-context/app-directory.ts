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
}
