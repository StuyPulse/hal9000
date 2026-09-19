import assert from "node:assert/strict";
import test from "node:test";
import { averageReportsByMatch, calculateScoutStats } from "./scouting-stats";

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
