/* ============================================================
 * CANIVETE — service worker (offline-first p/ estáticos)
 * Estáticos: cache-first. Navegação e API: network-first.
 * ============================================================ */
const CACHE = 'canivete-v1';
const ESTATICOS = [
  './',
  './index.html',
  './css/estilo.css',
  './js/comum.js',
  './js/app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ESTATICOS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  // API e arquivos sempre da rede
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/arquivos/')) return;

  if (e.request.mode === 'navigate') {
    // rede primeiro, fallback para index.html em cache
    e.respondWith(
      fetch(e.request)
        .then((r) => {
          const copia = r.clone();
          caches.open(CACHE).then((c) => c.put('./index.html', copia));
          return r;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  e.respondWith(
    caches.match(e.request).then((r) => r || fetch(e.request).then((res) => {
      const copia = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copia));
      return res;
    }))
  );
});
