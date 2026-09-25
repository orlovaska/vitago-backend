import { describe, expect, it } from 'vitest';
import {
  androidIntentUrl,
  escapeHtml,
  renderTourSharePage,
  type TourSharePage,
} from './tour-share.page';

const page = (overrides: Partial<TourSharePage> = {}): TourSharePage => ({
  pageUrl: 'https://vitagoguides.ru/app/spb/tours/neva',
  tour: {
    slug: 'neva',
    title: 'Нева и мосты',
    subtitle: 'Санкт-Петербург',
    summary: 'Прогулка вдоль набережных',
    description: 'Длинное описание',
    imageUrl: 'https://api.vitagoguides.ru/v1/media/cover',
  },
  app: {
    name: 'Аудиогид СПб',
    bundleId: 'com.vitago.audioguide.spb',
    urlScheme: 'audio-guide-spb',
    appStoreUrl: 'https://apps.apple.com/ru/app/vitago/id123456789?uo=4',
  },
  ...overrides,
});

describe('renderTourSharePage', () => {
  it('gives link previews the tour title, summary, cover and address', () => {
    const html = renderTourSharePage(page());
    expect(html).toContain('<meta property="og:title" content="Нева и мосты">');
    expect(html).toContain('<meta property="og:description" content="Прогулка вдоль набережных">');
    expect(html).toContain(
      '<meta property="og:image" content="https://api.vitagoguides.ru/v1/media/cover">',
    );
    expect(html).toContain(
      '<meta property="og:url" content="https://vitagoguides.ru/app/spb/tours/neva">',
    );
    expect(html).toContain('content="summary_large_image"');
  });

  it('falls back to a shortened description when the tour has no summary', () => {
    const long = `${'слово '.repeat(60)}конец`;
    const html = renderTourSharePage(
      page({ tour: { ...page().tour!, summary: null, description: long } }),
    );
    const description = /og:description" content="([^"]*)"/.exec(html)?.[1] ?? '';
    expect(description.length).toBeLessThanOrEqual(201);
    expect(description.endsWith('…')).toBe(true);
    expect(description).not.toContain('конец');
  });

  it('escapes content from the database', () => {
    const html = renderTourSharePage(
      page({ tour: { ...page().tour!, title: '<script>"x" & \'y\'</script>' } }),
    );
    expect(html).not.toContain('<script>"x"');
    expect(html).toContain('&lt;script&gt;&quot;x&quot; &amp; &#39;y&#39;&lt;/script&gt;');
  });

  it('opens the tour in the app by its scheme, and by an intent on Android', () => {
    const html = renderTourSharePage(page());
    expect(html).toContain('href="audio-guide-spb://tour/neva"');
    expect(html).toContain(
      `data-android="${escapeHtml(
        androidIntentUrl('audio-guide-spb', 'com.vitago.audioguide.spb', 'neva'),
      )}"`,
    );
    expect(html).toContain(
      'data-ios-fallback="https://apps.apple.com/ru/app/vitago/id123456789?uo=4"',
    );
  });

  it('builds an Android intent that falls back to Google Play', () => {
    expect(androidIntentUrl('audio-guide-spb', 'com.vitago.audioguide.spb', 'neva')).toBe(
      'intent://tour/neva#Intent;scheme=audio-guide-spb;package=com.vitago.audioguide.spb;' +
        `S.browser_fallback_url=${encodeURIComponent(
          'https://play.google.com/store/apps/details?id=com.vitago.audioguide.spb',
        )};end`,
    );
  });

  it('links all three stores and the Safari banner when the app is in the App Store', () => {
    const html = renderTourSharePage(page());
    expect(html).toContain('>App Store</a>');
    expect(html).toContain(
      'https://play.google.com/store/apps/details?id=com.vitago.audioguide.spb',
    );
    expect(html).toContain('https://www.rustore.ru/catalog/app/com.vitago.audioguide.spb');
    expect(html).toContain('<meta name="apple-itunes-app" content="app-id=123456789');
  });

  it('leaves the App Store out when Apple does not know the app', () => {
    const html = renderTourSharePage(page({ app: { ...page().app!, appStoreUrl: null } }));
    expect(html).not.toContain('App Store');
    expect(html).not.toContain('apple-itunes-app');
    expect(html).not.toContain('data-ios-fallback="');
    expect(html).toContain('>Google Play</a>');
  });

  it('shows no open button when the app has no scheme', () => {
    const html = renderTourSharePage(page({ app: { ...page().app!, urlScheme: null } }));
    expect(html).not.toContain('id="open"');
    expect(html).not.toContain('<script>');
  });

  it('says the tour is gone when it is not found', () => {
    const html = renderTourSharePage(page({ tour: null }));
    expect(html).toContain('<h1>Маршрут не найден</h1>');
    expect(html).not.toContain('og:image');
    expect(html).not.toContain('id="open"');
    expect(html).toContain('>RuStore</a>');
  });
});
