// Pure picklist ordering/rank planning. Semantics follow the website's
// picklist-board.tsx: ranks are spaced by 1024 and a move inserts at the midpoint,
// renumbering the whole tier only when the midpoint collides.
import type { PicklistRanking } from '../core/types';

export const RANK_STEP = 1024;
export const UNSORTED = '__unsorted__';

export type RankPatch = { teamId: string; rank: number; category_id: string | null };

/** Tier ids that PicklistRanking.category_id may contain; null means Unsorted. */
export const databaseCategory = (tierId: string) => (tierId === UNSORTED ? null : tierId);

/** Teams in a tier ordered by saved rank (unranked last) then team number. */
export function teamsInTier<T extends { id: string; number: number; opr?: number | null }>(teams: T[], rankings: Map<string, PicklistRanking>, tierId: string): T[] {
  const category = databaseCategory(tierId);
  return teams
    .filter((team) => (rankings.get(team.id)?.category_id ?? null) === category)
    .sort((a, b) => (rankings.get(a.id)?.rank ?? Number.MAX_SAFE_INTEGER) - (rankings.get(b.id)?.rank ?? Number.MAX_SAFE_INTEGER) || (b.opr ?? 0) - (a.opr ?? 0) || a.number - b.number);
}

/**
 * Insert `teamId` at `insertAt` among `others` (the tier without it, in order).
 * Returns every patch that must be saved: one normally, the whole tier on a collision.
 */
export function planInsert(teamId: string, others: { teamId: string; rank: number | null }[], insertAt: number, tierId: string): RankPatch[] {
  const category = databaseCategory(tierId);
  const at = Math.max(0, Math.min(insertAt, others.length));
  const beforeRank = at > 0 ? others[at - 1].rank ?? at * RANK_STEP : undefined;
  const afterRank = at < others.length ? others[at].rank ?? (at + 1) * RANK_STEP : undefined;
  const rank = beforeRank === undefined ? (afterRank ?? 2 * RANK_STEP) - RANK_STEP : afterRank === undefined ? beforeRank + RANK_STEP : Math.floor((beforeRank + afterRank) / 2);
  if (afterRank !== undefined && beforeRank !== undefined && (rank === beforeRank || rank === afterRank)) {
    const order = [...others.map((item) => item.teamId)];
    order.splice(at, 0, teamId);
    return order.map((id, index) => ({ teamId: id, rank: (index + 1) * RANK_STEP, category_id: category }));
  }
  return [{ teamId, rank, category_id: category }];
}

/** Tier-aware up/down: past the end of a tier the team crosses into the neighbouring tier. */
export function planMove(teamId: string, tierIds: string[], tierOrders: Record<string, { teamId: string; rank: number | null }[]>, currentTier: string, direction: -1 | 1): RankPatch[] {
  const order = tierOrders[currentTier] ?? [];
  const index = order.findIndex((item) => item.teamId === teamId);
  if (index < 0) return [];
  const neighbour = index + direction;
  if (neighbour >= 0 && neighbour < order.length) {
    // Swap effective ranks with the neighbour (defaults keep unranked rows distinct).
    const effective = (position: number) => order[position].rank ?? (position + 1) * RANK_STEP;
    return [
      { teamId, rank: effective(neighbour), category_id: databaseCategory(currentTier) },
      { teamId: order[neighbour].teamId, rank: effective(index), category_id: databaseCategory(currentTier) },
    ];
  }
  const tierIndex = tierIds.indexOf(currentTier);
  const destination = tierIds[tierIndex + direction];
  if (!destination) return [];
  const others = (tierOrders[destination] ?? []).filter((item) => item.teamId !== teamId);
  return planInsert(teamId, others, direction > 0 ? 0 : others.length, destination);
}

/** Same rule as the website: moving to another tier appends it at the end. */
export function planMoveToTier(teamId: string, tierOrders: Record<string, { teamId: string; rank: number | null }[]>, destination: string): RankPatch[] {
  const others = (tierOrders[destination] ?? []).filter((item) => item.teamId !== teamId);
  return planInsert(teamId, others, others.length, destination);
}

export const PICKLIST_EDIT_ROLES = ['strategist', 'master', 'admin', 'developer', 'global_scout'] as const;
export const canEditPicklistRole = (role: string | null | undefined) => (PICKLIST_EDIT_ROLES as readonly string[]).includes(role ?? '');

// --- history / restore (port of picklist-board.tsx revisions) ---------------------------------

export const EDITING_SESSION_IDLE_MS = 5 * 60 * 1000;
export type HistoryChange = {
  id: string; team_id: string; actor_user_id: string | null; action: 'baseline' | 'created' | 'updated' | 'deleted';
  before_state: Record<string, unknown> | null; after_state: Record<string, unknown> | null; created_at: string;
};
export type Revision = { id: string; createdAt: string; oldestAt: string; actorUserId: string | null; changes: HistoryChange[] };

/** Changes (newest first) grouped into editing sessions: same actor, gaps under five minutes. */
export function groupRevisions(changes: HistoryChange[]): Revision[] {
  const sorted = [...changes].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const sessions: Revision[] = [];
  for (const change of sorted) {
    const current = sessions[sessions.length - 1];
    const idle = current ? new Date(current.oldestAt).getTime() - new Date(change.created_at).getTime() : Number.POSITIVE_INFINITY;
    if (current && current.actorUserId === change.actor_user_id && idle >= 0 && idle <= EDITING_SESSION_IDLE_MS) {
      current.changes.push(change);
      current.oldestAt = change.created_at;
    } else {
      sessions.push({ id: change.id, createdAt: change.created_at, oldestAt: change.created_at, actorUserId: change.actor_user_id, changes: [change] });
    }
  }
  return sessions;
}

const ids = (value: unknown) => (Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []);

export function describeChange(change: HistoryChange, categoryName: (id: unknown) => string, tagName: (id: string) => string | undefined) {
  const before = change.before_state ?? {};
  const after = change.after_state ?? {};
  if (change.action === 'baseline') return `Initial placement in ${categoryName(after.category_id)}`;
  if (change.action === 'created') return `Added to ${categoryName(after.category_id)}`;
  if (change.action === 'deleted') return 'Removed from the board';
  const parts: string[] = [];
  if (before.category_id !== after.category_id) parts.push(`Moved from ${categoryName(before.category_id)} to ${categoryName(after.category_id)}`);
  else if (before.rank !== after.rank) parts.push(`Reordered in ${categoryName(after.category_id)}`);
  if (before.note !== after.note) parts.push('Updated note');
  if (before.selected !== after.selected) parts.push(after.selected ? 'Marked selected' : 'Marked not selected');
  const added = ids(after.tag_ids).filter((id) => !ids(before.tag_ids).includes(id)).map(tagName).filter(Boolean);
  const removed = ids(before.tag_ids).filter((id) => !ids(after.tag_ids).includes(id)).map(tagName).filter(Boolean);
  if (added.length) parts.push(`Added tag${added.length === 1 ? '' : 's'}: ${added.join(', ')}`);
  if (removed.length) parts.push(`Removed tag${removed.length === 1 ? '' : 's'}: ${removed.join(', ')}`);
  return parts.join(' · ') || 'Updated shared ranking';
}

export type FullRanking = { rank: number | null; category_id: string | null; note: string; selected: boolean; tag_ids: string[] };
const restoreState = (state: Record<string, unknown> | null): Partial<FullRanking> | null => {
  if (!state) return null;
  const out: Partial<FullRanking> = {};
  if (typeof state.rank === 'number') out.rank = state.rank;
  if (typeof state.category_id === 'string' || state.category_id === null) out.category_id = state.category_id;
  if (typeof state.note === 'string') out.note = state.note;
  if (typeof state.selected === 'boolean') out.selected = state.selected;
  if (Array.isArray(state.tag_ids) && state.tag_ids.every((id) => typeof id === 'string')) out.tag_ids = state.tag_ids as string[];
  return Object.keys(out).length ? out : null;
};
const same = (a: FullRanking, b: FullRanking) => a.rank === b.rank && a.category_id === b.category_id && a.note === b.note && a.selected === b.selected && a.tag_ids.length === b.tag_ids.length && a.tag_ids.every((id, i) => id === b.tag_ids[i]);

/**
 * Board as it stood immediately after `revisions[index]`, expressed as the per-team full
 * states to write. Walks back through only the newer revisions, like the website.
 */
export function planRestore(current: Map<string, FullRanking>, revisions: Revision[], index: number, teamOrder: string[]): { teamId: string; state: FullRanking }[] {
  if (index < 0 || index >= revisions.length) return [];
  const snapshot = new Map(current);
  for (const newer of revisions.slice(0, index)) {
    for (const change of newer.changes) {
      const before = restoreState(change.before_state);
      if (change.action === 'created' && !before) snapshot.delete(change.team_id);
      else if (before) snapshot.set(change.team_id, { ...(snapshot.get(change.team_id) ?? { rank: null, category_id: null, note: '', selected: false, tag_ids: [] }), ...before });
    }
  }
  const affected = new Set([...current.keys(), ...snapshot.keys()]);
  const out: { teamId: string; state: FullRanking }[] = [];
  for (const teamId of affected) {
    const position = teamOrder.indexOf(teamId);
    if (position < 0) continue;
    const desired = snapshot.get(teamId) ?? { rank: (position + 1) * RANK_STEP, category_id: null, note: '', selected: false, tag_ids: [] };
    const now = current.get(teamId);
    if (!now || !same(now, desired)) out.push({ teamId, state: desired });
  }
  return out;
}

/** Removing a tier moves its teams to the neighbouring tier first (appended in order). */
export function planRemoveTier(tierId: string, orderedTierIds: string[], tierOrders: Record<string, { teamId: string; rank: number | null }[]>): { fallback: string | null; patches: RankPatch[] } {
  const index = orderedTierIds.indexOf(tierId);
  const real = orderedTierIds.filter((id) => id !== UNSORTED);
  if (index < 0 || real.length <= 1) return { fallback: null, patches: [] };
  const position = real.indexOf(tierId);
  const fallback = real[position + 1] ?? real[position - 1];
  const base = (tierOrders[fallback] ?? []).length;
  const patches = (tierOrders[tierId] ?? []).map((item, offset) => ({ teamId: item.teamId, rank: (base + offset + 1) * RANK_STEP, category_id: fallback }));
  return { fallback, patches };
}

export const META_COLORS = ['#f59e0b', '#22c55e', '#3b82f6', '#64748b', '#8b5cf6', '#ef4444', '#60a5fa', '#14b8a6', '#ec4899'] as const;
export const isHexColor = (value: string) => /^#[0-9A-Fa-f]{6}$/.test(value);
export function validateMetaName(name: string, existing: string[]) {
  const trimmed = name.trim();
  if (!trimmed) return 'Enter a name.';
  if (trimmed.length > 48) return 'Use 48 characters or fewer.';
  if (existing.some((item) => item.toLowerCase() === trimmed.toLowerCase())) return 'That name already exists.';
  return null;
}
