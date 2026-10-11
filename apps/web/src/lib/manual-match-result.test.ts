import assert from "node:assert/strict";
import test from "node:test";
import { manualMatchResultSchema } from "./manual-match-result";

const match = { eventId: "00000000-0000-4000-8000-000000000001", matchId: "00000000-0000-4000-8000-000000000002" };
test("accepts whole nonnegative scores, including a zero-zero tie", () => {
  assert.deepEqual(manualMatchResultSchema.parse({ ...match, redScore: "0", blueScore: "0" }), { ...match, redScore: 0, blueScore: 0 });
  assert.equal(manualMatchResultSchema.parse({ ...match, redScore: " 123 ", blueScore: "45" }).redScore, 123);
});
test("requires both scores and rejects invalid or oversized values", () => {
  for (const redScore of ["", " ", null, undefined, "-1", "1.5", "NaN", "Infinity", "2147483648"]) {
    assert.equal(manualMatchResultSchema.safeParse({ ...match, redScore, blueScore: "0" }).success, false);
  }
  assert.equal(manualMatchResultSchema.safeParse({ ...match, redScore: "0", blueScore: "" }).success, false);
  assert.equal(manualMatchResultSchema.safeParse({ ...match, matchId: "invalid", redScore: "0", blueScore: "0" }).success, false);
});
