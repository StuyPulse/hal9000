import test from "node:test";
import assert from "node:assert/strict";
import { mergeTeamRemaps } from "./tba-import";

test("a TBA re-import keeps admin aliases and lets them win over TBA remaps", () => {
  const existing = { frc694: "frc694B", frc9999: "frc254C", frc1678: "frc1678A" };
  const official = { frc694: "frc694C", frc9998: "frc118B", frc1678: "frc1678A" };
  assert.deepEqual(mergeTeamRemaps(official, existing), { frc9998: "frc118B", frc694: "frc694B", frc9999: "frc254C", frc1678: "frc1678A" });
});

test("TBA remaps are adopted when nothing is stored, and an empty TBA response removes nothing", () => {
  assert.deepEqual(mergeTeamRemaps({ frc9998: "frc118B" }, null), { frc9998: "frc118B" });
  assert.deepEqual(mergeTeamRemaps(undefined, { frc694: "frc694B" }), { frc694: "frc694B" });
});

test("a TBA label already used by an admin alias is dropped so one label never maps to two teams", () => {
  assert.deepEqual(mergeTeamRemaps({ frc9694: "frc694B" }, { frc694: "frc694B" }), { frc694: "frc694B" });
});

test("malformed stored entries are ignored and malformed TBA payloads are rejected", () => {
  assert.deepEqual(mergeTeamRemaps({}, { frc694: "frc694B", bad: "frc1", frc2: 7, frc3: "team3" }), { frc694: "frc694B" });
  assert.deepEqual(mergeTeamRemaps({}, ["frc1"]), {});
  assert.throws(() => mergeTeamRemaps({ bad: "frc1" }, {}));
});
