"use client";

import { Download, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { getLastSuccessfulSync, listQueuedScoutingEntries, onOfflineQueueChanged, syncQueuedScoutingEntries, type QueuedScoutingEntry } from "@/lib/offline-scouting-queue";

const labels: Record<QueuedScoutingEntry["entry_type"], string> = { match: "Match report", pit: "Pit report", pre_scout: "Pre-scout report" };

export function OfflineQueuePanel() {
  const [entries, setEntries] = useState<QueuedScoutingEntry[]>([]);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const refresh = useCallback(async () => { setEntries(await listQueuedScoutingEntries()); setLastSync(getLastSuccessfulSync()); }, []);
  useEffect(() => { void refresh(); return onOfflineQueueChanged(() => void refresh()); }, [refresh]);
  async function sync() { setSyncing(true); try { await syncQueuedScoutingEntries(); } finally { await refresh(); setSyncing(false); } }
  function downloadBackup() {
    const file = new Blob([JSON.stringify(entries, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url; link.download = `hal9000-offline-backup-${new Date().toISOString().slice(0, 10)}.json`; link.click(); URL.revokeObjectURL(url);
  }
  return <section className="card offline-queue-panel"><div className="card-head"><div><h2>Saved on this device</h2><p className="muted">Reports are assigned a permanent ID and upload safely once a connection is available.</p></div><div className="offline-queue-actions"><button className="button secondary" type="button" onClick={() => void sync()} disabled={syncing}>{syncing ? "Syncing…" : <><RefreshCw size={15}/>Retry sync</>}</button><button className="button secondary" type="button" onClick={downloadBackup} disabled={!entries.length}><Download size={15}/>Download backup</button></div></div>{lastSync && <p className="trend">Last successful local sync: {new Date(lastSync).toLocaleString()}</p>}{entries.length ? <div className="offline-queue-list">{entries.map((entry) => <div key={entry.id}><strong>{labels[entry.entry_type]}</strong><span>{entry.status === "submitted" ? "Ready to submit" : "Draft"} · saved {new Date(entry.queued_at).toLocaleString()}</span></div>)}</div> : <p className="muted">Nothing is waiting to upload.</p>}</section>;
}
