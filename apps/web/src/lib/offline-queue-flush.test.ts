import test from "node:test";
import assert from "node:assert/strict";
import { flushQueue } from "./offline-queue-flush";

test("uploads everything and removes it", async () => {
  const removed: number[] = [];
  const result = await flushQueue([1, 2, 3], async () => ({ error: null, transient: false }), async (n) => { removed.push(n); });
  assert.deepEqual(removed, [1, 2, 3]);
  assert.equal(result.synced, 3); assert.equal(result.pending, 0);
});
test("a dead connection stops at once and loses nothing", async () => {
  const tried: number[] = [], removed: number[] = [];
  const result = await flushQueue([1, 2, 3, 4], async (n) => { tried.push(n); return n === 2 ? { error: "timed out", transient: true } : { error: null, transient: false }; }, async (n) => { removed.push(n); });
  assert.deepEqual(tried, [1, 2]); assert.deepEqual(removed, [1]);
  assert.equal(result.pending, 3); assert.equal(result.firstFailure?.transient, true);
});
test("a refused report stays queued and does not block the others", async () => {
  const removed: number[] = [];
  const result = await flushQueue([1, 2, 3], async (n) => n === 1 ? { error: "rejected", transient: false } : { error: null, transient: false }, async (n) => { removed.push(n); });
  assert.deepEqual(removed, [2, 3]);
  assert.equal(result.failed, 1); assert.equal(result.pending, 1); assert.deepEqual(result.items, [1]);
});
