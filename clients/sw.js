// Service worker minimal : coquille hors-ligne (cache-first sur les fichiers
// statiques de l'app). On NE met PAS en cache les appels Firebase/données.
const CACHE = 'amtc-shell-v24';
const SHELL = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './js/firebase.js',
  './manifest.webmanifest',
  '../LOGOAMT.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) =>
    Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
  ));
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // On ne gère que la coquille locale ; le reste (Firebase, fonts, API) passe au réseau.
  if (url.origin !== location.origin) return;
  e.respondWith(
    caches.match(req).then((cached) => cached || fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
      return res;
    }).catch(() => cached))
  );
});
