import assert from "node:assert/strict";
import test from "node:test";
import { timelineFerryValues } from "./timeline-ferry";

test("averages ferry observations separately from scored fuel", () => {
  assert.deepEqual(timelineFerryValues([
    { auto: { shoot: 100, ferry: 2 }, teleop: { shoot: 200, ferry: 10 } },
    { auto: { shoot: 300, ferry: 6 }, teleop: { shoot: 400, ferry: 20 } },
  ]), { autoFerried: 4, teleopFerried: 15, ferried: 19 });
});

test("a selected report uses only its own ferry values", () => {
  assert.deepEqual(timelineFerryValues([{ auto: { ferry: 6 }, teleop: { ferry: 20 } }]), { autoFerried: 6, teleopFerried: 20, ferried: 26 });
});

test("keeps gaps for unscouted matches and handles legacy or malformed values", () => {
  assert.deepEqual(timelineFerryValues([]), { autoFerried: null, teleopFerried: null, ferried: null });
  assert.deepEqual(timelineFerryValues([{ auto_fuel: 100, teleop_fuel: 200 }]), { autoFerried: 0, teleopFerried: 0, ferried: 0 });
  assert.deepEqual(timelineFerryValues([{ auto: { ferry: "3" }, teleop: { ferry: "invalid" } }]), { autoFerried: 3, teleopFerried: 0, ferried: 3 });
});
