const CACHE_NAME = "fiscaliza-docente-pwa-v6-30-2-atualizacao-corrigida";
const CACHE_PREFIX = "fiscaliza-docente-pwa-";
const APP_SHELL = [
  "./",
  "./index.html?v=6.30.2",
  "./style.css?v=6.30.2",
  "./app.js?v=6.30.2",
  "./supabase-sync.js",
  "./data.js",
  "./database.js",
  "./utils.js",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-512-maskable.png",
  "./unig-logo.png",
  "./unig-logo-transparent.png"
];

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // Cache the app shell, but do not let one missing optional asset block the update.
    await Promise.all(APP_SHELL.map(async path => {
      try {
        const response = await fetch(path, { cache: 'no-store' });
        if (response.ok && response.type !== 'opaque') await cache.put(path, response.clone());
      } catch (error) { /* Existing cached copy remains available as fallback. */ }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Never cache cross-origin requests (including Supabase APIs/auth/storage).
  if (url.origin !== self.location.origin) return;

  const isNavigation = request.mode === 'navigate';
  const isAppAsset = /\.(?:html|css|js|mjs|json|webmanifest|png|svg|ico|woff2?)$/i.test(url.pathname) || url.pathname.endsWith('/');
  if (!isNavigation && !isAppAsset) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    try {
      // Network-first prevents old cached HTML/JS/CSS from winning after deployment.
      const response = await fetch(request, { cache: 'no-store' });
      if (response && response.ok && response.type !== 'opaque') {
        await cache.put(request, response.clone());
        // Also refresh the canonical app-shell URL for requests with a version query.
        if (isNavigation) await cache.put('./index.html', response.clone());
      }
      return response;
    } catch (error) {
      const cached = await cache.match(request) || (isNavigation ? await cache.match('./index.html') : null);
      if (cached) return cached;
      throw error;
    }
  })());
});
