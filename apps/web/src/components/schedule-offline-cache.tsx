"use client";

import { useEffect } from "react";

const scheduleCache = "hal9000-schedule-v1";

const staticCache = "hal9000-static-v2";

/** Cache authorized pages now, along with the scripts they need to run, rather than waiting
 * for the next navigation after the service worker takes control. A page without its scripts
 * would open offline but never respond to a tap. */
export function ScheduleOfflineCache({ path, paths = [] }: { path?: string; paths?: string[] }) {
  const key = [...(path ? [path] : []), ...paths].join("\n");
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const assets = new Set<string>();
      for (const target of key.split("\n").filter(Boolean)) {
        try {
          const request = new Request(target, { credentials: "same-origin" });
          const response = await fetch(request, { credentials: "same-origin", cache: "no-store" });
          if (cancelled) return;
          if (!response.ok || response.redirected) continue;
          const html = await response.clone().text();
          for (const match of html.matchAll(/\/_next\/static\/[^"'\\\s]+\.(?:js|css)/g)) assets.add(match[0]);
          await (await caches.open(scheduleCache)).put(request, response);
        } catch {
          // The latest successful copy stays available if the network is gone.
        }
      }
      try {
        const cache = await caches.open(staticCache);
        for (const asset of assets) if (!cancelled && !(await cache.match(asset))) await cache.add(asset).catch(() => undefined);
      } catch { /* Best effort: the page itself is already saved. */ }
    })();
    return () => { cancelled = true; };
  }, [key]);
  return null;
}
