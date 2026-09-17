"use client";

import { CloudOff, RefreshCw } from "lucide-react";
import { useOffline } from "next/offline";
import { useCallback, useEffect, useState } from "react";
import { listQueuedScoutingEntries, onOfflineQueueChanged, syncQueuedScoutingEntries } from "@/lib/offline-scouting-queue";

export function OfflineSupport() {
  const offline = useOffline();
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const refreshPending = useCallback(async () => setPending((await listQueuedScoutingEntries()).length), []);

  const sync = useCallback(async () => {
    if (syncing || !navigator.onLine) return;
    setSyncing(true);
    try { await syncQueuedScoutingEntries(); }
    finally { await refreshPending(); setSyncing(false); }
  }, [refreshPending, syncing]);

  useEffect(() => {
    void refreshPending();
    const unregister = onOfflineQueueChanged(() => void refreshPending());
    const handleOnline = () => void sync();
    window.addEventListener("online", handleOnline);
    return () => { unregister(); window.removeEventListener("online", handleOnline); };
  }, [refreshPending, sync]);

  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, []);

  if (!offline && pending === 0) return null;
  return <aside className={`offline-banner${offline ? " is-offline" : ""}`} role="status">
    <CloudOff size={16} aria-hidden="true"/>
    <span>{offline ? "Offline — saved reports will stay on this device and upload when connection returns." : `${pending} report${pending === 1 ? "" : "s"} saved locally and waiting to upload.`}</span>
    {!offline && <button type="button" onClick={() => void sync()} disabled={syncing}>{syncing ? "Syncing…" : <><RefreshCw size={14} aria-hidden="true"/>Retry</>}</button>}
  </aside>;
}
