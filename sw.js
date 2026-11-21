// Only static application assets are cached. Proxy data and tokens are not cached.
const VERSION = '0.1.1';
const CACHE = 'hvsh-schiri-' + VERSION;
const ROOT = new URL('./', self.location.href);
const INDEX = new URL('index.html', ROOT);
const ASSETS = [
  './', './index.html', './styles.css?v=' + VERSION, './app.js?v=' + VERSION,
  './match.js?v=' + VERSION, './pdf.js', './font-metrics.js', './manifest.webmanifest',
  './assets/hvsh-form.jpg', './assets/icon-192.png', './assets/icon-512.png',
];

self.addEventListener('install', event => {
  const requests = ASSETS.map(path => new Request(new URL(path, ROOT), {cache:'reload'}));
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(requests)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  const cleanup = caches.keys().then(keys => Promise.all(
    keys.filter(key => key.startsWith('hvsh-schiri-') && key !== CACHE).map(key => caches.delete(key)),
  ));
  event.waitUntil(cleanup.then(() => self.clients.claim()));
});

async function loadPage(request) {
  let response;
  try {
    response = await fetch(request, {cache:'no-cache'});
    if (response.ok) return response;
  } catch { /* Offline navigation falls back to the installed page. */ }
  const cache = await caches.open(CACHE);
  return (await cache.match(ROOT.href)) || response || Response.error();
}

self.addEventListener('fetch', event => {
  const {request} = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || !url.href.startsWith(ROOT.href)) return;
  if (request.mode === 'navigate' && [ROOT.pathname, INDEX.pathname].includes(url.pathname)) {
    event.respondWith(loadPage(request));
    return;
  }
  event.respondWith(caches.open(CACHE).then(cache => cache.match(request)).then(hit => hit || fetch(request)));
});
