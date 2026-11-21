// Only static application assets are cached. Proxy data and tokens are not cached.
const CACHE = 'hvsh-schiri-v03';
const ASSETS = ['./','./index.html','./styles.css','./app.js','./match.js','./pdf.js','./font-metrics.js','./manifest.webmanifest','./assets/hvsh-form.jpg','./assets/icon-192.png','./assets/icon-512.png'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('hvsh-schiri-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch', event => {
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||url.origin!==self.location.origin)return;
  event.respondWith(caches.match(event.request).then(hit=>hit||fetch(event.request)));
});
