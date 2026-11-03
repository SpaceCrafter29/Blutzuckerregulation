/* Service Worker: App offline verfügbar machen.
 * Erst Netz (damit immer die neueste Version kommt), ohne Netz aus dem Cache. */
const CACHE = 'glukosim-v3.6.0';
const DATEIEN = ['./', './index.html', './style.css', './app.js', './sim.js', './lebensmittel.js', './lebensmittel.csv', './chart.js',
  './optimierer.js', './demo.js', './manifest.json', './icon-192.png', './icon-512.png', './icon-maskable-512.png'];

self.addEventListener('install', e => {
  // cache: 'reload' holt die Dateien frisch vom Server, nicht aus dem Browser-Cache
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(DATEIEN.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('glukosim-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.open(CACHE).then(async c => {
      const hit = await c.match(e.request);
      if (hit) return hit;
      try { const r = await fetch(e.request); c.put(e.request, r.clone()); return r; } catch (err) { return new Response('', { status: 504 }); }
    }));
    return;
  }
  if (url.origin !== location.origin) return;
  // App-Dateien: erst Netz (max. 4 s), sonst Cache
  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    const ausCache = () => c.match(e.request, { ignoreSearch: true }).then(r => r || c.match('./index.html'));
    const netz = fetch(e.request, { cache: 'no-cache' }).then(r => { if (r.ok) c.put(e.request, r.clone()); return r; });
    const zuLang = new Promise(res => setTimeout(() => res(null), 4000));
    try {
      const r = await Promise.race([netz, zuLang]);
      if (r) return r;
      return (await ausCache()) || await netz;
    } catch (err) {
      return (await ausCache()) || new Response('Offline', { status: 503 });
    }
  })());
});
