import { describe, expect, it } from 'vitest';
import { negotiateLocale, pickTranslation } from './locale';

describe('negotiateLocale', () => {
  it.each([
    [undefined, 'ru'],
    ['en', 'en'],
    ['en-US,en;q=0.9', 'en'],
    ['de-DE,de;q=0.9,en;q=0.5', 'en'],
    ['de', 'ru'],
    ['ru;q=0.2, en;q=0.8', 'en'],
    ['en;q=0', 'ru'],
  ])('%s → %s', (header, expected) => {
    expect(negotiateLocale(header)).toBe(expected);
  });
});

describe('pickTranslation', () => {
  const ru = { locale: 'ru', title: 'Эрмитаж' };
  const en = { locale: 'en', title: 'Hermitage' };

  it('prefers the requested language, then the default one', () => {
    expect(pickTranslation([ru, en], 'en')).toBe(en);
    expect(pickTranslation([ru], 'en')).toBe(ru);
    expect(pickTranslation([en], 'ru')).toBe(en);
    expect(pickTranslation([], 'ru')).toBeUndefined();
  });
});
