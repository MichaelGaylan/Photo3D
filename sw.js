// Service worker: works offline, updates on request.
// Bump CACHE with every release (it follows the app version and build).
const CACHE = 'photo3d-0.2.0-2026.11.28-5';
const SHELL = [
  './', 'index.html', 'css/app.css', 'manifest.webmanifest',
  'js/app.js', 'js/config.js', 'js/depth.js', 'js/depth-worker.js', 'js/relief.js', 'js/export.js',
  'js/theme.js', 'js/cleanup.js', 'js/view3d.js', 'js/profiles.js',
  'icons/icon.svg', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })))));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('photo3d-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('message', (e) => { if (e.data === 'skipWaiting') self.skipWaiting(); });

// Same-origin files: cache first. The depth model and its runtime come from
// Hugging Face and jsDelivr; transformers.js keeps those in its own cache.
// three.js (3D view) comes from jsDelivr and is kept in its own cache, so the
// 3D view works offline after its first use.
const LIB = 'p3dlib-three-0.187.0';
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method === 'GET' && url.href.startsWith('https://cdn.jsdelivr.net/npm/three@0.187.0/')) {
    e.respondWith(caches.open(LIB).then((c) => c.match(e.request).then((hit) => hit || fetch(e.request).then((r) => { if (r.ok) c.put(e.request, r.clone()); return r; }))));
    return;
  }
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request)));
});
