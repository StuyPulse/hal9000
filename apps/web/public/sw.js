const STATIC_CACHE = "hal9000-static-v2";
const SCHEDULE_CACHE = "hal9000-schedule-v1";
const STATIC_ASSETS = ["/694-logo.svg", "/2026-field-map.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((cache) => Promise.all(STATIC_ASSETS.map((asset) => cache.add(asset).catch(() => undefined)))).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== STATIC_CACHE && key !== SCHEDULE_CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

const NETWORK_WAIT_MS = 4000;
const OFFLINE_PAGE = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline | HAL9000</title><body style="font:16px/1.5 system-ui;margin:0;padding:24px;background:#0f1113;color:#ededef"><h1 style="font-size:22px">This page isn't saved on this device</h1><p>Reports you already saved are safe. Open a page you have used before, or check the connection.</p><p><a style="color:#ededef" href="/scout/offline">Saved reports</a></p><p><a style="color:#ededef" href="/scout/qr">Share by QR</a></p><p><a style="color:#ededef" href="/scout/match">Match scouting</a></p><p><a style="color:#ededef" href="/dashboard">Assignments</a></p>`;

function isOfflineRoute(url) {
  return /^\/(dashboard|submissions)\/?$/.test(url.pathname)
    || /^\/scout(\/.*)?$/.test(url.pathname)
    || /^\/events\/[^/]+\/(matches|teams|summary|picklist|strategy)\/?$/.test(url.pathname);
}

/** Venue Wi-Fi often accepts a request and never answers, so waiting on it can't be open-ended. */
function fetchWithin(request, milliseconds) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), milliseconds);
  return fetch(request, { signal: controller.signal }).finally(() => clearTimeout(timer));
}

async function savedPage(request) {
  return (await caches.match(request, { cacheName: SCHEDULE_CACHE })) ?? (await caches.match(request, { cacheName: SCHEDULE_CACHE, ignoreSearch: true }));
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (request.mode === "navigate" && isOfflineRoute(url)) {
    event.respondWith(fetchWithin(request, NETWORK_WAIT_MS).then(async (response) => {
      // A redirect here is the sign-in page, which must not replace a saved copy.
      if (response.ok && !response.redirected) await caches.open(SCHEDULE_CACHE).then((cache) => cache.put(request, response.clone()));
      return response;
    }).catch(async () => (await savedPage(request)) ?? new Response(OFFLINE_PAGE, { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } })));
    return;
  }
  // In-app navigation. Failing fast makes the router fall back to a full page load, handled above.
  if (request.headers.get("RSC") && isOfflineRoute(url)) {
    event.respondWith(fetchWithin(request, NETWORK_WAIT_MS));
    return;
  }
  if (["script", "style", "image", "font"].includes(request.destination)) {
    event.respondWith(caches.match(request).then((cached) => cached ?? fetch(request).then((response) => {
      if (response.ok) caches.open(STATIC_CACHE).then((cache) => cache.put(request, response.clone()));
      return response;
    })));
  }
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "hal9000:clear-private-caches") event.waitUntil(caches.delete(SCHEDULE_CACHE));
});
