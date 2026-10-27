const BUILD_VERSION = "6.30.3";
const CACHE_NAME = `fiscaliza-docente-pwa-v${BUILD_VERSION}-atualizacao-forcada`;
const CACHE_PREFIX = "fiscaliza-docente-pwa-";
const APP_SHELL = [
  "./",
  "./index.html?v=6.30.3",
  "./style.css?v=6.30.3",
  "./app.js?v=6.30.3",
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

self.addEventListener("message", event => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // Fetch a fresh copy of each shell file. Missing optional files do not block installation.
    await Promise.all(APP_SHELL.map(async path => {
      try {
        const response = await fetch(path, { cache: "reload" });
        if (response.ok && response.type !== "opaque") await cache.put(path, response.clone());
      } catch (_) {}
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    // Remove only app-shell caches; never touch IndexedDB/localStorage or Supabase.
    await Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  // Never intercept cross-origin requests (including Supabase API/auth/storage).
  if (url.origin !== self.location.origin) return;
  const isNavigation = request.mode === "navigate";
  const isAppFile = /\.(?:html|css|js|mjs|json|webmanifest|png|svg|ico|woff2?)$/i.test(url.pathname) || url.pathname.endsWith("/");
  if (!isNavigation && !isAppFile) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    try {
      // Network-first for all app files; query-string versions avoid stale cache keys.
      const response = await fetch(request, { cache: "no-store" });
      if (response && response.ok && response.type !== "opaque") {
        await cache.put(request, response.clone());
        if (isNavigation) await cache.put("./index.html", response.clone());
      }
      return response;
    } catch (error) {
      const cached = await cache.match(request) || (isNavigation ? await cache.match("./index.html") : null);
      if (cached) return cached;
      throw error;
    }
  })());
});
