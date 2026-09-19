"use client";

import { CloudOff, RefreshCw, X } from "lucide-react";
import { useOffline } from "next/offline";
import { useCallback, useEffect, useState } from "react";
import { listQueuedScoutingEntries, onOfflineQueueChanged, syncQueuedScoutingEntries } from "@/lib/offline-scouting-queue";

export function OfflineSupport() {
  const offline = useOffline();
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [queueKey, setQueueKey] = useState("");
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);
  const refreshPending = useCallback(async () => {
    const entries = await listQueuedScoutingEntries();
    setPending(entries.length);
    setQueueKey(entries.map((entry) => entry.id).sort().join(","));
  }, []);

  const sync = useCallback(async () => {
    if (syncing || !navigator.onLine) return;
    setSyncing(true);
    try {
      const result = await syncQueuedScoutingEntries();
      setSyncMessage(result.failed ? result.failureMessage : null);
    }
    finally { await refreshPending(); setSyncing(false); }
  }, [refreshPending, syncing]);

  useEffect(() => {
    const initialRefresh = window.setTimeout(() => void refreshPending(), 0);
    const unregister = onOfflineQueueChanged(() => void refreshPending());
    const handleOnline = () => void sync();
    window.addEventListener("online", handleOnline);
    return () => { window.clearTimeout(initialRefresh); unregister(); window.removeEventListener("online", handleOnline); };
  }, [refreshPending, sync]);

  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, []);

  const noticeKey = `${offline ? "offline" : "queued"}:${queueKey}`;
  if ((!offline && pending === 0) || dismissedKey === noticeKey) return null;
  return <aside className={`offline-banner${offline ? " is-offline" : ""}`} role="status">
    <CloudOff size={16} aria-hidden="true"/>
    <span>{offline ? "Offline — saved reports will stay on this device and upload when connection returns." : syncMessage ?? `${pending} report${pending === 1 ? "" : "s"} saved locally and waiting to upload.`}</span>
    {!offline && <button type="button" onClick={() => void sync()} disabled={syncing}>{syncing ? "Syncing…" : <><RefreshCw size={14} aria-hidden="true"/>Retry</>}</button>}
    <button type="button" aria-label="Dismiss saved-report notice" title="Hide this notice; the report stays saved on this device" onClick={() => setDismissedKey(noticeKey)}><X size={16} aria-hidden="true"/></button>
  </aside>;
}
