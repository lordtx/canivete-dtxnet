/* ============================================================
 * CANIVETE — service worker
 * Estratégia: network-first p/ estáticos e navegação (sempre pega
 * a versão nova quando online; cache é só fallback offline).
 * ============================================================ */
const CACHE = 'canivete-v2';
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

  // Network-first: busca a versão mais nova; cache só quando offline
  e.respondWith(
    fetch(e.request)
      .then((r) => {
        if (r && (r.status === 200 || r.type === 'basic' || r.type === 'default')) {
          const copia = r.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copia));
        }
        return r;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('./index.html')))
  );
});
