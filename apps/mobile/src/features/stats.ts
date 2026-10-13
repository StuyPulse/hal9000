// Pure, dependency-free scouting statistics. Semantics are copied from the
// website (apps/web/src/lib/scouting-stats.ts, match-label.ts) so a team shows
// the same numbers on both platforms. Nothing here imports React Native.
import type { Match, NativeEntry, Payload } from '../core/types';

export type ReportEntry = Pick<NativeEntry, 'id' | 'team_id' | 'match_id' | 'payload'>;
export type ReportSource = { team_id: string; match_key: string; selected_entry_id: string | null };
export type MatchTypes = ReadonlyMap<string, string>;

export type ScoutStats = {
  entries: number; matches: number;
  autoMaxScored: number; autoMaxFerried: number; autoAvgScored: number; autoAvgFerried: number;
  teleopMaxScored: number; teleopMaxFerried: number; teleopAvgScored: number; teleopAvgFerried: number;
  avgFouls: number; defense: number; brokenPercent: number;
  peakFuel: number; totalFuel: number; autoFuel: number; teleopFuel: number; autoPeakFuel: number; teleopPeakFuel: number;
};

export const EMPTY_STATS: ScoutStats = {
  entries: 0, matches: 0, autoMaxScored: 0, autoMaxFerried: 0, autoAvgScored: 0, autoAvgFerried: 0,
  teleopMaxScored: 0, teleopMaxFerried: 0, teleopAvgScored: 0, teleopAvgFerried: 0, avgFouls: 0, defense: 0, brokenPercent: 0,
  peakFuel: 0, totalFuel: 0, autoFuel: 0, teleopFuel: 0, autoPeakFuel: 0, teleopPeakFuel: 0,
};

type MatchValues = { autoScored: number; autoFerried: number; teleopScored: number; teleopFerried: number; autoFuel: number; teleopFuel: number; fouls: number; defense: number; broken: number };

const num = (value: unknown) => (value !== null && value !== '' && Number.isFinite(Number(value)) ? Number(value) : 0);
const average = (values: number[]) => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0);
const maximum = (values: number[]) => values.reduce((best, value) => (value > best ? value : best), values.length ? values[0] : 0);
export const record = (value: unknown): Record<string, unknown> => (value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {});

/** `auto.shoot ?? auto_fuel`: legacy v3 rows only have the compatibility total. */
export function reportValues(payload: Payload): MatchValues {
  const auto = record(payload.auto);
  const teleop = record(payload.teleop);
  const autoScored = num(auto.shoot ?? payload.auto_fuel);
  const teleopScored = num(teleop.shoot ?? payload.teleop_fuel);
  return {
    autoScored, autoFerried: num(auto.ferry), teleopScored, teleopFerried: num(teleop.ferry),
    // Scored and ferried are separate metrics; ferried never inflates fuel.
    autoFuel: autoScored, teleopFuel: teleopScored,
    fouls: num(payload.fouls), defense: num(payload.defense_level), broken: payload.robot_broke ? 1 : 0,
  };
}

const manualOf = (payload: Payload) => record(payload.manual_match);
const stageOf = (payload: Payload) => (typeof manualOf(payload).stage === 'string' ? (manualOf(payload).stage as string).trim().toLowerCase() : '');
const labelOf = (payload: Payload) => (typeof manualOf(payload).label === 'string' ? (manualOf(payload).label as string).trim().toLowerCase() : '');

/** Mirrors the website and the validate_match_report_source trigger. */
export function matchReportKey(entry: ReportEntry, index = 0) {
  if (entry.match_id) return `scheduled:${entry.match_id}`;
  const stage = stageOf(entry.payload);
  const label = labelOf(entry.payload);
  if (stage && label) return `manual:${stage}:${label}`;
  return `report:${entry.id || index}`;
}

export function selectedMatchReportEntries<T extends ReportEntry>(entries: T[], sources: ReportSource[]) {
  const selected = new Map(sources.filter((source) => source.selected_entry_id).map((source) => [`${source.team_id}:${source.match_key}`, source.selected_entry_id]));
  return entries.filter((entry, index) => {
    const id = selected.get(`${entry.team_id}:${matchReportKey(entry, index)}`);
    return !id || id === entry.id;
  });
}

export function groupByTeam<T extends { team_id: string }>(rows: T[]) {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const bucket = grouped.get(row.team_id);
    if (bucket) bucket.push(row); else grouped.set(row.team_id, [row]);
  }
  return grouped;
}

const COMPETITIVE_STAGES = ['qualification', 'quarterfinal', 'semifinal', 'final', 'playoff'];

/** Official linked match type, else the manual stage. Unknown means not competitive. */
export function matchTypeOfEntry(entry: ReportEntry, matchTypes: MatchTypes): string | null {
  if (entry.match_id) {
    const type = matchTypes.get(entry.match_id);
    if (type) return type === 'qualification' || type === 'practice' ? type : 'playoff';
  }
  const stage = stageOf(entry.payload);
  if (!stage) return null;
  if (stage === 'qualification' || stage === 'practice') return stage;
  return COMPETITIVE_STAGES.includes(stage) ? 'playoff' : 'other';
}

export function isCompetitiveEntry(entry: ReportEntry, matchTypes: MatchTypes) {
  const type = matchTypeOfEntry(entry, matchTypes);
  return type === 'qualification' || type === 'playoff';
}
/** The website compares manual stage case-sensitively here (a bug that drops "Practice"); this is case-insensitive. */
export function isPracticeEntry(entry: ReportEntry, matchTypes: MatchTypes) {
  return matchTypeOfEntry(entry, matchTypes) === 'practice';
}

export function averageReportsByMatch(entries: ReportEntry[]): MatchValues[] {
  const byMatch = new Map<string, ReportEntry[]>();
  entries.forEach((entry, index) => {
    const key = matchReportKey(entry, index);
    const bucket = byMatch.get(key);
    if (bucket) bucket.push(entry); else byMatch.set(key, [entry]);
  });
  return [...byMatch.values()].map((reports) => {
    const values = reports.map((report) => reportValues(report.payload));
    const mean = (pick: (value: MatchValues) => number) => average(values.map(pick));
    return {
      autoScored: mean((v) => v.autoScored), autoFerried: mean((v) => v.autoFerried),
      teleopScored: mean((v) => v.teleopScored), teleopFerried: mean((v) => v.teleopFerried),
      autoFuel: mean((v) => v.autoFuel), teleopFuel: mean((v) => v.teleopFuel),
      fouls: mean((v) => v.fouls), defense: mean((v) => v.defense),
      broken: maximum(values.map((v) => v.broken)),
    };
  });
}

export function calculateScoutStats(entries: ReportEntry[]): ScoutStats {
  const matches = averageReportsByMatch(entries);
  const col = (pick: (value: MatchValues) => number) => matches.map(pick);
  const autoFuel = col((m) => m.autoFuel);
  const teleopFuel = col((m) => m.teleopFuel);
  return {
    entries: entries.length, matches: matches.length,
    autoMaxScored: maximum(col((m) => m.autoScored)), autoMaxFerried: maximum(col((m) => m.autoFerried)),
    autoAvgScored: average(col((m) => m.autoScored)), autoAvgFerried: average(col((m) => m.autoFerried)),
    teleopMaxScored: maximum(col((m) => m.teleopScored)), teleopMaxFerried: maximum(col((m) => m.teleopFerried)),
    teleopAvgScored: average(col((m) => m.teleopScored)), teleopAvgFerried: average(col((m) => m.teleopFerried)),
    avgFouls: average(col((m) => m.fouls)), defense: average(col((m) => m.defense)),
    brokenPercent: matches.length ? (matches.filter((m) => m.broken).length / matches.length) * 100 : 0,
    peakFuel: maximum(autoFuel.map((value, index) => value + teleopFuel[index])),
    totalFuel: average(autoFuel) + average(teleopFuel), autoFuel: average(autoFuel), teleopFuel: average(teleopFuel),
    autoPeakFuel: maximum(autoFuel), teleopPeakFuel: maximum(teleopFuel),
  };
}

export type StatsBasis = 'competitive' | 'practice' | 'auto';

/**
 * Competitive reports only, with admin-selected sources applied. 'auto' (match strategy
 * page) uses competitive once the team has a played qualification, otherwise practice.
 * Competitive and practice data are never mixed.
 */
export function statsForTeam(teamId: string, entries: ReportEntry[], sources: ReportSource[], matchTypes: MatchTypes, basis: StatsBasis, playedQualification = false): ScoutStats {
  const mine = entries.filter((entry) => entry.team_id === teamId);
  const useCompetitive = basis === 'competitive' || (basis === 'auto' && playedQualification);
  const chosen = mine.filter((entry) => (useCompetitive ? isCompetitiveEntry(entry, matchTypes) : isPracticeEntry(entry, matchTypes)));
  return calculateScoutStats(selectedMatchReportEntries(chosen, sources));
}

export const formatStat = (value: number) => value.toFixed(2);

// --- labels (apps/web/src/lib/match-label.ts) -------------------------------------------------

export type MatchLabelInput = { match_number: number | null; match_type: string | null; tba_match_key?: string | null };

export function matchLabel({ match_number, match_type, tba_match_key }: MatchLabelInput) {
  const key = tba_match_key ?? '';
  let found: RegExpMatchArray | null;
  if ((found = key.match(/_qm(\d+)$/))) return `Qualification ${found[1]}`;
  if ((found = key.match(/_pm(\d+)$/))) return `Practice ${found[1]}`;
  if ((found = key.match(/_qf(\d+)m(\d+)$/))) return `Quarterfinal ${found[1]} · Match ${found[2]}`;
  if ((found = key.match(/_sf(\d+)m(\d+)$/))) return `Semifinal ${found[1]} · Match ${found[2]}`;
  if ((found = key.match(/_f(\d+)m(\d+)$/))) return `Final ${found[2]}`;
  if ((found = key.match(/_ef(\d+)m(\d+)$/))) return `Tiebreaker ${found[2]}`;
  const number = match_number ?? '—';
  if (match_type === 'qualification') return `Qualification ${number}`;
  if (match_type === 'practice') return `Practice ${number}`;
  return `Playoff Match ${number}`;
}

const manualStageNames: Record<string, string> = { qualification: 'Qualification', practice: 'Practice', quarterfinal: 'Quarterfinal', semifinal: 'Semifinal', final: 'Final' };
export function manualMatchLabel(manual: Record<string, unknown>) {
  const rawStage = typeof manual.stage === 'string' ? manual.stage.trim() : '';
  const rawLabel = typeof manual.label === 'string' ? manual.label.trim() : '';
  const lower = rawStage.toLowerCase();
  const stage = manualStageNames[lower] ?? (['other', 'other / exception', 'manual match'].includes(lower) ? '' : rawStage);
  return rawLabel ? `${stage || 'Match'} ${rawLabel}` : stage || 'Match details unavailable';
}

export function matchRoundOrder({ match_type, tba_match_key }: Pick<MatchLabelInput, 'match_type' | 'tba_match_key'>) {
  if (match_type === 'practice') return 0;
  if (match_type === 'qualification') return 1;
  const key = tba_match_key ?? '';
  if (/_qf\d+m\d+$/.test(key)) return 2;
  if (/_sf\d+m\d+$/.test(key)) return 3;
  if (/_f\d+m\d+$/.test(key)) return 4;
  if (/_ef\d+m\d+$/.test(key)) return 5;
  return 2;
}

export function compareMatches(left: MatchLabelInput, right: MatchLabelInput) {
  const round = matchRoundOrder(left) - matchRoundOrder(right);
  if (round) return round;
  const sequence = (match: MatchLabelInput) => {
    const playoff = (match.tba_match_key ?? '').match(/_(?:qf|sf|f|ef)(\d+)m(\d+)$/);
    return playoff ? [Number(playoff[1]), Number(playoff[2])] : [match.match_number ?? 0, 0];
  };
  const [leftSet, leftMatch] = sequence(left);
  const [rightSet, rightMatch] = sequence(right);
  return leftSet - rightSet || leftMatch - rightMatch || (left.match_number ?? 0) - (right.match_number ?? 0);
}

export const labelForMatch = (match: Pick<Match, 'match_number' | 'match_type' | 'tba_match_key'>) => matchLabel(match);

export const STARTING_SPOT_LABELS: Record<string, string> = {
  depot: 'Depot', 'depot-bump': 'Depot Bump', hub: 'Hub', 'outpost-bump': 'Outpost Bump', outpost: 'Outpost',
  'depot-trench': 'Depot Trench', 'outpost-trench': 'Outpost Trench', 'line-1': 'Line 1', 'line-2': 'Line 2',
};
export const readableSpot = (value: unknown) => (typeof value === 'string' && value ? STARTING_SPOT_LABELS[value] ?? value.split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ') : 'Not recorded');

export type BreakageIssue = { issue: string; timestamp: string | null };
/** breakage_issues, falling back to the legacy break_tag / break_timestamp pair. */
export function breakageIssues(payload: Payload): BreakageIssue[] {
  if (payload.robot_broke !== true) return [];
  const raw = Array.isArray(payload.breakage_issues) ? payload.breakage_issues : [];
  const issues = raw
    .map((item) => {
      const value = record(item);
      const issue = typeof value.issue === 'string' && value.issue.trim() ? value.issue.trim() : '';
      return { issue, timestamp: typeof value.timestamp === 'string' && value.timestamp ? value.timestamp : null };
    })
    .filter((item) => item.issue || item.timestamp)
    .map((item) => ({ issue: item.issue || 'Issue not recorded', timestamp: item.timestamp }));
  if (issues.length) return issues;
  if (typeof payload.break_tag === 'string' && payload.break_tag) return [{ issue: payload.break_tag, timestamp: typeof payload.break_timestamp === 'string' ? payload.break_timestamp : null }];
  return [];
}

/** Heat colour used by the summary table: low->mid->high through red, yellow, green. */
export function heatColor(value: number, values: number[], reverse = false): [number, number, number] | null {
  const finite = values.filter(Number.isFinite);
  if (!Number.isFinite(value) || finite.length < 2) return null;
  const sorted = [...finite].sort((a, b) => a - b);
  const low = sorted[0];
  const high = sorted[sorted.length - 1];
  if (low === high) return null;
  const index = (sorted.length - 1) * 0.5;
  const middle = sorted[Math.floor(index)] + (sorted[Math.ceil(index)] - sorted[Math.floor(index)]) * (index - Math.floor(index));
  const blend = (from: [number, number, number], to: [number, number, number], amount: number) => from.map((v, i) => Math.round(v + (to[i] - v) * amount)) as [number, number, number];
  const lowColor: [number, number, number] = reverse ? [87, 187, 138] : [255, 0, 0];
  const highColor: [number, number, number] = reverse ? [255, 0, 0] : [87, 187, 138];
  return value <= middle ? blend(lowColor, [255, 255, 0], middle === low ? 1 : (value - low) / (middle - low)) : blend([255, 255, 0], highColor, high === middle ? 1 : (value - middle) / (high - middle));
}

// --- official match data (raw scores and score breakdown, no TBA key needed) -----------------

export type ScoredMatchLike = {
  id?: string; red_teams: string[]; blue_teams: string[]; status?: string;
  red_score?: number | null; blue_score?: number | null; tba_score_breakdown?: Record<string, unknown> | null;
};
const sideOf = (match: ScoredMatchLike, teamId: string): 'red' | 'blue' | null => (match.red_teams.includes(teamId) ? 'red' : match.blue_teams.includes(teamId) ? 'blue' : null);
const finalScore = (value: number | null | undefined) => (typeof value === 'number' && value >= 0 ? value : null);

/** TBA reports -1 for an unplayed match; that is pending, never a tie. */
export function matchOutcome(match: ScoredMatchLike, teamId: string): { outcome: 'win' | 'loss' | 'tie' | 'pending'; score: string } {
  const side = sideOf(match, teamId);
  const red = finalScore(match.red_score);
  const blue = finalScore(match.blue_score);
  if (!side || red === null || blue === null) return { outcome: 'pending', score: 'Not played' };
  const ours = side === 'red' ? red : blue;
  const theirs = side === 'red' ? blue : red;
  return { outcome: ours > theirs ? 'win' : ours < theirs ? 'loss' : 'tie', score: `${ours} – ${theirs}` };
}

/** Win-loss-tie from official final scores of the matches this team played (qualifications and playoffs). */
export function teamRecord(matches: (ScoredMatchLike & { match_type?: string })[], teamId: string) {
  const record = { wins: 0, losses: 0, ties: 0 };
  for (const match of matches) {
    if (match.match_type === 'practice') continue;
    const { outcome } = matchOutcome(match, teamId);
    if (outcome === 'win') record.wins += 1; else if (outcome === 'loss') record.losses += 1; else if (outcome === 'tie') record.ties += 1;
  }
  return record;
}

/** Alliance hub totals from tba_score_breakdown, averaged over matches the team played. */
export function officialFuelAverages(matches: ScoredMatchLike[], teamId: string) {
  const samples: { total: number; auto: number; teleop: number }[] = [];
  for (const match of matches) {
    const side = sideOf(match, teamId);
    if (!side) continue;
    const hub = asRecord(asRecord(match.tba_score_breakdown?.[side]).hubScore);
    if (!Object.keys(hub).length) continue;
    samples.push({ total: num(hub.totalCount ?? hub.totalPoints), auto: num(hub.autoCount ?? hub.autoPoints), teleop: num(hub.teleopCount ?? hub.teleopPoints) });
  }
  if (!samples.length) return null;
  const mean = (key: 'total' | 'auto' | 'teleop') => samples.reduce((sum, item) => sum + item[key], 0) / samples.length;
  return { matches: samples.length, total: mean('total'), auto: mean('auto'), teleop: mean('teleop') };
}
const asRecord = record;

/** Most common climb result and success rate from official per-robot tower fields. */
export function officialClimb(matches: ScoredMatchLike[], teamId: string) {
  const auto: string[] = [];
  const endgame: string[] = [];
  for (const match of matches) {
    const side = sideOf(match, teamId);
    if (!side) continue;
    const slot = (side === 'red' ? match.red_teams : match.blue_teams).indexOf(teamId) + 1;
    const breakdown = match.tba_score_breakdown?.[side];
    if (!breakdown || typeof breakdown !== 'object' || !slot) continue;
    const fields = breakdown as Record<string, unknown>;
    auto.push(String(fields[`autoTowerRobot${slot}`] ?? 'None'));
    endgame.push(String(fields[`endGameTowerRobot${slot}`] ?? 'None'));
  }
  const typical = (values: string[]) => {
    if (!values.length) return '—';
    const counts = new Map<string, number>();
    for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  };
  const rate = (values: string[]) => (values.length ? (values.filter((value) => value !== 'None' && value !== '').length / values.length) * 100 : 0);
  return { matches: Math.max(auto.length, endgame.length), autoClimb: typical(auto), autoClimbRate: rate(auto), endgameClimb: typical(endgame), endgameClimbRate: rate(endgame) };
}

// --- leaderboard (apps/web/src/app/leaderboard/leaderboard-board.tsx) -------------------------

export type LeaderboardEntry = {
  id: string; type: 'match' | 'pit' | 'pre_scout'; scoutUserId: string; scoutName: string;
  teamId: string | null; matchId: string | null; matchType: string | null; manualStage: string | null; manualMatchKey: string | null;
};
export type LeaderboardSection = 'all' | 'match' | 'pit' | 'pre_scout';
export type MatchRound = 'practice' | 'qualification' | 'playoff';
export const ALL_ROUNDS: MatchRound[] = ['practice', 'qualification', 'playoff'];

export function entryRound(entry: Pick<LeaderboardEntry, 'matchType' | 'manualStage'>): MatchRound | null {
  const type = entry.matchType?.trim().toLowerCase();
  if (type === 'practice' || type === 'qualification') return type;
  if (type === 'playoff' || type === 'quarterfinal' || type === 'semifinal' || type === 'final') return 'playoff';
  const stage = entry.manualStage?.trim().toLowerCase();
  if (stage === 'practice' || stage === 'qualification') return stage;
  return ['playoff', 'quarterfinal', 'semifinal', 'final'].includes(stage ?? '') ? 'playoff' : null;
}

/** Same grouping and ordering as the website: reports desc, then name. Match rows also count teams and matches. */
export function leaderboardRows(entries: LeaderboardEntry[], section: LeaderboardSection, rounds: MatchRound[]) {
  const filtered = entries.filter((entry) => {
    if (section === 'all') return true;
    if (entry.type !== section) return false;
    const round = entryRound(entry);
    return section !== 'match' || (round !== null && rounds.includes(round));
  });
  const excludedUnclassified = section === 'match' ? entries.filter((entry) => entry.type === 'match' && entryRound(entry) === null).length : 0;
  const byScout = new Map<string, { id: string; name: string; reports: number; teams: Set<string>; matches: Set<string> }>();
  for (const entry of filtered) {
    const current = byScout.get(entry.scoutUserId) ?? { id: entry.scoutUserId, name: entry.scoutName, reports: 0, teams: new Set<string>(), matches: new Set<string>() };
    current.reports += 1;
    if (entry.type === 'match') {
      if (entry.teamId) current.teams.add(entry.teamId);
      current.matches.add(entry.matchId ?? entry.manualMatchKey ?? entry.id);
    }
    byScout.set(entry.scoutUserId, current);
  }
  const rows = [...byScout.values()].map((row) => ({ id: row.id, name: row.name, reports: row.reports, teams: row.teams.size, matches: row.matches.size }))
    .sort((a, b) => b.reports - a.reports || a.name.localeCompare(b.name));
  return { rows, excludedUnclassified };
}

// --- official TBA data from bundle.official ---------------------------------------------------

export type OfficialBundle = { rankings: Record<string, unknown>[]; sortInfo: Record<string, unknown>[]; oprs: Record<string, number>; apiError?: string } | undefined;
export type OfficialTeam = { rank: number | null; record: string | null; opr: number | null; sort: (pattern: RegExp) => number | null };

/** Rank, record and OPR for a team number; the key is `frc{number}` as on the website. */
export function officialForTeam(official: OfficialBundle, teamNumber: number, displayNumber?: string): OfficialTeam {
  const keys = [`frc${teamNumber}`, displayNumber ? `frc${displayNumber}` : ''].filter(Boolean);
  const ranking = official?.rankings.find((item) => keys.includes(String(item.team_key ?? '')));
  const record = asRecord(ranking?.record);
  const oprs = official?.oprs ?? {};
  const oprKey = keys.find((key) => typeof oprs[key] === 'number');
  const rankValue = Number(ranking?.rank);
  return {
    rank: ranking && Number.isFinite(rankValue) && rankValue > 0 ? rankValue : null,
    record: ranking && record.wins !== undefined ? `${num(record.wins)}-${num(record.losses)}-${num(record.ties)}` : null,
    opr: oprKey ? oprs[oprKey] : null,
    sort: (pattern) => {
      const index = (official?.sortInfo ?? []).findIndex((item) => pattern.test(String(item.name ?? '')));
      const value = index >= 0 && Array.isArray(ranking?.sort_orders) ? Number((ranking.sort_orders as unknown[])[index]) : NaN;
      return Number.isFinite(value) ? value : null;
    },
  };
}

/** Orders by TBA rank (ranked teams first), then team number. */
export const byOfficialRank = (a: { rank: number | null; number: number }, b: { rank: number | null; number: number }) =>
  (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER) || a.number - b.number;

/** Prescout assignments are coordination only: they never block a submission. */
export function prescoutCoordination(assignments: { team_id: string; scout_user_id: string }[] | undefined, userId: string | undefined) {
  const byTeam = new Map<string, string[]>();
  for (const item of assignments ?? []) byTeam.set(item.team_id, [...(byTeam.get(item.team_id) ?? []), item.scout_user_id]);
  const mine = new Set([...byTeam].filter(([, scouts]) => userId && scouts.includes(userId)).map(([team]) => team));
  return { byTeam, mine };
}

/**
 * Verified live policy (private.can_submit_active_event_prescout; apps/web/src/lib/mobile/README.md):
 * an ordinary author may write a pre-scout report only with an explicit assignment, OR when the
 * event is ACTIVE and the team is registered to it. admin/developer/global_scout bypass both;
 * strategist and master do not. Event status matters: an archived/upcoming event is blocked.
 */
export function prescoutBlocked(args: { privileged: boolean; teamId: string | null; eventActive: boolean; eventTeamIds: Iterable<string>; assignedTeamIds: Set<string> }) {
  if (args.privileged || !args.teamId) return false;
  if (args.assignedTeamIds.has(args.teamId)) return false;
  return !(args.eventActive && new Set(args.eventTeamIds).has(args.teamId));
}

export type OfficialFeedState = { state: 'ok' | 'not-downloaded' | 'error' | 'unpublished'; message: string | null };
/** Explains why TBA rank/record/OPR may be blank; null message when the feed is fine. */
export function officialFeedStatus(official: { rankings: unknown[]; oprs: Record<string, number>; apiError?: string } | undefined | null, manualEvent = false): OfficialFeedState {
  if (manualEvent) return { state: 'ok', message: null };
  if (!official) return { state: 'not-downloaded', message: 'TBA rank and OPR were not part of this download, so they are hidden. Refresh while online to fetch them.' };
  const error = typeof official.apiError === 'string' ? official.apiError.trim() : '';
  if (error) return { state: 'error', message: `TBA rank and OPR could not be loaded (${error}). Scouted numbers below are unaffected; refresh while online to retry.` };
  if (!official.rankings.length && !Object.keys(official.oprs).length) return { state: 'unpublished', message: 'TBA has not published rankings or OPR for this event yet.' };
  return { state: 'ok', message: null };
}

/** Profile name, else the signed-in viewer's own display name for their own reports. */
export function scoutDisplayName(profiles: Record<string, string> | undefined, userId: string, viewer?: { userId: string; displayName?: string | null } | null, fallback = 'Unknown scout') {
  const known = profiles?.[userId]?.trim();
  if (known) return known;
  if (viewer && viewer.userId === userId && viewer.displayName?.trim()) return viewer.displayName.trim();
  return fallback;
}

// --- schedule focus / query (pure) -------------------------------------------------------------

type ScheduleTeam = { id: string; number?: number; displayNumber: string; name: string };
type ScheduleMatch = { id: string; match_number: number; match_type: string; tba_match_key?: string | null; red_teams: string[]; blue_teams: string[] };

/**
 * Which matches and robot chips the Schedule shows.
 * - A focused match always shows exactly its roster.
 * - Otherwise a team query filters only teams it actually matches; a match label/number query also
 *   offers the displayed matches' rosters so "Scout this match" can always be enabled.
 */
export function scheduleView<T extends ScheduleTeam, M extends ScheduleMatch>(teams: T[], matches: M[], query: string, focusId: string | null): { matches: M[]; teams: T[] } {
  const byId = new Map(teams.map((team) => [team.id, team]));
  const roster = (match: ScheduleMatch) => [...match.red_teams, ...match.blue_teams].map((id) => byId.get(id)).filter((team): team is T => Boolean(team));
  if (focusId) {
    const focused = matches.find((match) => match.id === focusId);
    if (focused) return { matches: [focused], teams: roster(focused) };
  }
  const needle = query.trim().toLowerCase();
  if (!needle) return { matches, teams };
  const teamHit = (team: T) => `${team.displayNumber} ${team.name}`.toLowerCase().includes(needle);
  const labelHit = (match: ScheduleMatch) => String(match.match_number).includes(needle) || matchLabel(match).toLowerCase().includes(needle);
  const rosterHit = (match: ScheduleMatch) => roster(match).some((team) => team.displayNumber.toLowerCase().includes(needle));
  const shown = matches.filter((match) => labelHit(match) || rosterHit(match));
  const chips = new Map<string, T>();
  for (const team of teams) if (teamHit(team)) chips.set(team.id, team);
  for (const match of shown) if (labelHit(match)) for (const team of roster(match)) chips.set(team.id, team);
  return { matches: shown, teams: teams.filter((team) => chips.has(team.id)) };
}
