// Network-first service worker so the app keeps working offline at competition venues.
const CACHE = 'frc-scouting-v1';
const ASSETS = [
  './',
  'index.html',
  'css/style.css',
  'css/report.css',
  'js/app.js',
  'js/model.js',
  'js/storage.js',
  'js/statbotics.js',
  'js/report.js',
  'vendor/jspdf.umd.min.js',
  'vendor/html2canvas.min.js',
  'vendor/qrcode.min.js',
  'vendor/lz-string.min.js',
  'manifest.webmanifest',
  'icon.svg',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});

const timeout = (ms) => new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms));

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    Promise.race([fetch(e.request), timeout(4000)])
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('index.html'))),
  );
});
