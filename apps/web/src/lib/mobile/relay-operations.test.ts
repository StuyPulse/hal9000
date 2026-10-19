import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { canonicalJson } from "@wildcard/shared/src/relay-contract";
import { relayReport, sameSignedReport, validSignature } from "./relay-operations";
import { registerDevice } from "./device-operations";
import { requireManager } from "./admin-operations";
import { MobileError, type Actor, type MobileDatabase } from "./operations";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const actor: Actor = { userId: id(1), organizationId: id(2), role: "master" };
const time = "2026-10-13T00:00:00.000Z";
const entry = { id: id(3), organization_id: id(2), event_id: id(4), team_id: id(5), match_id: null, assignment_id: null, scout_user_id: id(6), entry_type: "pit", form_version: 2, payload: { comments: "signed author" }, status: "submitted", submitted_at: time, updated_at: time };
const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const publicBase64 = (publicKey.export({ format: "der", type: "spki" }) as Buffer).subarray(-32).toString("base64");
const envelope = { version: 1, deviceId: id(7), entry, createdAt: time };
const signature = sign(null, Buffer.from(canonicalJson(envelope)), privateKey).toString("base64");
const device = { id: id(7), user_id: entry.scout_user_id, organization_id: actor.organizationId, public_key: publicBase64, revoked_at: null };
function fake(results: Record<string, { data: any; error?: unknown }[]>): MobileDatabase {
  return { auth: { getUser: async () => ({ data: null }) }, from(table) {
    const execute = () => Promise.resolve(results[table]?.shift() ?? { data: null });
    const query: any = { select: () => query, eq: () => query, insert: () => query, maybeSingle: execute, then: (resolve: any, reject: any) => execute().then(resolve, reject) }; return query;
  } };
}
const ready = () => ({ mobile_device_keys: [{ data: device }], organization_members: [{ data: { role: "scout" } }], events: [{ data: { id: entry.event_id, organization_id: actor.organizationId, status: "active" } }], event_teams: [{ data: { team_id: entry.team_id } }] });
const status = (code: number) => (error: unknown) => error instanceof MobileError && error.status === code;

test("real Ed25519 signature verifies across canonical object ordering", () => {
  assert.equal(validSignature(publicBase64, envelope, signature), true);
  assert.equal(validSignature(publicBase64, { createdAt: time, entry, deviceId: id(7), version: 1 }, signature), true);
  assert.equal(validSignature(publicBase64, { ...envelope, entry: { ...entry, payload: { comments: "tampered" } } }, signature), false);
  assert.equal(validSignature(publicBase64, envelope, Buffer.alloc(64).toString("base64")), false);
});
test("master permission, device author binding and revocation are mandatory", async () => {
  await assert.rejects(relayReport(fake({}), { ...actor, role: "scout" }, { envelope, signature }), status(403));
  await assert.rejects(relayReport(fake({ mobile_device_keys: [{ data: null }] }), actor, { envelope, signature }), status(403));
  await assert.rejects(relayReport(fake({ mobile_device_keys: [{ data: { ...device, revoked_at: time } }] }), actor, { envelope, signature }), status(403));
  await assert.rejects(relayReport(fake({ mobile_device_keys: [{ data: device }], organization_members: [{ data: null }] }), actor, { envelope, signature }), status(403));
});
test("missing device migration fails explicitly, never falls back to blind insert", async () => {
  await assert.rejects(relayReport(fake({ mobile_device_keys: [{ data: null, error: { code: "42P01" } }] }), actor, { envelope, signature }), status(503));
});
test("same report acknowledges; divergent content never overwrites", async () => {
  const same = await relayReport(fake({ ...ready(), scouting_entries: [{ data: entry }] }), actor, { envelope, signature });
  assert.equal(same.alreadyReceived, true);
  await assert.rejects(relayReport(fake({ ...ready(), scouting_entries: [{ data: { ...entry, payload: { comments: "different" } } }] }), actor, { envelope, signature }), status(409));
});
test("signed abusive text is retained for correction, not inserted; existing identical receipt still acknowledges", async () => {
  const unsafe={...entry,payload:{comments:'shit'}};
  const env={...envelope,entry:unsafe};
  const proof={envelope:env,signature:sign(null,Buffer.from(canonicalJson(env)),privateKey).toString('base64')};
  await assert.rejects(relayReport(fake({...ready(),scouting_entries:[{data:null}]}),actor,proof), error=>error instanceof MobileError && error.status===422 && error.code==='content_filtered');
  assert.equal((await relayReport(fake({...ready(),scouting_entries:[{data:unsafe}]}),actor,proof)).alreadyReceived,true);
});
test("concurrent direct insert is acknowledged only when signed data agrees", async () => {
  const result = await relayReport(fake({ ...ready(), scouting_entries: [{ data: null }, { data: null, error: { code: "23505" } }, { data: entry }] }), actor, { envelope, signature });
  assert.equal(result.alreadyReceived, true);
});
test("server manual linking tolerated but unrelated identity changes rejected", () => {
  const manual = { ...entry, payload: { manual_match: { stage: "Qualification", label: "1" } } };
  assert.equal(sameSignedReport({ ...manual, match_id: id(8) }, manual), true);
  assert.equal(sameSignedReport({ ...manual, scout_user_id: id(9) }, manual), false);
});
test("device IDs cannot be replaced, reclaimed, or silently unrevoked", async () => {
  await assert.rejects(registerDevice(fake({ mobile_device_keys: [{ data: { ...device, revoked_at: time } }] }), { ...actor, userId: entry.scout_user_id }, { deviceId: id(7), publicKey: publicBase64, name: "Phone" }), status(409));
  await assert.rejects(registerDevice(fake({ mobile_device_keys: [{ data: device }] }), actor, { deviceId: id(7), publicKey: publicBase64, name: "Phone" }), status(409));
});
test("admin operations reject nonmanagers", () => {
  for (const role of ["scout", "global_scout", "master", "strategist"] as const) assert.throws(() => requireManager({ ...actor, role }), status(403));
  requireManager({ ...actor, role: "admin" }); requireManager({ ...actor, role: "developer" });
});
test("strategist pre-scout relay outside active event requires assignment", async () => {
  const pre = { ...entry, entry_type: "pre_scout", payload: { average_pieces: "12" } };
  const env = { ...envelope, entry: pre }; const proof = { envelope: env, signature: sign(null, Buffer.from(canonicalJson(env)), privateKey).toString("base64") };
  const results = { ...ready(), organization_members: [{ data: { role: "strategist" } }], events: [{ data: { id: entry.event_id, status: "upcoming", event_key: "2026cc" } }, { data: { id: entry.event_id, status: "upcoming", event_key: "2026cc" } }], prescout_assignments: [{ data: null }] };
  await assert.rejects(relayReport(fake(results), actor, proof), status(403));
});
test("active-event unassigned pre-scout relay follows current live policy", async () => {
  const pre = { ...entry, entry_type: "pre_scout", payload: { average_pieces: "12" } };
  const env = { ...envelope, entry: pre }; const proof = { envelope: env, signature: sign(null, Buffer.from(canonicalJson(env)), privateKey).toString("base64") };
  const results = { ...ready(), events: [{ data: { id: entry.event_id, status: "active" } }, { data: { id: entry.event_id, status: "active" } }], scouting_entries: [{ data: pre }] };
  assert.equal((await relayReport(fake(results), actor, proof)).alreadyReceived, true);
});
