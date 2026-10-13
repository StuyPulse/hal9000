// Offline queue for the personal strategy drawing (one row per user and event).
// Pure and store-injected so the revision rules can be tested without SQLite or a network.
// Rules: a drawing is saved locally before any upload; every save bumps `revision`;
// an upload only retires the revision it actually sent, so a newer drawing made while an
// older upload was in flight is never lost.

export type QueuedDrawing = {
  id: string; organization_id: string; event_id: string; user_id: string;
  strokes: unknown[]; revision: number; changedAt: string; error: string | null;
  /** Set once the server accepted this revision. The row is kept until a fetched snapshot shows the same strokes. */
  acknowledgedAt?: string | null;
};
export type DrawingBase = { organization_id: string; event_id: string; user_id: string };
export type DrawingStore = {
  get(key: string): Promise<QueuedDrawing | null>;
  put(key: string, value: QueuedDrawing): Promise<void>;
  remove(key: string): Promise<void>;
  list(): Promise<QueuedDrawing[]>;
};
export type FlushResult = { uploaded: number; pending: number; error: string | null; aborted: boolean };
/** How long an acknowledged drawing keeps overriding server snapshots that never confirmed it. */
export const ACK_RETENTION_MS = 10 * 60 * 1000;
/** Return false to stop before the next row (for example when the signed-in account changed). */
export type FlushGuard = () => boolean;
export type OverlayRow = { id: string; user_id: string; strokes: unknown };

/** The queue key is the event: there is exactly one drawing per user and event in a scope. */
export const drawingKey = (eventId: string) => eventId;

export function nextDrawing(previous: QueuedDrawing | null, base: DrawingBase, strokes: unknown[], now: string, newId: () => string): QueuedDrawing {
  return { id: previous?.id ?? newId(), ...base, strokes, revision: (previous?.revision ?? 0) + 1, changedAt: now, error: null };
}

/** Rows saved before revisions existed have none; treat them as revision 1. */
export const normalizeDrawing = (value: QueuedDrawing): QueuedDrawing => ({ ...value, revision: Number.isInteger(value.revision) && value.revision > 0 ? value.revision : 1, error: value.error ?? null });

/** Server rows plus any drawing still waiting to upload; a pending local drawing always wins. */
export function overlayDrawing(serverRows: OverlayRow[] | undefined, pending: QueuedDrawing[], eventId: string): OverlayRow[] | undefined {
  const mine = pending.find((item) => item.event_id === eventId);
  if (!mine) return serverRows;
  const serverId = serverRows?.find((row) => row.user_id === mine.user_id)?.id;
  const others = (serverRows ?? []).filter((row) => row.user_id !== mine.user_id);
  return [...others, { id: serverId ?? mine.id, user_id: mine.user_id, strokes: mine.strokes }];
}

/** Structural equality with a tolerance for numbers that went through JSON/jsonb. */
export function sameStrokes(a: unknown, b: unknown): boolean {
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) < 1e-9;
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((item, index) => sameStrokes(item, b[index]));
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every((key) => Object.hasOwn(right, key) && sameStrokes(left[key], right[key]));
}

export function createDrawingQueue(store: DrawingStore, upload: (drawing: QueuedDrawing) => Promise<void>, newId: () => string, clock: () => string = () => new Date().toISOString()) {
  // Local read-modify-write steps are serialized; uploads run outside the chain so saving never waits on the network.
  let chain: Promise<unknown> = Promise.resolve();
  const exclusive = <T,>(task: () => Promise<T>): Promise<T> => {
    const run = chain.then(task, task);
    chain = run.catch(() => undefined);
    return run;
  };
  let flushing: Promise<FlushResult> | null = null;
  let again = false;

  const save = (base: DrawingBase, strokes: unknown[]) => exclusive(async () => {
    const key = drawingKey(base.event_id);
    const previous = await store.get(key);
    const next = nextDrawing(previous ? normalizeDrawing(previous) : null, base, strokes, clock(), newId);
    await store.put(key, next);
    return next;
  });

  const all = async () => (await store.list()).map(normalizeDrawing);
  const pending = async () => (await all()).filter((item) => !item.acknowledgedAt);
  const now = () => Date.parse(clock());

  async function pass(guard?: FlushGuard): Promise<FlushResult> {
    let uploaded = 0;
    let error: string | null = null;
    let aborted = false;
    for (const snapshot of await pending()) {
      if (guard && !guard()) { aborted = true; break; }
      try {
        await upload(snapshot);
        uploaded += 1;
        await exclusive(async () => {
          const latest = await store.get(drawingKey(snapshot.event_id));
          // Only acknowledge the revision that was sent; a newer one stays pending for the next pass.
          // The acknowledged row is retained so a snapshot fetched before this upload cannot bring old strokes back.
          if (latest && normalizeDrawing(latest).revision <= snapshot.revision) await store.put(drawingKey(snapshot.event_id), { ...normalizeDrawing(latest), error: null, acknowledgedAt: clock() });
        });
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : 'Upload failed.';
        error ??= message;
        await exclusive(async () => {
          const latest = await store.get(drawingKey(snapshot.event_id));
          if (latest && normalizeDrawing(latest).revision === snapshot.revision) await store.put(drawingKey(snapshot.event_id), { ...normalizeDrawing(latest), error: message });
        });
      }
    }
    return { uploaded, pending: (await pending()).length, error, aborted };
  }

  /** One flush at a time; a request made during a flush triggers exactly one more pass. */
  function flush(guard?: FlushGuard): Promise<FlushResult> {
    if (flushing) { again = true; return flushing; }
    flushing = (async () => {
      let total: FlushResult = { uploaded: 0, pending: 0, error: null, aborted: false };
      for (let passes = 0; passes < 5; passes += 1) {
        again = false;
        const result = await pass(guard);
        total = { uploaded: total.uploaded + result.uploaded, pending: result.pending, error: result.error ?? total.error, aborted: result.aborted };
        // Anything still pending after a clean pass was saved while it ran; a failed pass waits for the next sync.
        if (result.error || result.aborted || (!again && !result.pending)) break;
      }
      return total;
    })().finally(() => { flushing = null; });
    return flushing;
  }

  /**
   * Pending drawings win. After upload the acknowledged drawing keeps winning until a fetched server row has
   * the same strokes (then it is dropped) or the retention window passes, so a fetch that started before the
   * upload and returns after it cannot resurrect older strokes.
   */
  const overlay = (serverRows: OverlayRow[] | undefined, eventId: string) => exclusive(async () => {
    const rows = await all();
    const waiting = rows.filter((item) => !item.acknowledgedAt);
    if (waiting.some((item) => item.event_id === eventId)) return overlayDrawing(serverRows, waiting, eventId);
    const kept = rows.find((item) => item.event_id === eventId && item.acknowledgedAt);
    if (!kept) return serverRows;
    const server = serverRows?.find((row) => row.user_id === kept.user_id);
    const expired = now() - Date.parse(kept.acknowledgedAt as string) > ACK_RETENTION_MS;
    if ((server && sameStrokes(server.strokes, kept.strokes)) || expired) {
      await store.remove(drawingKey(eventId));
      return serverRows;
    }
    return overlayDrawing(serverRows, [kept], eventId);
  });

  return { save, flush, overlay, pending };
}

// --- network mapping (client injected so it can be tested) ------------------------------------

type Rows = { data: { id: string }[] | null; error: { code?: string; message: string } | null };
type Filtered = { eq(column: string, value: string): Filtered; select(columns: string): PromiseLike<Rows> };
export type DrawingClient = {
  from(table: 'strategy_drawings'): {
    select(columns: string): { eq(column: string, value: string): { eq(column: string, value: string): { maybeSingle(): PromiseLike<{ data: { id: string } | null; error: { message: string } | null }> } } };
    update(values: Record<string, unknown>): Filtered;
    insert(values: Record<string, unknown>): { select(columns: string): PromiseLike<Rows> };
  };
};

/** Finds the server row by (event, user) and updates it by id so its primary key is never rewritten. */
export async function uploadDrawingWith(client: DrawingClient, drawing: QueuedDrawing): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const table = client.from('strategy_drawings');
    const { data: existing, error: readError } = await table.select('id').eq('event_id', drawing.event_id).eq('user_id', drawing.user_id).maybeSingle();
    if (readError) throw new Error(readError.message);
    if (existing) {
      const { data, error } = await table.update({ strokes: drawing.strokes }).eq('id', existing.id).select('id');
      if (error) throw new Error(error.message);
      if (!data?.length) throw new Error('The server did not save the strategy drawing.');
      return;
    }
    const { data, error } = await table.insert({ id: drawing.id, organization_id: drawing.organization_id, event_id: drawing.event_id, user_id: drawing.user_id, strokes: drawing.strokes }).select('id');
    // Another device inserted first: loop once and update that row instead.
    if (error?.code === '23505') continue;
    if (error) throw new Error(error.message);
    if (!data?.length) throw new Error('The server did not save the strategy drawing.');
    return;
  }
  throw new Error('The strategy drawing could not be saved. Try again.');
}
