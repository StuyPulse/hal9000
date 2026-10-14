import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPicklistQueue, nextPicklistBatch, overlayPicklistRows, planPicklistUpload, rankingDefaults, type PicklistBatch, type PicklistStore } from './picklist-queue';
import type { EventBundle, PicklistRanking, Viewer } from './types';

const viewer = { userId: 'owner', organizationId: 'org', role: 'strategist', demo: false } as Viewer;
const row = { team_id: 'a', rank: 1024, category_id: null, note: 'original', selected: false, tag_ids: [], updated_at: 'one' } as PicklistRanking;
const bundle = { event: { id: 'event', organization_id: 'org' }, teams: [{ id: 'a', number: 1 }, { id: 'b', number: 2 }], rankings: [row], official: { oprs: { frc1: 10, frc2: 20 } } } as unknown as EventBundle;
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
function memory() { const rows = new Map<string, PicklistBatch>(); const store: PicklistStore = { get: async id => clone(rows.get(id) ?? null), put: async (id, value) => { rows.set(id, clone(value)); }, remove: async id => { rows.delete(id); }, list: async () => clone([...rows.values()]) }; return { rows, store }; }

test('offline ranking writes persist before upload and all teams share a revision', async () => {
 const { rows, store } = memory(); let uploads = 0;
 const queue = createPicklistQueue(store, async batch => { uploads++; assert.equal(rows.get('event')?.revision, batch.revision); return planPicklistUpload(batch, [row]); });
 await queue.save(viewer, bundle, [{ teamId: 'a', patch: { note: 'offline' } }, { teamId: 'b', patch: { selected: true } }]);
 assert.equal(uploads, 0); assert.equal(rows.get('event')?.intents.length, 2);
 const visible = await queue.overlay(bundle); assert.equal(visible.rankings.find(item => item.team_id === 'a')?.note, 'offline');
 await queue.flush(); assert.equal(uploads, 1);
});

test('OPR-based new-row defaults match website and untouched fields preserve teammate changes', () => {
 assert.equal(rankingDefaults(bundle, 'b').rank, 1024);
 const batch = nextPicklistBatch(null, viewer, bundle, [{ teamId: 'a', patch: { note: 'mine' } }]);
 const planned = planPicklistUpload(batch, [{ ...row, selected: true, tag_ids: ['external'], rank: 500 }]);
 assert.equal(planned[0].note, 'mine'); assert.equal(planned[0].selected, true); assert.equal(planned[0].rank, 500); assert.deepEqual(planned[0].tag_ids, ['external']);
 assert.throws(() => planPicklistUpload(batch, [{ ...row, note: 'teammate' }]), /conflict/);
 assert.throws(() => planPicklistUpload(batch, []), /removed/);
});

test('failed/conflicting batch is retained and not falsely acknowledged', async () => {
 const { rows, store } = memory(); const queue = createPicklistQueue(store, async () => { throw Error('Picklist conflict: note changed.'); });
 await queue.save(viewer, bundle, [{ teamId: 'a', patch: { note: 'mine' } }]);
 assert.match((await queue.flush()).error ?? '', /conflict/); assert.equal(rows.get('event')?.acknowledged, undefined); assert.equal(rows.get('event')?.intents[0].patch.note, 'mine');
});

test('old upload acknowledgment never retires newer work and rebases against own accepted fields', async () => {
 const { rows, store } = memory(); let release!: (rows: PicklistRanking[]) => void; let started!: () => void; const entered = new Promise<void>(resolve => { started = resolve; });
 const queue = createPicklistQueue(store, async () => { started(); return new Promise<PicklistRanking[]>(resolve => { release = resolve; }); });
 await queue.save(viewer, bundle, [{ teamId: 'a', patch: { note: 'first' } }]);
 const flushing = queue.flush(); await entered;
 await queue.save(viewer, bundle, [{ teamId: 'a', patch: { note: 'newer' } }]);
 release([{ ...row, note: 'first', updated_at: 'two' }]); await flushing;
 const latest = rows.get('event')!; assert.equal(latest.revision, 2); assert.equal(latest.acknowledged, undefined); assert.equal(latest.intents[0].expected.note, 'first');
 assert.equal(planPicklistUpload(latest, [{ ...row, note: 'first' }])[0].note, 'newer');
});

test('adding a new touched field while another edit is pending retains original baseline', () => {
 const first = nextPicklistBatch(null, viewer, bundle, [{ teamId: 'b', patch: { note: 'new robot' } }]);
 const overlaid = { ...bundle, rankings: overlayPicklistRows(bundle.rankings, first) };
 const next = nextPicklistBatch(first, viewer, overlaid, [{ teamId: 'b', patch: { rank: 2048 } }]);
 assert.equal(next.intents[0].expected.rank, null); assert.equal(planPicklistUpload(next, [row])[0].rank, 2048);
});

test('acknowledged overlay waits for server snapshot and yields to later server revision', async () => {
 const { rows, store } = memory(); const queue = createPicklistQueue(store, async batch => planPicklistUpload(batch, [row]).map(item => ({ ...item, updated_at: '2026-10-14T01:00:00Z' })));
 await queue.save(viewer, bundle, [{ teamId: 'a', patch: { note: 'mine' } }]); await queue.flush();
 assert.equal((await queue.overlay(bundle)).rankings[0].note, 'mine');
 const fresh = { ...bundle, rankings: [{ ...row, note: 'newer teammate', updated_at: '2026-10-14T01:01:00Z' }] };
 assert.equal((await queue.overlay(fresh)).rankings[0].note, 'newer teammate'); assert.equal(rows.size, 0);
});

test('account guard blocks upload and queued edits remain scoped', async () => {
 const { rows, store } = memory(); let uploaded = false; const queue = createPicklistQueue(store, async () => { uploaded = true; return []; });
 await queue.save(viewer, bundle, [{ teamId: 'a', patch: { selected: true } }]); await queue.flush(() => false);
 assert.equal(uploaded, false); assert.equal(rows.get('event')?.userId, 'owner');
});

test('a complete snapshot started after acknowledgment confirms deletion, while older inflight fetch does not', async () => {
 const { rows, store } = memory(); const queue = createPicklistQueue(store, async batch => planPicklistUpload(batch, [row]).map(item => ({ ...item, updated_at: '2026-10-14T01:00:00Z' })), () => 5000);
 await queue.save(viewer, bundle, [{ teamId: 'a', patch: { note: 'mine' } }]); await queue.flush();
 const oldFetch = { ...bundle, rankings: [], rankingSnapshotStartedAt: 4000 };
 assert.equal((await queue.overlay(oldFetch)).rankings.length, 1);
 const newFetch = { ...bundle, rankings: [], rankingSnapshotStartedAt: 6000 };
 assert.equal((await queue.overlay(newFetch)).rankings.length, 0); assert.equal(rows.size, 0);
});

test('queued edits survive restart and stale offline cache never expires acknowledged work by wall clock', async () => {
 const { store } = memory(); let now = 1000;
 const first = createPicklistQueue(store, async batch => planPicklistUpload(batch, [row]).map(item => ({ ...item, updated_at: '2026-10-14T01:00:00Z' })), () => now);
 await first.save(viewer, bundle, [{ teamId: 'a', patch: { note: 'offline persisted' } }]);
 const second = createPicklistQueue(store, async batch => planPicklistUpload(batch, [row]).map(item => ({ ...item, updated_at: '2026-10-14T01:00:00Z' })), () => now);
 assert.equal((await second.overlay(bundle)).rankings[0].note, 'offline persisted');
 await second.flush(); now += 86400000;
 assert.equal((await second.overlay(bundle)).rankings[0].note, 'offline persisted');
});
