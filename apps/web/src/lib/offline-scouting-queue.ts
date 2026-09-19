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
const uploadTimeoutMs = 8_000;

type UploadAttempt = {
  error: string | null;
  timedOut: boolean;
  transient: boolean;
};

export type QueuedSyncResult = {
  synced: number;
  failed: number;
  pending: number;
  failureMessage: string | null;
};

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

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message || "Could not upload this report.";
  if (error && typeof error === "object") {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return typeof error === "string" && error.trim() ? error : "Could not upload this report.";
}

function isTransientUploadError(message: string) {
  return /abort|fetch|network|failed to fetch|offline|timed out|timeout/i.test(message);
}

/** A request can reach Supabase just before its response is interrupted. Since
 * report IDs are created client-side, a read-back makes that outcome safely
 * distinguishable from a failed write without creating a duplicate report. */
async function entryWasStored(supabase: any, entryId: string) {
  try {
    const { data, error } = await supabase
      .from("scouting_entries")
      .select("id")
      .eq("id", entryId)
      .maybeSingle();
    return !error && data?.id === entryId;
  } catch {
    return false;
  }
}

async function upsertScoutingEntry(
  supabase: any,
  entry: Omit<QueuedScoutingEntry, "queued_at">,
): Promise<UploadAttempt> {
  const controller = new AbortController();
  let timedOut = false;
  const timeout = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, uploadTimeoutMs);

  try {
    const { error } = await supabase
      .from("scouting_entries")
      .upsert(entry, { onConflict: "id" })
      .abortSignal(controller.signal);
    if (error && await entryWasStored(supabase, entry.id)) return { error: null, timedOut: false, transient: false };
    const message = error ? getErrorMessage(error) : null;
    return { error: message, timedOut, transient: timedOut || Boolean(message && isTransientUploadError(message)) };
  } catch (error) {
    if (await entryWasStored(supabase, entry.id)) return { error: null, timedOut: false, transient: false };
    const message = getErrorMessage(error);
    return { error: message, timedOut, transient: timedOut || isTransientUploadError(message) };
  } finally {
    window.clearTimeout(timeout);
  }
}

function syncFailureMessage(attempt: UploadAttempt) {
  if (attempt.timedOut) return "Upload timed out. Check the connection and retry.";
  if (attempt.transient) return "Could not reach the server. Check the connection and retry.";
  return "The server could not accept this report yet. It remains saved on this device.";
}

export async function syncQueuedScoutingEntries(): Promise<QueuedSyncResult> {
  const entries = await listQueuedScoutingEntries();
  if (!navigator.onLine) {
    return { synced: 0, failed: 0, pending: entries.length, failureMessage: "You are offline. Reports remain saved on this device." };
  }

  const supabase: any = createClient();
  let synced = 0;
  let failed = 0;
  let failureMessage: string | null = null;
  for (const { queued_at: _queuedAt, ...entry } of entries) {
    const attempt = await upsertScoutingEntry(supabase, entry);
    if (attempt.error) {
      failed += 1;
      failureMessage ??= syncFailureMessage(attempt);
      continue;
    }
    await removeQueuedScoutingEntry(entry.id);
    synced += 1;
  }
  if (synced > 0) window.localStorage.setItem(lastSyncKey, new Date().toISOString());
  return { synced, failed, pending: failed, failureMessage };
}

/** A captive portal can leave fetch pending even though navigator.onLine says
 * true. Prefer the local queue over keeping a scout-facing form disabled. */
export async function tryUpsertScoutingEntry(entry: Omit<QueuedScoutingEntry, "queued_at">) {
  if (!navigator.onLine) return { error: null as string | null, shouldQueue: true };
  const supabase: any = createClient();
  const attempt = await upsertScoutingEntry(supabase, entry);
  if (attempt.transient) return { error: null as string | null, shouldQueue: true };
  return { error: attempt.error, shouldQueue: false };
}

export function onOfflineQueueChanged(listener: () => void) {
  window.addEventListener(queueChangedEvent, listener);
  return () => window.removeEventListener(queueChangedEvent, listener);
}
