import type { EventBundle, PicklistRanking, Viewer } from './types';

export const PICKLIST_FIELDS = ['rank', 'category_id', 'note', 'selected', 'tag_ids'] as const;
type Field = typeof PICKLIST_FIELDS[number];
export type RankingState = { rank: number | null; category_id: string | null; note: string; selected: boolean; tag_ids: string[] };
export type RankingPatch = { teamId: string; patch: Partial<PicklistRanking> };
export type RankingIntent = { teamId: string; patch: Partial<RankingState>; expected: Partial<RankingState>; defaults: RankingState; base: RankingState; existed: boolean };
export type PicklistBatch = { eventId: string; organizationId: string; userId: string; role: string; revision: number; intents: RankingIntent[]; error: string | null; acknowledged?: PicklistRanking[]; acknowledgedAt?: number };
export type PicklistStore = { get(id: string): Promise<PicklistBatch | null>; put(id: string, value: PicklistBatch): Promise<void>; remove(id: string): Promise<void>; list(): Promise<PicklistBatch[]> };
export const equalRankingValue = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
export const rankingState = (row?: PicklistRanking | null): RankingState => ({ rank: row?.rank ?? null, category_id: row?.category_id ?? null, note: row?.note ?? '', selected: row?.selected ?? false, tag_ids: row?.tag_ids ?? [] });

export function rankingDefaults(bundle: EventBundle, teamId: string): RankingState {
  const teams = [...bundle.teams].sort((a, b) => (bundle.official?.oprs[`frc${b.number}`] ?? 0) - (bundle.official?.oprs[`frc${a.number}`] ?? 0) || a.number - b.number);
  const index = teams.findIndex(team => team.id === teamId);
  if (index < 0) throw Error('Choose a team registered to this event.');
  return { rank: (index + 1) * 1024, category_id: null, note: '', selected: false, tag_ids: [] };
}

/** Only the fields actually changed become conflict predicates. Unrelated teammate edits are preserved. */
export function nextPicklistBatch(previous: PicklistBatch | null, viewer: Viewer, bundle: EventBundle, patches: RankingPatch[]): PicklistBatch {
  const intents = new Map((previous?.acknowledged ? [] : previous?.intents ?? []).map(intent => [intent.teamId, JSON.parse(JSON.stringify(intent)) as RankingIntent]));
  for (const item of patches) {
    const defaults = rankingDefaults(bundle, item.teamId);
    const existing = bundle.rankings.find(row => row.team_id === item.teamId);
    const base = rankingState(existing);
    const intent = intents.get(item.teamId) ?? { teamId: item.teamId, patch: {}, expected: {}, defaults, base, existed: !!existing };
    for (const field of PICKLIST_FIELDS) if (Object.hasOwn(item.patch, field)) {
      const value = item.patch[field];
      if (value === undefined) continue;
      if (!Object.hasOwn(intent.expected, field)) Object.assign(intent.expected, { [field]: intent.base[field] });
      Object.assign(intent.patch, { [field]: field === 'note' ? value ?? '' : value });
    }
    intents.set(item.teamId, intent);
  }
  return { eventId: bundle.event.id, organizationId: viewer.organizationId, userId: viewer.userId, role: viewer.role, revision: (previous?.revision ?? 0) + 1, intents: [...intents.values()], error: null };
}

/** Preflight guard + latest untouched fields. Database transport must write this entire plan once. */
export function planPicklistUpload(batch: PicklistBatch, remote: PicklistRanking[]) {
  const byTeam = new Map(remote.map(row => [row.team_id, row]));
  return batch.intents.map(intent => {
    const row = byTeam.get(intent.teamId), current = rankingState(row);
    if (intent.existed && !row) throw Error('Picklist conflict: this ranking was removed on another device. Your offline edits are retained; review before retrying.');
    for (const field of Object.keys(intent.patch) as Field[]) {
      if (!equalRankingValue(current[field], intent.expected[field]) && !equalRankingValue(current[field], intent.patch[field])) throw Error(`Picklist conflict (${field}). Another device changed this field. Your offline edits are retained; review before retrying.`);
    }
    return { ...row, ...(row ? current : intent.defaults), ...intent.patch, team_id: intent.teamId } as PicklistRanking;
  });
}

export function overlayPicklistRows(rows: PicklistRanking[], batch: PicklistBatch) {
  const byTeam = new Map(rows.map(row => [row.team_id, row]));
  for (const intent of batch.intents) {
    const row = byTeam.get(intent.teamId);
    byTeam.set(intent.teamId, { ...intent.defaults, ...row, ...intent.patch, team_id: intent.teamId });
  }
  return [...byTeam.values()];
}

export function createPicklistQueue(store: PicklistStore, upload: (batch: PicklistBatch) => Promise<PicklistRanking[]>, clock: () => number = Date.now) {
  let chain: Promise<unknown> = Promise.resolve();
  const exclusive = <T,>(operation: () => Promise<T>) => { const run = chain.then(operation, operation); chain = run.catch(() => {}); return run; };
  let flushing: Promise<{ uploaded: number; error: string | null }> | null = null;
  const save = (viewer: Viewer, bundle: EventBundle, patches: RankingPatch[]) => exclusive(async () => {
    if (!['admin','developer','global_scout','strategist','master'].includes(viewer.role)) throw Error('Your role cannot edit rankings.');
    if (bundle.event.organization_id !== viewer.organizationId) throw Error('Event belongs to another organization.');
    const next = nextPicklistBatch(await store.get(bundle.event.id), viewer, bundle, patches);
    await store.put(next.eventId, next);
    return next;
  });
  function flush(guard: () => boolean = () => true) {
    return flushing ??= (async () => {
      let uploaded = 0, error: string | null = null;
      for (const snapshot of await store.list()) {
        if (!guard()) break;
        if (snapshot.acknowledged) continue;
        try {
          const saved = await upload(snapshot);
          uploaded += 1;
          await exclusive(async () => {
            const latest = await store.get(snapshot.eventId);
            if (!latest) return;
            if (latest.revision === snapshot.revision) { await store.put(snapshot.eventId, { ...latest, acknowledged: saved, acknowledgedAt: clock(), error: null }); return; }
            // Newer work remains pending, rebased only against our confirmed older writes.
            const before = new Map(snapshot.intents.map(intent => [intent.teamId, intent]));
            const byTeam = new Map(saved.map(row => [row.team_id, row]));
            for (const intent of latest.intents) {
              const older = before.get(intent.teamId), row = byTeam.get(intent.teamId);
              if (!older || !row) continue;
              for (const field of PICKLIST_FIELDS) {
                if (!older.existed || Object.hasOwn(older.patch, field)) {
                  if (Object.hasOwn(intent.expected, field) && equalRankingValue(intent.expected[field], older.base[field])) Object.assign(intent.expected, { [field]: rankingState(row)[field] });
                  Object.assign(intent.base, { [field]: rankingState(row)[field] });
                }
              }
              intent.existed = true;
            }
            await store.put(snapshot.eventId, { ...latest, error: null });
          });
        } catch (caught) {
          error = caught instanceof Error ? caught.message : 'Picklist upload failed. Offline edits are retained.';
          await exclusive(async () => { const latest = await store.get(snapshot.eventId); if (latest?.revision === snapshot.revision) await store.put(snapshot.eventId, { ...latest, error }); });
        }
      }
      return { uploaded, error };
    })().finally(() => { flushing = null; });
  }
  const overlay = (bundle: EventBundle) => exclusive(async () => {
    const batch = await store.get(bundle.event.id);
    if (!batch) return bundle;
    if (batch.acknowledged) {
      const confirmed = batch.acknowledged.every(row => {
        const current = bundle.rankings.find(item => item.team_id === row.team_id);
        return current && (current.updated_at === row.updated_at || !!current.updated_at && !!row.updated_at && Date.parse(current.updated_at) > Date.parse(row.updated_at));
      });
      const freshSnapshot = bundle.rankingSnapshotStartedAt;
      if (confirmed || freshSnapshot !== undefined && freshSnapshot > (batch.acknowledgedAt ?? Infinity)) { await store.remove(batch.eventId); return bundle; }
    }
    return { ...bundle, rankings: overlayPicklistRows(bundle.rankings, batch) };
  });
  return { save, flush, overlay, pending: () => store.list(), discard: (eventId: string) => exclusive(() => store.remove(eventId)) };
}
