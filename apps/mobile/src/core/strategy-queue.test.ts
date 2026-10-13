import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACK_RETENTION_MS, createDrawingQueue, nextDrawing, overlayDrawing, uploadDrawingWith, type DrawingClient, type DrawingStore, type QueuedDrawing } from './strategy-queue';

const base = { organization_id: 'org', event_id: 'ev', user_id: 'me' };
const memory = () => {
  const rows = new Map<string, QueuedDrawing>();
  const store: DrawingStore = {
    get: async (key) => rows.get(key) ?? null,
    put: async (key, value) => { rows.set(key, value); },
    remove: async (key) => { rows.delete(key); },
    list: async () => [...rows.values()],
  };
  return { rows, store };
};
let counter = 0;
const ids = () => `id-${++counter}`;
const stroke = (n: number) => [{ color: '#fff', points: [{ x: n / 10, y: 0.5 }] }];

test('every save bumps the revision and keeps one stable id per event', async () => {
  const { store, rows } = memory();
  const queue = createDrawingQueue(store, async () => undefined, ids, () => 'now');
  const first = await queue.save(base, stroke(1));
  const second = await queue.save(base, stroke(2));
  assert.equal(first.revision, 1);
  assert.equal(second.revision, 2);
  assert.equal(second.id, first.id);
  assert.equal(rows.size, 1);
});

test('a successful upload retires the queue and uploads exactly the saved strokes', async () => {
  const { store, rows } = memory();
  const sent: QueuedDrawing[] = [];
  const queue = createDrawingQueue(store, async (drawing) => { sent.push(drawing); }, ids);
  await queue.save(base, stroke(3));
  const result = await queue.flush();
  assert.deepEqual({ uploaded: result.uploaded, pending: result.pending, error: result.error }, { uploaded: 1, pending: 0, error: null });
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].strokes, stroke(3));
  assert.ok(rows.get('ev')!.acknowledgedAt); // retained until a fetched snapshot confirms it
});

test('a newer drawing saved during an older upload is not removed by that upload', async () => {
  const { store, rows } = memory();
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const uploads: number[] = [];
  const queue = createDrawingQueue(store, async (drawing) => {
    uploads.push(drawing.revision);
    if (drawing.revision === 1) await gate;
  }, ids);
  await queue.save(base, stroke(1));
  const flushing = queue.flush();
  await new Promise((resolve) => setTimeout(resolve, 5));
  await queue.save(base, stroke(2)); // made while revision 1 is uploading
  release();
  const result = await flushing;
  assert.deepEqual(uploads, [1, 2]); // the newer one was replayed after the older finished
  assert.equal(result.pending, 0);
  assert.equal(rows.get('ev')!.revision, 2);
  assert.ok(rows.get('ev')!.acknowledgedAt);
});

test('the newer revision survives when only the older upload succeeded', async () => {
  const { store, rows } = memory();
  let calls = 0;
  const queue = createDrawingQueue(store, async (drawing) => {
    calls += 1;
    if (drawing.revision === 2) throw new Error('offline');
    await queue.save(base, stroke(2));
  }, ids);
  await queue.save(base, stroke(1));
  const result = await queue.flush();
  assert.equal(calls, 2);
  assert.equal(result.error, 'offline');
  assert.equal(result.pending, 1);
  const kept = rows.get('ev')!;
  assert.equal(kept.revision, 2);
  assert.deepEqual(kept.strokes, stroke(2));
  assert.equal(kept.error, 'offline');
});

test('failed uploads keep the drawing and later replay it', async () => {
  const { store, rows } = memory();
  let online = false;
  const queue = createDrawingQueue(store, async () => { if (!online) throw new Error('Network request failed'); }, ids);
  await queue.save(base, stroke(4));
  const failed = await queue.flush();
  assert.equal(failed.uploaded, 0);
  assert.equal(failed.pending, 1);
  assert.equal(rows.get('ev')!.error, 'Network request failed');
  online = true;
  const ok = await queue.flush();
  assert.equal(ok.uploaded, 1);
  assert.equal(ok.pending, 0);
  assert.ok(rows.get('ev')!.acknowledgedAt);
});

test('refresh overlay keeps a pending drawing over the server row and reuses the server id', async () => {
  const { store } = memory();
  const queue = createDrawingQueue(store, async () => { throw new Error('offline'); }, ids);
  const server = [{ id: 'server-row', user_id: 'me', strokes: stroke(9) }, { id: 'other', user_id: 'you', strokes: [] }];
  assert.deepEqual(await queue.overlay(server, 'ev'), server);
  await queue.save(base, stroke(5));
  const merged = await queue.overlay(server, 'ev');
  assert.deepEqual(merged, [{ id: 'other', user_id: 'you', strokes: [] }, { id: 'server-row', user_id: 'me', strokes: stroke(5) }]);
  assert.deepEqual(await queue.overlay(server, 'another-event'), server);
  assert.deepEqual(await queue.overlay(undefined, 'ev'), [{ id: (await queue.pending())[0].id, user_id: 'me', strokes: stroke(5) }]);
});

test('legacy queue rows without a revision are replayed as revision 1', async () => {
  const { store, rows } = memory();
  const legacy = { id: 'old', organization_id: 'org', event_id: 'ev', user_id: 'me', strokes: stroke(7), changedAt: 'x' } as unknown as QueuedDrawing;
  rows.set('ev', legacy);
  const sent: number[] = [];
  const queue = createDrawingQueue(store, async (drawing) => { sent.push(drawing.revision); }, ids);
  await queue.flush();
  assert.deepEqual(sent, [1]);
  assert.equal((await queue.pending()).length, 0);
  assert.equal(nextDrawing(null, base, [], 'n', () => 'x').revision, 1);
  assert.equal(overlayDrawing(undefined, [], 'ev'), undefined);
});

type Call = { op: string; values?: Record<string, unknown>; filters: [string, string][] };
function fakeClient(options: { existing?: { id: string } | null; updateRows?: { id: string }[]; insertError?: { code?: string; message: string } | null; insertRows?: { id: string }[] }) {
  const calls: Call[] = [];
  let existing = options.existing ?? null;
  const client = {
    from: () => ({
      select: () => ({ eq: (c1: string, v1: string) => ({ eq: (c2: string, v2: string) => ({ maybeSingle: async () => { calls.push({ op: 'read', filters: [[c1, v1], [c2, v2]] }); return { data: existing, error: null }; } }) }) }),
      update: (values: Record<string, unknown>) => { const call: Call = { op: 'update', values, filters: [] }; calls.push(call); const chain = { eq: (c: string, v: string) => { call.filters.push([c, v]); return chain; }, select: async () => ({ data: options.updateRows ?? [{ id: 'x' }], error: null }) }; return chain; },
      insert: (values: Record<string, unknown>) => { calls.push({ op: 'insert', values, filters: [] }); return { select: async () => { if (options.insertError?.code === '23505') existing = { id: 'raced' }; return { data: options.insertError ? null : options.insertRows ?? [{ id: 'new' }], error: options.insertError ?? null }; } }; },
    }),
  } as unknown as DrawingClient;
  return { client, calls };
}
const queued = (): QueuedDrawing => ({ id: 'draft-id', ...base, strokes: stroke(1), revision: 3, changedAt: 'n', error: null });

test('upload updates the existing server row by id and never sends a new id', async () => {
  const { client, calls } = fakeClient({ existing: { id: 'server-id' } });
  await uploadDrawingWith(client, queued());
  const update = calls.find((call) => call.op === 'update')!;
  assert.deepEqual(update.values, { strokes: stroke(1) });
  assert.deepEqual(update.filters, [['id', 'server-id']]);
  assert.equal(calls.some((call) => call.op === 'insert'), false);
});

test('upload inserts when no row exists and falls back to update after an insert race', async () => {
  const fresh = fakeClient({ existing: null });
  await uploadDrawingWith(fresh.client, queued());
  assert.deepEqual(fresh.calls.map((call) => call.op), ['read', 'insert']);
  assert.equal(fresh.calls[1].values!.id, 'draft-id');
  assert.equal(fresh.calls[1].values!.user_id, 'me');

  const raced = fakeClient({ existing: null, insertError: { code: '23505', message: 'duplicate key' } });
  await uploadDrawingWith(raced.client, queued());
  assert.deepEqual(raced.calls.map((call) => call.op), ['read', 'insert', 'read', 'update']);
  assert.deepEqual(raced.calls[3].filters, [['id', 'raced']]);
});

test('a refused write that returns no rows is an error, not a success', async () => {
  await assert.rejects(uploadDrawingWith(fakeClient({ existing: { id: 'server-id' }, updateRows: [] }).client, queued()), /did not save/);
  await assert.rejects(uploadDrawingWith(fakeClient({ existing: null, insertRows: [] }).client, queued()), /did not save/);
  await assert.rejects(uploadDrawingWith(fakeClient({ existing: null, insertError: { message: 'row-level security' } }).client, queued()), /row-level security/);
});

test('a snapshot fetched before the upload cannot bring old strokes back after acknowledgment', async () => {
  const { store, rows } = memory();
  const queue = createDrawingQueue(store, async () => undefined, ids);
  const OLD = stroke(0);
  // 1. A refresh begins and captures the server's current (old) row.
  const staleSnapshot = [{ id: 'server-row', user_id: 'me', strokes: OLD }];
  // 2. The drawing is saved, uploaded and acknowledged while that fetch is still in flight.
  await queue.save(base, stroke(8));
  await queue.flush();
  assert.equal((await queue.pending()).length, 0);
  // 3. The slow fetch finally returns. The acknowledged strokes must still win.
  assert.deepEqual(await queue.overlay(staleSnapshot, 'ev'), [{ id: 'server-row', user_id: 'me', strokes: stroke(8) }]);
  assert.equal(rows.size, 1);
  // 4. A later fetch that contains the saved strokes confirms them and releases the override.
  const confirmed = [{ id: 'server-row', user_id: 'me', strokes: JSON.parse(JSON.stringify(stroke(8))) }];
  assert.deepEqual(await queue.overlay(confirmed, 'ev'), confirmed);
  assert.equal(rows.size, 0);
  assert.deepEqual(await queue.overlay(staleSnapshot, 'ev'), staleSnapshot);
});

test('an unconfirmed acknowledged drawing stops overriding after the retention window', async () => {
  const { store, rows } = memory();
  let time = Date.parse('2026-10-13T12:00:00Z');
  const queue = createDrawingQueue(store, async () => undefined, ids, () => new Date(time).toISOString());
  await queue.save(base, stroke(2));
  await queue.flush();
  const other = [{ id: 'server-row', user_id: 'me', strokes: stroke(99) }];
  time += 60_000;
  assert.deepEqual((await queue.overlay(other, 'ev'))![0].strokes, stroke(2));
  time += ACK_RETENTION_MS;
  assert.deepEqual(await queue.overlay(other, 'ev'), other);
  assert.equal(rows.size, 0);
});

test('a new save after acknowledgment is pending again and replaces the retained row', async () => {
  const { store, rows } = memory();
  const queue = createDrawingQueue(store, async () => undefined, ids);
  await queue.save(base, stroke(1));
  await queue.flush();
  const next = await queue.save(base, stroke(2));
  assert.equal(next.revision, 2);
  assert.equal(next.acknowledgedAt, undefined);
  assert.equal((await queue.pending()).length, 1);
  assert.equal(rows.size, 1);
});

test('flush stops before the next row when the continuation guard says the account changed', async () => {
  const { store } = memory();
  const uploaded: string[] = [];
  let signedIn = true;
  const queue = createDrawingQueue(store, async (drawing) => { uploaded.push(drawing.event_id); signedIn = false; }, ids);
  await queue.save({ ...base, event_id: 'ev-1' }, stroke(1));
  await queue.save({ ...base, event_id: 'ev-2' }, stroke(2));
  const result = await queue.flush(() => signedIn);
  assert.deepEqual(uploaded, ['ev-1']);
  assert.equal(result.aborted, true);
  assert.equal(result.pending, 1);
});
