import assert from "node:assert/strict";
import test from "node:test";
import { averageReportsByMatch, calculateScoutStats, isCompetitiveMatchEntry, selectedMatchReportEntries } from "./scouting-stats";

const report = (id: string, matchId: string, autoScored: number, fouls: number, broken = false) => ({
  id,
  match_id: matchId,
  payload: {
    auto: { shoot: autoScored, ferry: 0 },
    teleop: { shoot: 0, ferry: 0 },
    fouls,
    robot_broke: broken,
  },
});

test("scored fuel excludes ferrying and preserves explicit zeros over legacy values", () => {
  const stats = calculateScoutStats([{ payload: { auto: { shoot: 10, ferry: 30 }, teleop: { shoot: 20, ferry: 40 } } }]);
  assert.equal(stats.totalFuel, 30);
  assert.equal(stats.autoAvgFerried, 30);
  assert.equal(stats.teleopAvgFerried, 40);
  const zero = calculateScoutStats([{ payload: { auto: { shoot: 0 }, teleop: { shoot: 0 }, auto_fuel: 99, teleop_fuel: 99 } }]);
  assert.equal(zero.totalFuel, 0);
  const legacy = calculateScoutStats([{ payload: { auto_fuel: 8, teleop_fuel: 12 } }]);
  assert.equal(legacy.autoAvgScored, 8);
  assert.equal(legacy.totalFuel, 20);
});

test("scheduled and manual competitive reports count but practice reports do not", () => {
  for (const stage of ["qualification", "playoff"]) {
    assert.equal(isCompetitiveMatchEntry({ matches: { match_type: stage } }), true);
    assert.equal(isCompetitiveMatchEntry({ payload: { manual_match: { stage, label: "3" } } }), true);
  }
  assert.equal(isCompetitiveMatchEntry({ matches: { match_type: "practice" } }), false);
  assert.equal(isCompetitiveMatchEntry({ payload: { manual_match: { stage: "practice", label: "3" } } }), false);
});

test("averages reports within a match before averaging a team's matches", () => {
  const entries = [
    report("q2-a", "match-2", 10, 2),
    report("q2-b", "match-2", 14, 2),
    ...Array.from({ length: 8 }, (_, index) => report(`q5-${index}`, "match-5", 30, 10, index === 0)),
  ];

  const matches = averageReportsByMatch(entries);
  const stats = calculateScoutStats(entries);

  assert.equal(matches.length, 2);
  assert.equal(stats.entries, 10);
  assert.equal(stats.matches, 2);
  // Match 2 averages 12 and Match 5 averages 30, so both matches count once: (12 + 30) / 2 = 21.
  assert.equal(stats.autoAvgScored, 21);
  assert.equal(stats.avgFouls, 6);
  assert.equal(stats.brokenPercent, 50);
});

test("uses manual match stage and label when a scheduled match ID is unavailable", () => {
  const entries = [
    { id: "manual-a", payload: { manual_match: { stage: "Qualification", label: "18" }, auto: { shoot: 10 } } },
    { id: "manual-b", payload: { manual_match: { stage: "qualification", label: "18" }, auto: { shoot: 14 } } },
    { id: "manual-c", payload: { manual_match: { stage: "qualification", label: "19" }, auto: { shoot: 30 } } },
  ];

  const stats = calculateScoutStats(entries);

  assert.equal(stats.matches, 2);
  assert.equal(stats.autoAvgScored, 21);
});

test("uses the selected report for one match while keeping other matches combined", () => {
  const entries = [
    { ...report("q2-a", "match-2", 10, 0), team_id: "team-a" },
    { ...report("q2-b", "match-2", 20, 0), team_id: "team-a" },
    { ...report("q5-a", "match-5", 30, 0), team_id: "team-a" },
    { ...report("q5-b", "match-5", 50, 0), team_id: "team-a" },
  ];

  const selected = selectedMatchReportEntries(entries, [{ team_id: "team-a", match_key: "scheduled:match-2", selected_entry_id: "q2-b" }]);
  const stats = calculateScoutStats(selected);

  assert.equal(stats.matches, 2);
  assert.equal(stats.autoAvgScored, 30);
});
