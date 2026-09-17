"use client";

import { useEffect } from "react";

const scheduleCache = "hal9000-schedule-v1";

/** Cache the already-authorized schedule document immediately, rather than
 * waiting for the next navigation after the service worker takes control. */
export function ScheduleOfflineCache({ path }: { path: string }) {
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const request = new Request(path, { credentials: "same-origin" });
        const response = await fetch(request, { credentials: "same-origin", cache: "no-store" });
        if (!cancelled && response.ok) await (await caches.open(scheduleCache)).put(request, response.clone());
      } catch {
        // The latest successful copy stays available if the network is gone.
      }
    })();
    return () => { cancelled = true; };
  }, [path]);
  return null;
}
