const STATIC_CACHE = "hal9000-static-v2";
const SCHEDULE_CACHE = "hal9000-schedule-v1";
const STATIC_ASSETS = ["/694-logo.svg", "/2026-field-map.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((cache) => Promise.all(STATIC_ASSETS.map((asset) => cache.add(asset).catch(() => undefined)))).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== STATIC_CACHE && key !== SCHEDULE_CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

function isScheduleRoute(url) {
  return /^\/events\/[^/]+\/matches\/?$/.test(url.pathname) || /^\/scout\/match\/?$/.test(url.pathname);
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (request.mode === "navigate" && isScheduleRoute(url)) {
    event.respondWith(fetch(request).then((response) => {
      if (response.ok) caches.open(SCHEDULE_CACHE).then((cache) => cache.put(request, response.clone()));
      return response;
    }).catch(async () => (await caches.match(request)) ?? new Response("This schedule has not been opened on this device yet.", { status: 503, headers: { "Content-Type": "text/plain" } })));
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
