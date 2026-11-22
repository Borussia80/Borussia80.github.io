const CACHE_NAME = 'diceware-pwa-v9-quebec-1.1.1';
const APP_SHELL = [
  './', './index.html', './manifest.webmanifest', './wordlists.js', './AUDITORIA-LISTAS.md',
  './style.css?v=1',
  '../assets/quebec/tokens.css?v=1.1.1', '../assets/quebec/bundle.css?v=1.1.1',
  '../assets/quebec/quebec.js?v=1.1.1',
  '../assets/quebec/fonts/Inter-400.woff2', '../assets/quebec/fonts/Inter-500.woff2',
  '../assets/quebec/fonts/Inter-600.woff2', '../assets/quebec/fonts/JetBrainsMono-400.woff2',
  '../assets/quebec/fonts/JetBrainsMono-600.woff2', '../assets/quebec/fonts/TeXGyreAdventor-700.woff2',
  '../assets/quebec/logos/nome_quebec.svg', '../assets/quebec/logos/nome_quebec_branco.svg',
  '../assets/quebec/logos/favicon_16.png', '../assets/quebec/logos/favicon_32.png',
  '../assets/quebec/logos/apple-touch-icon.png', '../assets/quebec/logos/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key.startsWith('diceware-pwa-') && key !== CACHE_NAME).map((key) => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
      if (new URL(event.request.url).origin === self.location.origin && response.ok) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
      }
      return response;
    }))
  );
});
