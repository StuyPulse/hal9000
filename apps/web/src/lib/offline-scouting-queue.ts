"use client";

import { createClient } from "@/lib/supabase/client";

export type QueuedScoutingEntry = {
  id: string;
  organization_id: string;
  event_id: string;
  team_id: string;
  match_id: string | null;
  assignment_id: string | null;
  scout_user_id: string;
  entry_type: "match" | "pit" | "pre_scout";
  form_version: number;
  payload: Record<string, unknown>;
  status: "draft" | "submitted";
  submitted_at: string | null;
  queued_at: string;
};

const databaseName = "hal9000-offline";
const storeName = "scouting-entry-queue";
const queueChangedEvent = "hal9000:offline-queue-changed";
const lastSyncKey = "hal9000:last-successful-sync";

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(storeName)) database.createObjectStore(storeName, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open local storage."));
  });
}

function requestValue<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Local storage request failed."));
  });
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Local storage transaction failed."));
    transaction.onabort = () => reject(transaction.error ?? new Error("Local storage transaction was cancelled."));
  });
}

function notifyQueueChanged() {
  window.dispatchEvent(new Event(queueChangedEvent));
}

export async function listQueuedScoutingEntries() {
  const database = await openDatabase();
  const transaction = database.transaction(storeName, "readonly");
  const entries = await requestValue(transaction.objectStore(storeName).getAll() as IDBRequest<QueuedScoutingEntry[]>);
  await transactionDone(transaction);
  database.close();
  return entries.sort((left, right) => right.queued_at.localeCompare(left.queued_at));
}

export async function queueScoutingEntry(entry: Omit<QueuedScoutingEntry, "queued_at">) {
  const database = await openDatabase();
  const transaction = database.transaction(storeName, "readwrite");
  transaction.objectStore(storeName).put({ ...entry, queued_at: new Date().toISOString() });
  await transactionDone(transaction);
  database.close();
  notifyQueueChanged();
}

export async function removeQueuedScoutingEntry(id: string) {
  const database = await openDatabase();
  const transaction = database.transaction(storeName, "readwrite");
  transaction.objectStore(storeName).delete(id);
  await transactionDone(transaction);
  database.close();
  notifyQueueChanged();
}

export function getLastSuccessfulSync() {
  return window.localStorage.getItem(lastSyncKey);
}

export async function syncQueuedScoutingEntries() {
  if (!navigator.onLine) return { synced: 0, failed: 0, pending: (await listQueuedScoutingEntries()).length };
  const entries = await listQueuedScoutingEntries();
  const supabase: any = createClient();
  let synced = 0;
  let failed = 0;
  for (const { queued_at: _queuedAt, ...entry } of entries) {
    const { error } = await supabase.from("scouting_entries").upsert(entry, { onConflict: "id" });
    if (error) {
      failed += 1;
      continue;
    }
    await removeQueuedScoutingEntry(entry.id);
    synced += 1;
  }
  if (synced > 0) window.localStorage.setItem(lastSyncKey, new Date().toISOString());
  return { synced, failed, pending: failed };
}

/** A captive portal can leave fetch pending even though navigator.onLine says
 * true. Prefer the local queue over keeping a scout-facing form disabled. */
export async function tryUpsertScoutingEntry(entry: Omit<QueuedScoutingEntry, "queued_at">) {
  if (!navigator.onLine) return { error: null as string | null, shouldQueue: true };
  const supabase: any = createClient();
  let timeout: number | undefined;
  try {
    const outcome: any = await Promise.race([
      supabase.from("scouting_entries").upsert(entry, { onConflict: "id" }).then((result: any) => ({ kind: "result", result })).catch(() => ({ kind: "network" })),
      new Promise((resolve) => { timeout = window.setTimeout(() => resolve({ kind: "timeout" }), 6000); }),
    ]);
    if (outcome.kind === "timeout" || outcome.kind === "network") return { error: null as string | null, shouldQueue: true };
    const error = outcome.result?.error;
    const message = String(error?.message ?? "");
    return { error: error ? message || "Could not save your report." : null, shouldQueue: Boolean(error && /fetch|network|failed to fetch|offline/i.test(message)) };
  } finally {
    if (timeout !== undefined) window.clearTimeout(timeout);
  }
}

export function onOfflineQueueChanged(listener: () => void) {
  window.addEventListener(queueChangedEvent, listener);
  return () => window.removeEventListener(queueChangedEvent, listener);
}
