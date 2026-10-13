import assert from 'node:assert/strict';
import { test } from 'node:test';
import { appendPoint, strokesToSvg, svgToStrokes, type Stroke } from './autoPath';
import { dimensionsLabel, joinPayload, setDimensions, snap, splitPayload, toggleTraversal, validateManual, HOPPER_CAPACITY, reviewRows } from './manualFields';
import { planInsert, planMove, planMoveToTier, teamsInTier, UNSORTED } from './picklist';
import { breakageIssues, calculateScoutStats, compareMatches, latestPreScout, officialMetrics, STRATEGY_DEFAULT_SORT, strategyMatchOrder, matchLabel, matchReportKey, selectedMatchReportEntries, statsForTeam, type ReportEntry } from './stats';
import type { Match, NativeEntry } from '../core/types';

test('website strategist defaults sort by OPR and unranked picklist order uses OPR before number', () => {
  assert.equal(STRATEGY_DEFAULT_SORT, 'opr');
  const teams = [{ id: 'a', number: 1, opr: 10 }, { id: 'b', number: 2, opr: 50 }, { id: 'c', number: 3, opr: 20 }];
  assert.deepEqual(teamsInTier(teams, new Map(), UNSORTED).map(team => team.id), ['b', 'c', 'a']);
});

test('official fuel prefers played alliance observations then falls back to TBA ranking sort fields', () => {
  const official = { rankings: [{ team_key: 'frc694', rank: 2, sort_orders: [150, 40, 80, 20, 10] }], sortInfo: ['Total fuel','Auto fuel','Teleop fuel','Transition fuel','Endgame fuel'].map(name => ({ name })), oprs: { frc694: 77 } };
  const team = { id: 'team', number: 694 };
  const fallback = officialMetrics(official, [], team);
  assert.equal(fallback.tbaTotalFuel, 150);
  assert.equal(fallback.tbaTransitionFuel, 20);
  assert.equal(fallback.tbaEndgameFuel, 10);
  assert.equal(fallback.opr, 77);
  const observed = officialMetrics(official, [{ red_teams: ['team'], blue_teams: [], status: 'played', tba_score_breakdown: { red: { hubScore: { totalCount: 200, autoCount: 60, teleopCount: 140 } } } }], team);
  assert.equal(observed.tbaTotalFuel, 200);
  assert.equal(observed.tbaAutoFuel, 60);
  assert.equal(observed.tbaTeleopFuel, 140);
});

test('pre-scout sheet follows creation time, not later submission time', () => {
  const first = { ...entry('first', 'team', {}), entry_type: 'pre_scout', status: 'submitted', created_at: '2026-01-01', submitted_at: '2026-01-03' } as NativeEntry;
  const second = { ...first, id: 'second', created_at: '2026-01-02', submitted_at: '2026-01-02' };
  assert.equal(latestPreScout([first, second]).get('team')?.id, 'second');
});

test('strategy picker retains newly played matches for five minutes then demotes them', () => {
  const played = { id: 'q1', match_type: 'qualification', match_number: 1, status: 'played' } as Match;
  const pending = { ...played, id: 'q2', match_number: 2, status: 'scheduled' };
  assert.deepEqual(strategyMatchOrder([played, pending], { q1: 1000 }, 2000).map(match => match.id), ['q1', 'q2']);
  assert.deepEqual(strategyMatchOrder([played, pending], { q1: 1000 }, 301000).map(match => match.id), ['q2', 'q1']);
  assert.deepEqual(strategyMatchOrder([played, pending], {}, 2000).map(match => match.id), ['q2', 'q1']);
});

function entry(id: string, team: string, payload: Record<string, unknown>, match: string | null = null): ReportEntry { return { id, team_id: team, match_id: match, payload }; }

test('stats keep scored and ferried separate and average within a match', () => {
  const a = entry('a', 't', { auto: { shoot: 4, ferry: 10 }, teleop: { shoot: 10, ferry: 0 }, fouls: 2 }, 'm1');
  const b = entry('b', 't', { auto: { shoot: 2, ferry: 0 }, teleop: { shoot: 20, ferry: 6 }, fouls: 0, robot_broke: true }, 'm1');
  const c = entry('c', 't', { auto: { shoot: 0, ferry: 0 }, teleop: { shoot: 10, ferry: 0 } }, 'm2');
  const stats = calculateScoutStats([a, b, c]);
  assert.equal(stats.entries, 3);
  assert.equal(stats.matches, 2);
  assert.equal(stats.autoAvgScored, 1.5); // (avg(4,2)=3 + 0) / 2
  assert.equal(stats.autoMaxFerried, 5);
  assert.equal(stats.teleopMaxScored, 15);
  assert.equal(stats.brokenPercent, 50);
  assert.equal(stats.totalFuel, 1.5 + 12.5);
});

test('legacy compatibility totals only apply when shoot is absent', () => {
  const stats = calculateScoutStats([entry('a', 't', { auto_fuel: 7, teleop_fuel: 9 }, 'm')]);
  assert.equal(stats.autoAvgScored, 7);
  const v4 = calculateScoutStats([entry('b', 't', { auto: { shoot: 3, ferry: 4 }, auto_fuel: 7 }, 'm')]);
  assert.equal(v4.autoAvgScored, 3);
});

test('practice and competitive data are never mixed', () => {
  const types = new Map([['mq', 'qualification'], ['mp', 'practice'], ['mf', 'playoff']]);
  const rows = [
    entry('q', 't', { teleop: { shoot: 10, ferry: 0 } }, 'mq'),
    entry('p', 't', { teleop: { shoot: 100, ferry: 0 } }, 'mp'),
    entry('f', 't', { teleop: { shoot: 20, ferry: 0 } }, 'mf'),
    entry('m', 't', { teleop: { shoot: 40, ferry: 0 }, manual_match: { stage: 'Practice', label: '3' } }),
    entry('x', 't', { teleop: { shoot: 999, ferry: 0 }, manual_match: { stage: 'Other / exception', label: null } }),
  ];
  assert.equal(statsForTeam('t', rows, [], types, 'competitive').teleopAvgScored, 15);
  assert.equal(statsForTeam('t', rows, [], types, 'practice').teleopAvgScored, 70);
  assert.equal(statsForTeam('t', rows, [], types, 'auto', false).matches, 2);
  assert.equal(statsForTeam('t', rows, [], types, 'auto', true).matches, 2);
});

test('report keys and selected sources follow the server trigger', () => {
  const scheduled = entry('s', 't', {}, 'match-1');
  const manual = entry('m', 't', { manual_match: { stage: ' Qualification ', label: ' 7 ' } });
  const orphan = entry('o', 't', {});
  assert.equal(matchReportKey(scheduled), 'scheduled:match-1');
  assert.equal(matchReportKey(manual), 'manual:qualification:7');
  assert.equal(matchReportKey(orphan), 'report:o');
  const second = entry('s2', 't', {}, 'match-1');
  const picked = selectedMatchReportEntries([scheduled, second], [{ team_id: 't', match_key: 'scheduled:match-1', selected_entry_id: 's2' }]);
  assert.deepEqual(picked.map((item) => item.id), ['s2']);
});

test('match labels and ordering', () => {
  assert.equal(matchLabel({ match_number: 3, match_type: 'qualification', tba_match_key: '2026nyny_qm3' }), 'Qualification 3');
  assert.equal(matchLabel({ match_number: 1, match_type: 'playoff', tba_match_key: '2026nyny_sf2m1' }), 'Semifinal 2 · Match 1');
  assert.equal(matchLabel({ match_number: 5, match_type: 'playoff', tba_match_key: 'manual_x' }), 'Playoff Match 5');
  const sorted = [
    { match_number: 1, match_type: 'playoff', tba_match_key: 'e_sf1m1' },
    { match_number: 9, match_type: 'qualification', tba_match_key: 'e_qm9' },
    { match_number: 1, match_type: 'practice', tba_match_key: 'e_pm1' },
  ].sort(compareMatches);
  assert.deepEqual(sorted.map((m) => m.tba_match_key), ['e_pm1', 'e_qm9', 'e_sf1m1']);
});

test('breakage issues fall back to legacy fields', () => {
  assert.deepEqual(breakageIssues({ robot_broke: false, breakage_issues: [{ issue: 'x' }] }), []);
  assert.deepEqual(breakageIssues({ robot_broke: true, break_tag: 'Drive issue', break_timestamp: '1:05' }), [{ issue: 'Drive issue', timestamp: '1:05' }]);
  assert.deepEqual(breakageIssues({ robot_broke: true, breakage_issues: [{ issue: 'Shooter broke', timestamp: '0:30' }, { issue: '', timestamp: null }] }), [{ issue: 'Shooter broke', timestamp: '0:30' }]);
});

test('auto path SVG round-trips and honours the website format', () => {
  const strokes: Stroke[] = [
    { color: '#ef4444', points: [{ x: 10, y: 20 }, { x: 30.04, y: 40 }, { x: 100, y: 200.5 }] },
    { color: '#111827', points: [{ x: 5, y: 5 }] },
  ];
  const svg = strokesToSvg(strokes);
  assert.ok(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1380 674"><defs>'));
  assert.equal((svg.match(/<path /g) ?? []).length, 1);
  assert.ok(svg.includes('M 10.0 20.0 L 30.0 40.0 L 100.0 200.5'));
  assert.ok(svg.includes('stop-opacity="0.4"'));
  const parsed = svgToStrokes(svg);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].color, '#ef4444');
  assert.deepEqual(parsed[0].points[2], { x: 100, y: 200.5 });
  assert.equal(strokesToSvg([]), '');
  assert.deepEqual(svgToStrokes('not svg'), []);
});

test('appendPoint enforces spacing and caps', () => {
  const base: Stroke[] = [{ color: '#ef4444', points: [{ x: 0, y: 0 }] }];
  assert.equal(appendPoint(base, { x: 2, y: 2 }), base);
  assert.equal(appendPoint(base, { x: 10, y: 0 })[0].points.length, 2);
  const full: Stroke[] = [{ color: '#ef4444', points: Array.from({ length: 600 }, (_, i) => ({ x: i * 6, y: 0 })) }];
  assert.equal(appendPoint(full, { x: 9999, y: 0 }), full);
});

test('pit field bounds, derived dimensions and traversal', () => {
  assert.equal(snap(HOPPER_CAPACITY, 133), 130);
  assert.equal(snap(HOPPER_CAPACITY, 999), 500);
  assert.equal(dimensionsLabel(30, 28.5), '30 in × 28.5 in (117 in perimeter)');
  const next = setDimensions({ comments: 'x' }, 30.2, 80);
  assert.deepEqual(next, { comments: 'x', drivetrain_length: '30', drivetrain_width: '55', dimensions: '30 in × 55 in (170 in perimeter)' });
  assert.equal(toggleTraversal('', 'bump'), 'bump');
  assert.equal(toggleTraversal('bump', 'trench'), 'bump,trench');
  assert.equal(toggleTraversal('bump,trench', 'bump'), 'trench');
});

test('manual validation and payload preservation', () => {
  assert.deepEqual(validateManual('pre_scout', null, {}).errors, ['Choose a team.']);
  assert.equal(validateManual('pre_scout', 't', { average_pieces: '1000' }).errors.length, 1);
  assert.equal(validateManual('pre_scout', 't', { average_pieces: '35' }).errors.length, 0);
  assert.equal(validateManual('pit', 't', { drivetrain_length: '30', drivetrain_width: '30' }).warnings.length, 1);
  const { fields, extras } = splitPayload({ comments: 'hi', future_flag: true, nested: { a: 1 } });
  assert.deepEqual(extras, { future_flag: true, nested: { a: 1 } });
  assert.deepEqual(joinPayload({ ...fields, comments: 'bye' }, extras), { future_flag: true, nested: { a: 1 }, comments: 'bye' });
  assert.equal(reviewRows('pit', {}).every((row) => row.value === 'Not recorded'), true);
});

test('picklist planning inserts at midpoints and renumbers on collision', () => {
  const tier = [{ teamId: 'a', rank: 1024 }, { teamId: 'b', rank: 2048 }];
  assert.deepEqual(planInsert('x', tier, 1, 'tier'), [{ teamId: 'x', rank: 1536, category_id: 'tier' }]);
  assert.deepEqual(planInsert('x', tier, 0, 'tier'), [{ teamId: 'x', rank: 0, category_id: 'tier' }]);
  assert.deepEqual(planInsert('x', tier, 2, 'tier'), [{ teamId: 'x', rank: 3072, category_id: 'tier' }]);
  const tight = [{ teamId: 'a', rank: 5 }, { teamId: 'b', rank: 6 }];
  assert.deepEqual(planInsert('x', tight, 1, UNSORTED).map((patch) => patch.teamId), ['a', 'x', 'b']);
  assert.deepEqual(planInsert('x', tight, 1, UNSORTED).map((patch) => patch.rank), [1024, 2048, 3072]);
  assert.equal(planInsert('x', tight, 1, UNSORTED)[0].category_id, null);
});

test('picklist moves swap, cross tiers and sort', () => {
  const orders = { hi: [{ teamId: 'a', rank: 1 }, { teamId: 'b', rank: 2 }], lo: [{ teamId: 'c', rank: 10 }] };
  assert.deepEqual(planMove('a', ['hi', 'lo'], orders, 'hi', 1), [
    { teamId: 'a', rank: 2, category_id: 'hi' }, { teamId: 'b', rank: 1, category_id: 'hi' },
  ]);
  const crossing = planMove('b', ['hi', 'lo'], orders, 'hi', 1);
  assert.equal(crossing[0].category_id, 'lo');
  assert.equal(crossing[0].rank, 10 - 1024);
  assert.deepEqual(planMove('a', ['hi', 'lo'], orders, 'hi', -1), []);
  assert.equal(planMoveToTier('a', orders, 'lo')[0].rank, 10 + 1024);
  const rankings = new Map([['a', { team_id: 'a', rank: 2, category_id: 'hi', note: null, selected: false, tag_ids: [] }], ['b', { team_id: 'b', rank: 1, category_id: 'hi', note: null, selected: false, tag_ids: [] }]]);
  const teams = [{ id: 'a', number: 1 }, { id: 'b', number: 2 }, { id: 'z', number: 3 }];
  assert.deepEqual(teamsInTier(teams, rankings, 'hi').map((t) => t.id), ['b', 'a']);
  assert.deepEqual(teamsInTier(teams, rankings, UNSORTED).map((t) => t.id), ['z']);
});

import { matchOutcome, officialClimb, officialFuelAverages, teamRecord } from './stats';
import { describeChange, groupRevisions, planRemoveTier, planRestore, validateMetaName, type FullRanking, type HistoryChange } from './picklist';
import { parseStrokes, toDisplay, toStored } from './strategyDrawing';

test('official outcomes treat -1 as pending and never as a tie', () => {
  const base = { red_teams: ['a', 'b', 'c'], blue_teams: ['d', 'e', 'f'] };
  assert.deepEqual(matchOutcome({ ...base, red_score: -1, blue_score: -1 }, 'a'), { outcome: 'pending', score: 'Not played' });
  assert.deepEqual(matchOutcome({ ...base, red_score: 50, blue_score: 40 }, 'a'), { outcome: 'win', score: '50 – 40' });
  assert.deepEqual(matchOutcome({ ...base, red_score: 50, blue_score: 40 }, 'd'), { outcome: 'loss', score: '40 – 50' });
  assert.equal(matchOutcome({ ...base, red_score: 30, blue_score: 30 }, 'e').outcome, 'tie');
  assert.deepEqual(teamRecord([{ ...base, match_type: 'qualification', red_score: 50, blue_score: 40 }, { ...base, match_type: 'practice', red_score: 1, blue_score: 9 }, { ...base, match_type: 'qualification', red_score: null, blue_score: null }], 'a'), { wins: 1, losses: 0, ties: 0 });
});

test('official fuel and climb come from the alliance breakdown by slot', () => {
  const match = {
    red_teams: ['a', 'b', 'c'], blue_teams: ['d', 'e', 'f'],
    tba_score_breakdown: { red: { hubScore: { totalCount: 80, autoCount: 20, teleopCount: 60 }, endGameTowerRobot2: 'Level2', autoTowerRobot2: 'None' }, blue: {} },
  };
  const fuel = officialFuelAverages([match, { ...match, tba_score_breakdown: { red: { hubScore: { totalCount: 40, autoCount: 10, teleopCount: 30 } } } }], 'b');
  assert.deepEqual(fuel, { matches: 2, total: 60, auto: 15, teleop: 45 });
  const climb = officialClimb([match], 'b');
  assert.equal(climb.endgameClimb, 'Level2');
  assert.equal(climb.endgameClimbRate, 100);
  assert.equal(climb.autoClimbRate, 0);
  assert.equal(officialFuelAverages([match], 'zzz'), null);
});

test('picklist history groups sessions and restores prior boards', () => {
  const at = (minute: number) => new Date(Date.UTC(2026, 0, 1, 12, minute)).toISOString();
  const change = (id: string, team: string, minute: number, actor: string, before: Record<string, unknown> | null, after: Record<string, unknown> | null, action: HistoryChange['action'] = 'updated'): HistoryChange => ({ id, team_id: team, actor_user_id: actor, action, before_state: before, after_state: after, created_at: at(minute) });
  const changes = [
    change('3', 'a', 30, 'u2', { rank: 2, category_id: 't2' }, { rank: 1, category_id: 't2' }),
    change('2', 'b', 11, 'u1', { rank: 5, category_id: 't1', note: '' }, { rank: 5, category_id: 't2', note: 'x' }),
    change('1', 'a', 10, 'u1', { rank: 1, category_id: 't1' }, { rank: 2, category_id: 't2' }),
  ];
  const revisions = groupRevisions(changes);
  assert.equal(revisions.length, 2);
  assert.deepEqual(revisions[1].changes.map((item) => item.id), ['2', '1']);
  const current = new Map<string, FullRanking>([
    ['a', { rank: 1, category_id: 't2', note: '', selected: false, tag_ids: [] }],
    ['b', { rank: 5, category_id: 't2', note: 'x', selected: false, tag_ids: [] }],
  ]);
  // Restore to the state right after the older session: undo only the newer one.
  const plan = planRestore(current, revisions, 1, ['a', 'b']);
  assert.deepEqual(plan.map((item) => item.teamId), ['a']);
  assert.equal(plan[0].state.rank, 2);
  // Restoring the newest version changes nothing.
  assert.deepEqual(planRestore(current, revisions, 0, ['a', 'b']), []);
  assert.equal(describeChange(changes[1], (id) => String(id), () => undefined), 'Moved from t1 to t2 · Updated note');
});

test('removing a tier appends its teams to the neighbouring tier', () => {
  const orders = { __unsorted__: [], hi: [{ teamId: 'a', rank: 1 }], lo: [{ teamId: 'b', rank: 1 }, { teamId: 'c', rank: 2 }] };
  const plan = planRemoveTier('hi', ['__unsorted__', 'hi', 'lo'], orders);
  assert.equal(plan.fallback, 'lo');
  assert.deepEqual(plan.patches, [{ teamId: 'a', rank: 3072, category_id: 'lo' }]);
  assert.equal(planRemoveTier('only', ['__unsorted__', 'only'], { only: [] }).fallback, null);
  assert.equal(validateMetaName('  ', []), 'Enter a name.');
  assert.equal(validateMetaName('Elite', ['elite']), 'That name already exists.');
  assert.equal(validateMetaName('New', ['Elite']), null);
});

test('strategy strokes are normalized, flipped and parsed defensively', () => {
  assert.deepEqual(toStored(0.25, 0.75, true), { x: 0.75, y: 0.25 });
  const roundTrip = toDisplay(toStored(0.2, 0.3, true), true);
  assert.ok(Math.abs(roundTrip.x - 0.2) < 1e-9 && Math.abs(roundTrip.y - 0.3) < 1e-9);
  assert.deepEqual(toStored(2, -1, false), { x: 1, y: 0 });
  const parsed = parseStrokes([{ color: '#fff', points: [{ x: 0.1, y: 2 }, { x: 'bad', y: 0 }] }, { color: 3, points: [] }, null]);
  assert.deepEqual(parsed, [{ color: '#fff', points: [{ x: 0.1, y: 1 }] }]);
  assert.deepEqual(parseStrokes('nope'), []);
});

import { byOfficialRank, entryRound, leaderboardRows, officialForTeam, prescoutCoordination, type LeaderboardEntry } from './stats';

test('leaderboard mirrors the website grouping, rounds and unclassified exclusion', () => {
  const e = (id: string, type: LeaderboardEntry['type'], scout: string, extra: Partial<LeaderboardEntry> = {}): LeaderboardEntry => ({ id, type, scoutUserId: scout, scoutName: scout.toUpperCase(), teamId: null, matchId: null, matchType: null, manualStage: null, manualMatchKey: null, ...extra });
  const entries = [
    e('1', 'match', 'a', { teamId: 't1', matchId: 'm1', matchType: 'qualification' }),
    e('2', 'match', 'a', { teamId: 't2', matchId: 'm1', matchType: 'qualification' }),
    e('3', 'match', 'b', { teamId: 't1', matchType: null, manualStage: 'Semifinal', manualMatchKey: 'semifinal|1' }),
    e('4', 'match', 'b', { teamId: 't3' }), // no round label
    e('5', 'pit', 'b'), e('6', 'pre_scout', 'c'),
  ];
  const all = leaderboardRows(entries, 'all', []);
  assert.deepEqual(all.rows.map((row) => [row.name, row.reports]), [['B', 3], ['A', 2], ['C', 1]]);
  const quals = leaderboardRows(entries, 'match', ['qualification']);
  assert.deepEqual(quals.rows, [{ id: 'a', name: 'A', reports: 2, teams: 2, matches: 1 }]);
  assert.equal(quals.excludedUnclassified, 1);
  assert.equal(leaderboardRows(entries, 'match', ['playoff']).rows[0].name, 'B');
  assert.equal(entryRound({ matchType: 'quarterfinal', manualStage: null }), 'playoff');
  assert.equal(leaderboardRows(entries, 'pit', []).rows.length, 1);
});

test('official rank, record and OPR come from bundle.official and never fall back to inventions', () => {
  const official = { rankings: [{ team_key: 'frc254', rank: 2, record: { wins: 5, losses: 1, ties: 0 }, sort_orders: [3.1, 40.5] }], sortInfo: [{ name: 'Ranking Score' }, { name: 'Avg Match Fuel' }], oprs: { frc254: 61.2 } };
  const team = officialForTeam(official, 254);
  assert.deepEqual([team.rank, team.record, team.opr], [2, '5-1-0', 61.2]);
  assert.equal(team.sort(/fuel/i), 40.5);
  assert.equal(team.sort(/climb/i), null);
  const missing = officialForTeam(official, 999);
  assert.deepEqual([missing.rank, missing.record, missing.opr], [null, null, null]);
  assert.deepEqual(officialForTeam(undefined, 254).rank, null);
  assert.ok(byOfficialRank({ rank: 1, number: 9 }, { rank: null, number: 1 }) < 0);
});

test('prescout assignments only coordinate', () => {
  const { byTeam, mine } = prescoutCoordination([{ team_id: 't1', scout_user_id: 'me' }, { team_id: 't1', scout_user_id: 'you' }, { team_id: 't2', scout_user_id: 'you' }], 'me');
  assert.deepEqual(byTeam.get('t1'), ['me', 'you']);
  assert.deepEqual([...mine], ['t1']);
  assert.equal(prescoutCoordination(undefined, 'me').mine.size, 0);
});

import { reportGroups, qrSize } from './reportDetail';
import { officialFeedStatus, prescoutBlocked } from './stats';

test('prescout gate: active event team OR assigned OR privileged; event status matters', () => {
  const base = { privileged: false, teamId: 't1', eventActive: true, eventTeamIds: ['t1', 't2'], assignedTeamIds: new Set<string>() };
  assert.equal(prescoutBlocked(base), false);
  assert.equal(prescoutBlocked({ ...base, eventActive: false }), true);
  assert.equal(prescoutBlocked({ ...base, eventActive: false, assignedTeamIds: new Set(['t1']) }), false);
  assert.equal(prescoutBlocked({ ...base, eventActive: false, privileged: true }), false);
  assert.equal(prescoutBlocked({ ...base, teamId: 't9' }), true);
  assert.equal(prescoutBlocked({ ...base, teamId: 't9', assignedTeamIds: new Set(['t9']) }), false);
  assert.equal(prescoutBlocked({ ...base, teamId: null, eventActive: false }), false);
});

test('official feed status explains failures and stays quiet when fine', () => {
  assert.equal(officialFeedStatus(undefined).state, 'not-downloaded');
  assert.match(officialFeedStatus({ rankings: [], oprs: {}, apiError: 'TBA 503' }).message ?? '', /TBA 503/);
  assert.equal(officialFeedStatus({ rankings: [], oprs: {}, apiError: '' }).state, 'unpublished');
  assert.equal(officialFeedStatus({ rankings: [{}], oprs: {}, apiError: '' }).message, null);
  assert.equal(officialFeedStatus(undefined, true).message, null);
});

test('match report detail groups observations and keeps no-show truthful', () => {
  const groups = reportGroups('match', { no_show: false, starting_spot: 'depot-bump', auto: { shoot: 12, ferry: 3 }, teleop: { shoot: 40, ferry: 0 }, fouls: 1, defense: true, defense_level: 7, defended_teams: ['a'], robot_broke: true, breakage_issues: [{ issue: 'Intake jam', timestamp: 'Teleop' }], comments: 'Fast', report_source: 'scheduled', manual_match: null, custom_flag: 1 }, () => '694');
  const titles = groups.map((group) => group.title);
  assert.deepEqual(titles, ['Match', 'Scoring', 'Defense', 'Reliability', 'Notes', 'Other fields']);
  assert.equal(groups[1].rows[0].value, '12');
  assert.equal(groups[2].rows.at(-1)?.value, '694');
  assert.match(groups[3].rows[1].value, /Intake jam/);
  const noShow = reportGroups('match', { no_show: true, comments: '' });
  assert.equal(noShow.some((group) => group.title === 'Scoring'), false);
  assert.match(noShow[0].rows[1].value, /scoring zeroed/);
});

test('pit report detail uses the review rows and flags unknown fields', () => {
  const groups = reportGroups('pit', { robot_weight: '120', future_field: 'x', auto_routines_drawing: '<svg/>' });
  assert.equal(groups[0].rows.find((row) => row.label === 'Robot weight')?.value, '120 lb');
  assert.equal(groups[0].rows.at(-1)?.value, 'Saved');
  assert.equal(groups[1].title, 'Other fields');
});

test('qr size adapts to the measured container', () => {
  assert.equal(qrSize(0), 265);
  assert.equal(qrSize(288), 256);
  assert.equal(qrSize(600), 320);
  assert.equal(qrSize(120), 160);
});

import { scheduleView, scoutDisplayName } from './stats';
test('schedule focus and query always offer the displayed match roster', () => {
  const teams = [1, 2, 3, 4, 5, 6, 7].map((n) => ({ id: `t${n}`, displayNumber: String(690 + n), name: `Team ${n}` }));
  const matches = [
    { id: 'm18', match_number: 18, match_type: 'qualification', tba_match_key: '2026x_qm18', red_teams: ['t1', 't2', 't3'], blue_teams: ['t4', 't5', 't6'] },
    { id: 'm19', match_number: 19, match_type: 'qualification', tba_match_key: '2026x_qm19', red_teams: ['t7', 't2', 't3'], blue_teams: ['t4', 't5', 't6'] },
  ];
  const focused = scheduleView(teams, matches, 'Qualification 18', 'm18');
  assert.deepEqual(focused.teams.map((t) => t.id), ['t1', 't2', 't3', 't4', 't5', 't6']);
  assert.equal(focused.matches.length, 1);
  const byLabel = scheduleView(teams, matches, 'Qualification 18', null);
  assert.equal(byLabel.matches.length, 1);
  assert.equal(byLabel.teams.length, 6);
  const byTeam = scheduleView(teams, matches, '697', null);
  assert.deepEqual(byTeam.teams.map((t) => t.id), ['t7']);
  assert.deepEqual(byTeam.matches.map((m) => m.id), ['m19']);
  assert.equal(scheduleView(teams, matches, '', null).teams.length, 7);
  assert.equal(scheduleView(teams, matches, 'zzz', null).teams.length, 0);
  assert.equal(scheduleView(teams, matches, 'x', 'gone').matches.length, 0);
});

test('scout display name falls back to the viewer for their own reports only', () => {
  const viewer = { userId: 'me', displayName: 'Mekot' };
  assert.equal(scoutDisplayName({ me: 'Profile Me' }, 'me', viewer), 'Profile Me');
  assert.equal(scoutDisplayName(undefined, 'me', viewer), 'Mekot');
  assert.equal(scoutDisplayName({}, 'you', viewer), 'Unknown scout');
});
