/* Fiscaliza Docente PWA - reconstrução do mecanismo de atualização */
const BUILD_VERSION = "6.32.0";
const CACHE_NAME = `fiscaliza-docente-shell-v${BUILD_VERSION}`;
const CACHE_PREFIX = "fiscaliza-docente-shell-v";
const SHELL = [
  "./", "./index.html?v=6.32.0", "./style.css?v=6.32.0", "./app.js?v=6.32.0",
  "./supabase-sync.js", "./data.js", "./database.js", "./utils.js",
  "./manifest.webmanifest", "./icon-192.png", "./icon-512.png",
  "./icon-512-maskable.png", "./unig-logo.png", "./unig-logo-transparent.png"
];
self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.all(SHELL.map(async path => {
      try {
        const response = await fetch(path, {cache:"no-store"});
        if (response.ok && response.type === "basic") await cache.put(path, response.clone());
      } catch (_) { /* offline: install still completes */ }
    }));
    await self.skipWaiting();
  })());
});
self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith(CACHE_PREFIX) && k !== CACHE_NAME).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});
self.addEventListener("message", event => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
  if (event.data?.type === "CHECK_VERSION") event.ports?.[0]?.postMessage({version:BUILD_VERSION});
});
self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Do not interfere with Supabase, auth, storage, or any other external API.
  if (url.origin !== self.location.origin) return;
  const nav = req.mode === "navigate";
  const appAsset = nav || /\.(html|css|js|mjs|json|webmanifest|png|svg|ico|woff2?)$/i.test(url.pathname) || url.pathname.endsWith("/");
  if (!appAsset) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    try {
      // Network-first with no-store. The server's current files always win.
      const fresh = await fetch(req, {cache:"no-store"});
      if (fresh.ok && fresh.type === "basic") {
        await cache.put(req, fresh.clone());
        if (nav) await cache.put("./index.html", fresh.clone());
      }
      return fresh;
    } catch (err) {
      const fallback = await cache.match(req) || (nav ? await cache.match("./index.html?v=6.32.0") : null) || (nav ? await cache.match("./index.html") : null);
      if (fallback) return fallback;
      throw err;
    }
  })());
});
