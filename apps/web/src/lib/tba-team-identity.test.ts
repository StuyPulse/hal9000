import assert from "node:assert/strict";
import { test } from "node:test";
import { eventTeamNumber, eventTeamNumberFromInput, resolveTeamLineup, teamMatchesQuery, teamNumberLabel, tbaTeamKey, tbaTeamNumberResolver } from "./tba-team-identity";
import { fetchTbaRankings, normalizeTbaTeamStats, officialClimb } from "./tba-event-stats";

const remaps = { frc9997: "frc271B", frc9998: "frc1601B", frc9993: "frc333B" };
const teams = [
  { id: "parent", number: 1601, name: "Quantum Samurai", displayNumber: "1601" },
  { id: "second", number: 9998, name: "Off-Season Demo Team 2", displayNumber: "1601B" },
];

test("event labels leave permanent numbers, UUIDs, and other events intact", () => {
  for (const [original, alias] of Object.entries(remaps)) {
    const number = Number(original.slice(3));
    assert.equal(tbaTeamKey(number, remaps), alias);
    assert.equal(eventTeamNumber(number, remaps), alias.slice(3));
    assert.equal(tbaTeamNumberResolver(remaps)(alias), number);
    assert.equal(eventTeamNumber(number), String(number));
  }
  assert.equal(eventTeamNumber(1601, remaps), "1601");
  assert.equal(teamNumberLabel(teams[1]), "1601B");
  assert.equal(teams[1].id, "second");
  assert.equal(teams[1].number, 9998);
});

test("old numeric URLs and case-insensitive alias URLs select the same B robot", () => {
  for (const input of ["9998", "1601B", "1601b", " 1601B "]) assert.equal(eventTeamNumberFromInput(input, remaps), 9998);
  assert.equal(eventTeamNumberFromInput("1601", remaps), 1601);
  for (const input of ["1601B", "1601B!", "1.2", "0", "-1", "NaN", "99999999999999999999"]) assert.throws(() => eventTeamNumberFromInput(input));
});

test("team search finds aliases and legacy numbers without selecting the parent for a B query", () => {
  assert.deepEqual(teams.filter((team) => teamMatchesQuery(team, "1601b")).map((team) => team.id), ["second"]);
  assert.deepEqual(teams.filter((team) => teamMatchesQuery(team, "9998")).map((team) => team.id), ["second"]);
  assert.equal(teamMatchesQuery(teams[0], "quantum"), true);
});

test("manual strategy lineups accept parent and B together and reject duplicate aliases of one robot", () => {
  assert.deepEqual(resolveTeamLineup(["1601", "1601b"], teams).map((team) => team.id), ["parent", "second"]);
  assert.deepEqual(resolveTeamLineup(["1601", "9998"], teams).map((team) => team.id), ["parent", "second"]);
  assert.throws(() => resolveTeamLineup(["1601B", "9998"], teams), /different/);
  assert.throws(() => resolveTeamLineup(["333B"], teams), /not in this event/);
});

test("numeric rankings and alias OPRs join to the same saved team, independently of the parent", () => {
  const result = normalizeTbaTeamStats([
    { team_key: "frc1601", rank: 2 }, { team_key: "frc9998", rank: 8 },
    { team_key: "frc271B", rank: 12 }, { team_key: "frc333B", rank: 15 },
  ], { frc1601: 120, frc1601B: 45, frc271B: 0, frc333B: 10 }, remaps);
  assert.deepEqual(result.rankings.map((ranking) => [ranking.team_key, ranking.rank]), [["frc1601", 2], ["frc9998", 8], ["frc9997", 12], ["frc9993", 15]]);
  assert.deepEqual(result.oprs, { frc1601: 120, frc9998: 45, frc9997: 0, frc9993: 10 });
  assert.throws(() => normalizeTbaTeamStats([], { frc444B: 10 }, remaps), /no numeric event mapping/);
});

test("official climb metrics remain attached to the robot UUID and alliance slot", () => {
  const matches = [{ red_teams: ["parent", "second"], blue_teams: [], tba_score_breakdown: { red: { autoTowerRobot1: "None", autoTowerRobot2: "Level1", endGameTowerRobot1: "Level3", endGameTowerRobot2: "None" } } }];
  assert.equal(officialClimb(matches, "parent").endgameClimb, "Level3");
  assert.equal(officialClimb(matches, "second").autoClimb, "Level1");
  assert.equal(officialClimb(matches, "second").endgameClimbRate, 0);
});

test("rankings fetch normalizes mixed keys and retains available OPRs when rankings are unpublished", async () => {
  const previousFetch = globalThis.fetch;
  const previousKey = process.env.TBA_AUTH_KEY;
  process.env.TBA_AUTH_KEY = "test-key";
  try {
    globalThis.fetch = async (url) => new Response(JSON.stringify(String(url).endsWith("/oprs") ? { oprs: { frc1601B: 45, frc1601: 120 } } : { rankings: [{ team_key: "frc9998", rank: 8 }], sort_order_info: [] }), { status: 200 });
    const result = await fetchTbaRankings("2026example", remaps);
    assert.equal(result.rankings[0].team_key, "frc9998");
    assert.equal(result.oprs.frc9998, 45);
    assert.equal(result.oprs.frc1601, 120);
    assert.equal(result.apiError, "");
    globalThis.fetch = async (url) => new Response(JSON.stringify(String(url).endsWith("/oprs") ? { oprs: { frc1601B: 0 } } : null), { status: 200 });
    const unpublished = await fetchTbaRankings("2026example", remaps);
    assert.deepEqual(unpublished.rankings, []);
    assert.equal(unpublished.oprs.frc9998, 0);
    assert.equal(unpublished.apiError, "");
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.TBA_AUTH_KEY;
    else process.env.TBA_AUTH_KEY = previousKey;
  }
});
