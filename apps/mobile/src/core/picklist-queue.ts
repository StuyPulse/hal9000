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

/** A new ranking row has no rank unless the patch sets one, so a note/tag/selection never moves an unranked team. */
export function rankingDefaults(bundle: EventBundle, teamId: string): RankingState {
  if (!bundle.teams.some(team => team.id === teamId)) throw Error('Choose a team registered to this event.');
  return { rank: null, category_id: null, note: '', selected: false, tag_ids: [] };
}

/** Another device changed a field this team's offline edit touched. Only that team's intent is affected. */
export class PicklistConflictError extends Error {
  constructor(readonly teamId: string, message: string) { super(message); this.name = 'PicklistConflictError'; }
}
export const isPicklistConflict = (error: unknown): error is PicklistConflictError => error instanceof PicklistConflictError || (error instanceof Error && error.name === 'PicklistConflictError' && typeof (error as PicklistConflictError).teamId === 'string');
export const conflictMessage = (count: number) => `Another device changed ${count === 1 ? 'a team' : `${count} teams`} you edited offline, so ${count === 1 ? 'that change was' : 'those changes were'} not uploaded. Your other picklist edits were kept. Refresh to see the latest board.`;

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
    if (intent.existed && !row) throw new PicklistConflictError(intent.teamId, 'Picklist conflict: this ranking was removed on another device.');
    for (const field of Object.keys(intent.patch) as Field[]) {
      if (!equalRankingValue(current[field], intent.expected[field]) && !equalRankingValue(current[field], intent.patch[field])) throw new PicklistConflictError(intent.teamId, `Picklist conflict (${field}). Another device changed this field.`);
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
  const failure = (caught: unknown) => caught instanceof Error ? caught.message : 'Picklist upload failed. Offline edits are retained.';
  /**
   * Upload the whole batch; when a team conflicts, upload each team on its own so one conflict
   * never blocks the rest. Conflicting teams are reported (and later dropped), everything else
   * either saved or retained for retry.
   */
  async function attempt(snapshot: PicklistBatch, guard: () => boolean): Promise<{ saved: PicklistRanking[]; conflicts: string[]; error: string | null }> {
    try { return { saved: await upload(snapshot), conflicts: [], error: null }; }
    catch (caught) {
      if (!isPicklistConflict(caught)) return { saved: [], conflicts: [], error: failure(caught) };
      if (snapshot.intents.length <= 1) return { saved: [], conflicts: [caught.teamId], error: null };
    }
    const saved: PicklistRanking[] = [], conflicts: string[] = [];
    for (const intent of snapshot.intents) {
      if (!guard()) break;
      try { saved.push(...await upload({ ...snapshot, intents: [intent] })); }
      catch (caught) {
        if (isPicklistConflict(caught)) conflicts.push(intent.teamId);
        else return { saved, conflicts, error: failure(caught) };
      }
    }
    return { saved, conflicts, error: null };
  }
  function flush(guard: () => boolean = () => true) {
    return flushing ??= (async () => {
      let uploaded = 0, error: string | null = null;
      for (const snapshot of await store.list()) {
        if (!guard()) break;
        if (snapshot.acknowledged) continue;
        const result = await attempt(snapshot, guard);
        const savedTeams = new Set(result.saved.map(row => row.team_id)), dropped = new Set(result.conflicts);
        const complete = snapshot.intents.every(intent => savedTeams.has(intent.teamId) || dropped.has(intent.teamId));
        const conflict = dropped.size ? conflictMessage(dropped.size) : null;
        if (result.saved.length) uploaded += 1;
        if (result.error || conflict) error = result.error ?? conflict;
        await exclusive(async () => {
          const latest = await store.get(snapshot.eventId);
          if (!latest) return;
          if (latest.revision === snapshot.revision && complete) {
            // Everything uploaded or conflicted: acknowledge exactly what the server saved.
            const intents = latest.intents.filter(intent => !dropped.has(intent.teamId));
            if (!intents.length) { await store.remove(snapshot.eventId); return; }
            await store.put(snapshot.eventId, { ...latest, intents, acknowledged: result.saved, acknowledgedAt: clock(), error: conflict });
            return;
          }
          // Newer or unfinished work remains pending, rebased only against our confirmed writes.
          const before = new Map(snapshot.intents.map(intent => [intent.teamId, intent]));
          const byTeam = new Map(result.saved.map(row => [row.team_id, row]));
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
          // A conflicting team's edit was made against a stale base and would conflict forever; drop it.
          const intents = latest.intents.filter(intent => !dropped.has(intent.teamId));
          if (!intents.length) { await store.remove(snapshot.eventId); return; }
          await store.put(snapshot.eventId, { ...latest, intents, error: result.error ?? conflict });
        });
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
  /** Pending (not yet acknowledged) offline picklist changes for one event, if any. */
  const pendingFor = async (eventId: string) => { const batch = await store.get(eventId); return batch && !batch.acknowledged ? batch : null; };
  /** Throw away this device's pending offline picklist changes for one event. Never touches the server. */
  const discard = (eventId: string) => exclusive(() => store.remove(eventId));
  return { save, flush, overlay, pending: () => store.list(), pendingFor, discard };
}
