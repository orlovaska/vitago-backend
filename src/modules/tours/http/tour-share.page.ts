/**
 * The page behind a shared tour link, vitagoguides.ru/app/<slug>/tours/<tour>.
 *
 * Two kinds of visitors read it. Messengers and social networks fetch it for
 * the link preview and read only the Open Graph tags; they run no scripts, so
 * the tags are rendered here rather than by the site's SPA. People land on it
 * when the phone did not hand the link to the app: the app is not installed,
 * or the messenger opened the link in its own browser. They get the tour, a
 * button that opens it in the app, and the stores.
 */

export interface SharedTour {
  slug: string;
  title: string;
  subtitle: string | null;
  summary: string | null;
  description: string | null;
  /** Absolute URL of the cover, or null when the tour has none. */
  imageUrl: string | null;
}

export interface SharedApp {
  name: string;
  bundleId: string;
  urlScheme: string | null;
  /** Null when the app is not in the App Store (or Apple did not answer). */
  appStoreUrl: string | null;
}

export interface TourSharePage {
  /** Canonical address of this page, as it was shared. */
  pageUrl: string;
  /** Null when the city or the tour is unknown: the page then says so. */
  tour: SharedTour | null;
  app: SharedApp | null;
}

const SITE_NAME = 'Vitago';
/** Previews cut descriptions around here anyway; a cut of our own ends on a word. */
const DESCRIPTION_LIMIT = 200;
/** How long the iOS button waits for the app before sending the visitor to the App Store. */
const IOS_FALLBACK_MS = 1500;

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Escapes text for both element content and quoted attribute values. */
export const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (char) => ESCAPES[char]!);

function shorten(text: string, limit: number): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= limit) return flat;
  const cut = flat.slice(0, limit);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > limit / 2 ? cut.slice(0, lastSpace) : cut).replace(/[\s.,;:—-]+$/, '')}…`;
}

export const googlePlayUrl = (bundleId: string) =>
  `https://play.google.com/store/apps/details?id=${encodeURIComponent(bundleId)}`;

export const ruStoreUrl = (bundleId: string) =>
  `https://www.rustore.ru/catalog/app/${encodeURIComponent(bundleId)}`;

/**
 * Android link that opens the app on the tour; Chrome sends the visitor to
 * Google Play instead when the app is not installed.
 */
export const androidIntentUrl = (scheme: string, bundleId: string, tourSlug: string) =>
  `intent://tour/${encodeURIComponent(tourSlug)}#Intent;scheme=${scheme};` +
  `package=${bundleId};S.browser_fallback_url=${encodeURIComponent(googlePlayUrl(bundleId))};end`;

/** Numeric id from an App Store address, for the Safari smart banner. */
const appStoreId = (url: string): string | null => /\/id(\d+)/.exec(url)?.[1] ?? null;

export function renderTourSharePage({ pageUrl, tour, app }: TourSharePage): string {
  const title = tour ? tour.title : 'Маршрут не найден';
  const description = tour
    ? shorten(tour.summary ?? tour.description ?? '', DESCRIPTION_LIMIT)
    : 'Возможно, ссылка устарела. Все маршруты — в приложении аудиогида.';

  const meta = [
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="${SITE_NAME}">`,
    `<meta property="og:locale" content="ru_RU">`,
    `<meta property="og:title" content="${escapeHtml(title)}">`,
    `<meta property="og:url" content="${escapeHtml(pageUrl)}">`,
    description ? `<meta property="og:description" content="${escapeHtml(description)}">` : '',
    description ? `<meta name="description" content="${escapeHtml(description)}">` : '',
    tour?.imageUrl ? `<meta property="og:image" content="${escapeHtml(tour.imageUrl)}">` : '',
    `<meta name="twitter:card" content="${tour?.imageUrl ? 'summary_large_image' : 'summary'}">`,
  ];
  const bannerId = app?.appStoreUrl ? appStoreId(app.appStoreUrl) : null;
  if (bannerId) {
    meta.push(
      `<meta name="apple-itunes-app" content="app-id=${bannerId}, app-argument=${escapeHtml(pageUrl)}">`,
    );
  }

  const openButton =
    tour && app?.urlScheme
      ? `<a class="button primary" id="open" hidden` +
        ` href="${escapeHtml(`${app.urlScheme}://tour/${encodeURIComponent(tour.slug)}`)}"` +
        ` data-android="${escapeHtml(androidIntentUrl(app.urlScheme, app.bundleId, tour.slug))}"` +
        (app.appStoreUrl ? ` data-ios-fallback="${escapeHtml(app.appStoreUrl)}"` : '') +
        `>Открыть в приложении</a>`
      : '';

  const stores = app
    ? [
        app.appStoreUrl ? storeLink(app.appStoreUrl, 'App Store') : '',
        storeLink(googlePlayUrl(app.bundleId), 'Google Play'),
        storeLink(ruStoreUrl(app.bundleId), 'RuStore'),
      ].join('')
    : '';

  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} — ${SITE_NAME}</title>
<link rel="canonical" href="${escapeHtml(pageUrl)}">
${meta.filter(Boolean).join('\n')}
<style>${STYLE}</style>
</head>
<body>
<main class="card">
${tour?.imageUrl ? `<img class="cover" src="${escapeHtml(tour.imageUrl)}" alt="">` : ''}
<div class="content">
${tour?.subtitle ? `<p class="city">${escapeHtml(tour.subtitle)}</p>` : ''}
<h1>${escapeHtml(title)}</h1>
${description ? `<p class="summary">${escapeHtml(description)}</p>` : ''}
${openButton}
${
  stores
    ? `<p class="hint">${app ? `Аудиогид «${escapeHtml(app.name)}»` : 'Аудиогид'} в магазинах:</p>
<div class="stores">${stores}</div>`
    : ''
}
</div>
</main>
${openButton ? `<script>${SCRIPT}</script>` : ''}
</body>
</html>
`;
}

const storeLink = (href: string, label: string) =>
  `<a class="button" href="${escapeHtml(href)}" rel="noopener">${label}</a>`;

/**
 * Picks what "open in app" does on this device. Android gets the intent link,
 * which falls back to Google Play by itself. iOS tries the app's scheme and,
 * if the page is still in front a moment later, goes to the App Store — a
 * visitor without the app sees the store, not a Safari error. Computers have
 * no app to open, so the button stays hidden there.
 */
const SCRIPT = `(function () {
  var open = document.getElementById('open');
  var ua = navigator.userAgent;
  var android = /Android/i.test(ua);
  var ios = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (!open || (!android && !ios)) return;
  open.hidden = false;
  if (android) { open.href = open.getAttribute('data-android'); return; }
  var fallback = open.getAttribute('data-ios-fallback');
  if (!fallback) return;
  open.addEventListener('click', function () {
    var timer = setTimeout(function () { location.href = fallback; }, ${IOS_FALLBACK_MS});
    var cancel = function () { clearTimeout(timer); };
    document.addEventListener('visibilitychange', function () { if (document.hidden) cancel(); }, { once: true });
    window.addEventListener('pagehide', cancel, { once: true });
  });
})();`;

const STYLE = `
*{box-sizing:border-box}
[hidden]{display:none!important}
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:16px;
background:#f3f5fb;color:#14213d;font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Inter,sans-serif}
.card{width:100%;max-width:440px;background:#fff;border-radius:24px;overflow:hidden;box-shadow:0 8px 32px rgba(20,33,61,.12)}
.cover{display:block;width:100%;aspect-ratio:16/10;object-fit:cover;background:#e4e8f3}
.content{padding:20px 20px 24px}
.city{margin:0 0 4px;font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:#7a849c}
h1{margin:0;font-size:24px;line-height:1.25}
.summary{margin:12px 0 0;color:#4a5570}
.button{display:block;margin-top:10px;padding:13px 16px;border-radius:14px;border:1px solid #d5dbea;
text-align:center;text-decoration:none;font-weight:600;color:#14213d}
.primary{margin-top:20px;border:0;color:#fff;background:linear-gradient(90deg,#4f6bff,#8a5cff)}
.hint{margin:20px 0 0;font-size:14px;color:#7a849c}
.stores{display:flex;gap:8px;flex-wrap:wrap}
.stores .button{flex:1 1 120px}
`;
