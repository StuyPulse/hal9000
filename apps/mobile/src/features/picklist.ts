// Pure picklist ordering/rank planning, ported from the website's picklist-order.ts.
// Ranks are sparse integers (1024 apart) so most moves touch one row. A team without a
// saved rank sorts after every ranked team in its tier, ordered by OPR. Whenever a move
// cannot be expressed against real saved ranks (an unranked neighbour, no gap left, or a
// rank that would fall below the database minimum of 1), the whole tier is renumbered so
// the saved order always equals the displayed one.
import type { PicklistRanking } from '../core/types';

export const RANK_STEP = 1024;
export const MIN_RANK = 1;
export const UNSORTED = '__unsorted__';

export type RankPatch = { teamId: string; rank: number; category_id: string | null };
export type TierItem = { teamId: string; rank: number | null };

/** Tier ids that PicklistRanking.category_id may contain; null means Unsorted. */
export const databaseCategory = (tierId: string) => (tierId === UNSORTED ? null : tierId);

const hasRank = (rank: number | null | undefined): rank is number => typeof rank === 'number' && Number.isFinite(rank);

/** Same comparator as the website: saved rank (unranked last), then OPR (high first), then team number. */
export function compareTierTeams(rankOf: (teamId: string) => number | null | undefined) {
  return (a: { id: string; number: number; opr?: number | null }, b: { id: string; number: number; opr?: number | null }) =>
    (rankOf(a.id) ?? Number.MAX_SAFE_INTEGER) - (rankOf(b.id) ?? Number.MAX_SAFE_INTEGER) || (b.opr ?? 0) - (a.opr ?? 0) || a.number - b.number;
}

/** Teams in a tier ordered by saved rank (unranked last), then OPR, then team number. */
export function teamsInTier<T extends { id: string; number: number; opr?: number | null }>(teams: T[], rankings: Map<string, PicklistRanking>, tierId: string): T[] {
  const category = databaseCategory(tierId);
  return teams
    .filter((team) => (rankings.get(team.id)?.category_id ?? null) === category)
    .sort(compareTierTeams((id) => rankings.get(id)?.rank));
}

/** Rank every team in the tier in the given order. */
export function renumberTier(orderedTeamIds: string[], tierId: string): RankPatch[] {
  const category = databaseCategory(tierId);
  return orderedTeamIds.map((teamId, index) => ({ teamId, rank: (index + 1) * RANK_STEP, category_id: category }));
}

/**
 * Insert `teamId` at `insertAt` among `others` (the tier without it, in display order).
 * One patch normally; the whole tier when any rank there is missing, no gap is left, or
 * the new rank would fall below 1.
 */
export function planInsert(teamId: string, others: TierItem[], insertAt: number, tierId: string): RankPatch[] {
  const category = databaseCategory(tierId);
  const at = Math.max(0, Math.min(insertAt, others.length));
  const order = others.map((item) => item.teamId);
  order.splice(at, 0, teamId);
  if (!others.every((item) => hasRank(item.rank))) return renumberTier(order, tierId);
  const beforeRank = at > 0 ? others[at - 1].rank as number : undefined;
  const afterRank = at < others.length ? others[at].rank as number : undefined;
  const rank = beforeRank === undefined
    ? (afterRank === undefined ? RANK_STEP : afterRank - RANK_STEP)
    : afterRank === undefined ? beforeRank + RANK_STEP : Math.floor((beforeRank + afterRank) / 2);
  const fits = rank >= MIN_RANK && (beforeRank === undefined || rank > beforeRank) && (afterRank === undefined || rank < afterRank);
  return fits ? [{ teamId, rank, category_id: category }] : renumberTier(order, tierId);
}

/** Swap with the neighbour inside one tier: two patches when both are ranked and distinct, else renumber the tier. */
export function planMoveWithinTier(order: TierItem[], teamId: string, direction: -1 | 1, tierId: string): RankPatch[] | null {
  const index = order.findIndex((item) => item.teamId === teamId);
  const neighbour = index + direction;
  if (index < 0 || neighbour < 0 || neighbour >= order.length) return null;
  const moving = order[index].rank, other = order[neighbour].rank;
  if (hasRank(moving) && hasRank(other) && moving !== other) {
    const category = databaseCategory(tierId);
    return [{ teamId, rank: other, category_id: category }, { teamId: order[neighbour].teamId, rank: moving, category_id: category }];
  }
  const ids = order.map((item) => item.teamId);
  [ids[index], ids[neighbour]] = [ids[neighbour], ids[index]];
  return renumberTier(ids, tierId);
}

/** Tier-aware up/down: past the end of a tier the team crosses into the neighbouring tier. */
export function planMove(teamId: string, tierIds: string[], tierOrders: Record<string, TierItem[]>, currentTier: string, direction: -1 | 1): RankPatch[] {
  const order = tierOrders[currentTier] ?? [];
  if (!order.some((item) => item.teamId === teamId)) return [];
  const within = planMoveWithinTier(order, teamId, direction, currentTier);
  if (within) return within;
  const destination = tierIds[tierIds.indexOf(currentTier) + direction];
  if (!destination) return [];
  const others = (tierOrders[destination] ?? []).filter((item) => item.teamId !== teamId);
  return planInsert(teamId, others, direction > 0 ? 0 : others.length, destination);
}

/** Same rule as the website: moving to another tier appends it at the end. */
export function planMoveToTier(teamId: string, tierOrders: Record<string, TierItem[]>, destination: string): RankPatch[] {
  const others = (tierOrders[destination] ?? []).filter((item) => item.teamId !== teamId);
  return planInsert(teamId, others, others.length, destination);
}

/**
 * Place a group of teams (in their current order) at the start or end of a tier, e.g.
 * when the tier they were in is removed. Renumbers when an existing rank is missing or a
 * rank would fall below 1.
 */
export function planPlaceGroupInTier(order: TierItem[], movingTeamIds: string[], placement: 'start' | 'end', tierId: string): RankPatch[] {
  if (!movingTeamIds.length) return [];
  const category = databaseCategory(tierId);
  const existing = order.filter((item) => !movingTeamIds.includes(item.teamId));
  const ids = existing.map((item) => item.teamId);
  const combined = placement === 'start' ? [...movingTeamIds, ...ids] : [...ids, ...movingTeamIds];
  if (!existing.every((item) => hasRank(item.rank))) return renumberTier(combined, tierId);
  const ranks = existing.map((item) => item.rank as number);
  if (placement === 'end') {
    const last = ranks.length ? Math.max(...ranks) : 0;
    return movingTeamIds.map((teamId, index) => ({ teamId, rank: last + (index + 1) * RANK_STEP, category_id: category }));
  }
  const first = ranks.length ? Math.min(...ranks) : (movingTeamIds.length + 1) * RANK_STEP;
  const patches = movingTeamIds.map((teamId, index) => ({ teamId, rank: first - (movingTeamIds.length - index) * RANK_STEP, category_id: category }));
  return patches[0].rank >= MIN_RANK ? patches : renumberTier(combined, tierId);
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
  if (typeof state.rank === 'number' || state.rank === null) out.rank = state.rank;
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
    if (!teamOrder.includes(teamId)) continue;
    // A team with no row at the restore point goes back to Unsorted without a saved rank.
    const desired = snapshot.get(teamId) ?? { rank: null, category_id: null, note: '', selected: false, tag_ids: [] };
    const now = current.get(teamId);
    if (!now || !same(now, desired)) out.push({ teamId, state: desired });
  }
  return out;
}

/**
 * Removing a tier moves its teams to a neighbouring tier first, like the website: to the top
 * of the tier below, or after the last team of the tier above when it was the last tier.
 */
export function planRemoveTier(tierId: string, orderedTierIds: string[], tierOrders: Record<string, TierItem[]>): { fallback: string | null; patches: RankPatch[] } {
  const index = orderedTierIds.indexOf(tierId);
  const real = orderedTierIds.filter((id) => id !== UNSORTED);
  if (index < 0 || real.length <= 1) return { fallback: null, patches: [] };
  const position = real.indexOf(tierId);
  const below = real[position + 1];
  const fallback = below ?? real[position - 1];
  const moving = (tierOrders[tierId] ?? []).map((item) => item.teamId);
  return { fallback, patches: planPlaceGroupInTier(tierOrders[fallback] ?? [], moving, below ? 'start' : 'end', fallback) };
}

/** New tiers/tags go after every existing one, even when earlier deletes left gaps or duplicates. */
export const nextSortOrder = (items: { sort_order: number }[]) => (items.length ? Math.max(...items.map((item) => item.sort_order)) + 1 : 0);

/**
 * Move one tier up or down and renumber every tier 0..n so equal or gapped sort orders can
 * never make a swap a no-op. Returns only the tiers whose sort_order changes.
 */
export function planTierOrder<T extends { id: string; sort_order: number }>(ordered: T[], id: string, direction: -1 | 1): { item: T; sort_order: number }[] {
  const index = ordered.findIndex((item) => item.id === id);
  const other = index + direction;
  if (index < 0 || other < 0 || other >= ordered.length) return [];
  const next = [...ordered];
  [next[index], next[other]] = [next[other], next[index]];
  return next.map((item, position) => ({ item, sort_order: position })).filter((entry) => entry.item.sort_order !== entry.sort_order);
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
