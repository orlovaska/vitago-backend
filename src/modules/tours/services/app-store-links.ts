import { Injectable, Logger } from '@nestjs/common';

const LOOKUP_URL = 'https://itunes.apple.com/lookup';
const REQUEST_TIMEOUT_MS = 3_000;
/** An answer from Apple, including "no such app", holds for a day. */
const ANSWER_TTL_MS = 24 * 60 * 60 * 1000;
/** A failed lookup is retried sooner, so one outage does not hide the button for a day. */
const FAILURE_TTL_MS = 10 * 60 * 1000;

interface LookupResponse {
  results?: { trackViewUrl?: unknown }[];
}

/**
 * Where each app lives in the App Store. Unlike Google Play and RuStore, the
 * address carries a numeric id only Apple knows, so it is looked up by bundle
 * id and remembered. An app that is not in the store, or a lookup that failed,
 * gets null and its pages show no App Store button.
 */
@Injectable()
export class AppStoreLinks {
  private readonly logger = new Logger(AppStoreLinks.name);
  private readonly cache = new Map<string, { url: string | null; expiresAt: number }>();

  async urlFor(bundleId: string): Promise<string | null> {
    const cached = this.cache.get(bundleId);
    if (cached && cached.expiresAt > Date.now()) return cached.url;

    const answer = await this.lookup(bundleId);
    const url = answer === undefined ? null : answer;
    const ttl = answer === undefined ? FAILURE_TTL_MS : ANSWER_TTL_MS;
    this.cache.set(bundleId, { url, expiresAt: Date.now() + ttl });
    return url;
  }

  /** The store page, null when Apple has no such app, undefined when Apple did not answer. */
  private async lookup(bundleId: string): Promise<string | null | undefined> {
    try {
      const response = await fetch(
        `${LOOKUP_URL}?bundleId=${encodeURIComponent(bundleId)}&country=ru`,
        { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) },
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = (await response.json()) as LookupResponse;
      const url = body.results?.[0]?.trackViewUrl;
      return typeof url === 'string' && url.startsWith('https://') ? url : null;
    } catch (error) {
      this.logger.warn(`App Store lookup for ${bundleId} failed: ${String(error)}`);
      return undefined;
    }
  }
}
