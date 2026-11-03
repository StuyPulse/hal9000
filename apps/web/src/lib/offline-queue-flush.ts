export type FlushAttempt = { error: string | null; transient: boolean };
export type FlushResult<T> = { synced: number; failed: number; pending: number; firstFailure: FlushAttempt | null; items: T[] };

/** Uploads in order. A dead connection stops the run instead of waiting out one timeout per report. */
export async function flushQueue<T>(entries: T[], upload: (entry: T) => Promise<FlushAttempt>, remove: (entry: T) => Promise<void>): Promise<FlushResult<T>> {
  let synced = 0, failed = 0;
  let firstFailure: FlushAttempt | null = null;
  const items: T[] = [];
  for (const entry of entries) {
    const attempt = await upload(entry);
    if (attempt.error) {
      firstFailure ??= attempt;
      if (attempt.transient) break;
      failed += 1;
      items.push(entry);
      continue;
    }
    await remove(entry);
    synced += 1;
  }
  return { synced, failed, pending: entries.length - synced, firstFailure, items };
}
