import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import { type Request } from 'express';
import { z } from 'zod';

/** Languages content can be written in. The first one is the fallback. */
export const SUPPORTED_LOCALES = ['ru', 'en'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: Locale = SUPPORTED_LOCALES[0];

export const localeSchema = z.enum(SUPPORTED_LOCALES);

/** Picks the best supported language from an Accept-Language header. */
export function negotiateLocale(header: string | undefined): Locale {
  if (!header) return DEFAULT_LOCALE;
  const candidates = header
    .split(',')
    .map((part) => {
      const [tag = '', ...params] = part.trim().split(';');
      const q = params.find((param) => param.trim().startsWith('q='));
      return {
        language: tag.toLowerCase().split('-')[0] ?? '',
        weight: q ? Number(q.split('=')[1]) : 1,
      };
    })
    .filter((candidate) => candidate.weight > 0)
    .sort((a, b) => b.weight - a.weight);
  const match = candidates.find((candidate) =>
    (SUPPORTED_LOCALES as readonly string[]).includes(candidate.language),
  );
  return (match?.language as Locale | undefined) ?? DEFAULT_LOCALE;
}

/** The request's language, negotiated from Accept-Language. */
export const RequestLocale = createParamDecorator(
  (_data: unknown, context: ExecutionContext): Locale =>
    negotiateLocale(context.switchToHttp().getRequest<Request>().header('accept-language')),
);

/**
 * Picks the translation for `locale`, falling back to the default language and
 * then to any translation, so content is never missing because of language.
 */
export function pickTranslation<T extends { locale: string }>(
  translations: readonly T[],
  locale: Locale,
): T | undefined {
  return (
    translations.find((translation) => translation.locale === locale) ??
    translations.find((translation) => translation.locale === DEFAULT_LOCALE) ??
    translations[0]
  );
}
