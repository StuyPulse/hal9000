import assert from "node:assert/strict";
import test from "node:test";
import { matchTeamsChanged } from "./manual-match-safety";

test("reordering teams within an alliance preserves identity", () => {
  assert.equal(matchTeamsChanged({ red_teams: ["a", "b"], blue_teams: ["c"] }, ["b", "a"], ["c"]), false);
});

test("replacing a team or changing its alliance changes identity", () => {
  const match = { red_teams: ["a", "b"], blue_teams: ["c"] };
  assert.equal(matchTeamsChanged(match, ["a", "d"], ["c"]), true);
  assert.equal(matchTeamsChanged(match, ["a", "c"], ["b"]), true);
});
