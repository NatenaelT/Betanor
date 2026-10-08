const CACHE_PREFIX = "betanor-platform";
const STATIC_CACHE = `${CACHE_PREFIX}-static-v3`;
const OFFLINE_PAGE = "/offline.html";
const PRECACHE = [OFFLINE_PAGE, "/betanor-icon-192.png"];
let lowDataMode = false;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then(async (cache) => {
    // One missing asset must not prevent the worker from installing.
    await Promise.allSettled(PRECACHE.map((url) => cache.add(url)));
  }));
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames
      .filter((name) => name.startsWith(CACHE_PREFIX) && name !== STATIC_CACHE)
      .map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") void self.skipWaiting();
  if (event.data?.type === "SET_NETWORK_MODE") {
    lowDataMode = event.data.lowDataMode === true;
    event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.put(
      "/__betanor_low_data_mode__",
      new Response(lowDataMode ? "on" : "off", { headers: { "Content-Type": "text/plain" } }),
    )));
  }
  if (event.data?.type === "CLEAR_CACHE") {
    event.waitUntil((async () => {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames
        .filter((name) => name.startsWith(CACHE_PREFIX))
        .map((name) => caches.delete(name)));
      event.ports[0]?.postMessage({ ok: true });
    })());
  }
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      let useLowDataMode = lowDataMode;
      try {
        const preference = await (await caches.open(STATIC_CACHE)).match("/__betanor_low_data_mode__");
        if (preference) useLowDataMode = (await preference.text()) === "on";
      } catch { /* automatic timeout is the safe fallback */ }
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), useLowDataMode ? 35_000 : 50_000);
      try {
        return await fetch(request, { signal: controller.signal });
      } catch {
        const offline = await caches.match(OFFLINE_PAGE);
        return offline || new Response("Betanor could not connect. Check your connection and try again.", {
          status: 503,
          headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
        });
      } finally {
        clearTimeout(timeout);
      }
    })());
    return;
  }

  // Only versioned Next.js build files are cached. APIs, RSC/data requests,
  // Supabase traffic, and authenticated route responses are intentionally not.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith((async () => {
      const cache = await caches.open(STATIC_CACHE);
      const cached = await cache.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok && response.type === "basic") await cache.put(request, response.clone());
      return response;
    })());
  }
});
