import test from "node:test";
import assert from "node:assert/strict";
import { authenticate, assertFixedIdentity, canCorrect, canDelete, correctReport, deleteReport, type Actor, type MobileDatabase, MobileError } from "./operations";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const actor: Actor = { userId: id(1), organizationId: id(2), role: "scout" };
const time = "2026-10-13T00:00:00.000Z";
const entry = { id: id(3), organization_id: id(2), event_id: id(4), team_id: id(5), match_id: null, assignment_id: null, scout_user_id: id(1), entry_type: "pre_scout", form_version: 2, payload: { average_pieces: "12" }, status: "submitted", submitted_at: time, updated_at: time };
type Result = { data: any; error?: unknown };
function fake(results: Record<string, Result[]>, user: any = { id: actor.userId }): MobileDatabase & { writes: { table: string; action: string; value?: unknown; filters: [string, unknown][] }[] } {
  const writes: { table: string; action: string; value?: unknown; filters: [string, unknown][] }[] = [];
  return { writes, auth: { getUser: async () => ({ data: { user } }) }, rpc: async (name: string, args: Record<string, unknown>) => { writes.push({ table: name, action: "rpc", value: args, filters: [] }); return results[name]?.shift() ?? { data: null }; }, from(table: string) {
    let action = "read"; let value: unknown; const filters: [string, unknown][] = [];
    const execute = () => { if (action !== "read") writes.push({ table, action, value, filters }); return Promise.resolve(results[table]?.shift() ?? { data: null }); };
    const query: any = { select: () => query, eq: (key: string, expected: unknown) => { filters.push([key, expected]); return query; }, limit: () => query,
      update: (patch: unknown) => { action = "update"; value = patch; return query; }, delete: () => { action = "delete"; return query; }, maybeSingle: execute,
      then: (resolve: any, reject: any) => execute().then(resolve, reject),
    }; return query;
  } };
}
const eventResult = { data: { id: entry.event_id, organization_id: actor.organizationId, status: "active" } };
const expectStatus = (status: number) => (error: unknown) => error instanceof MobileError && error.status === status;

test("rejects absent and anonymous bearer identity", async () => {
  await assert.rejects(authenticate(fake({}), null), expectStatus(401));
  await assert.rejects(authenticate(fake({}, { id: id(1), is_anonymous: true }), "Bearer valid"), expectStatus(401));
});
test("uses database role, not auth user metadata", async () => {
  const result = await authenticate(fake({ organization_members: [{ data: { organization_id: id(2), role: "scout" } }] }, { id: id(1), user_metadata: { role: "admin" } }), "Bearer valid");
  assert.equal(result.role, "scout");
});
test("missing membership fails closed", async () => {
  await assert.rejects(authenticate(fake({}), "Bearer valid"), expectStatus(403));
});
test("organization header is UUID-validated and never grants nonmember access", async () => {
  await assert.rejects(authenticate(fake({}), "Bearer valid", "not-an-org"), expectStatus(422));
  await assert.rejects(authenticate(fake({}), "Bearer valid", id(9)), expectStatus(403));
  await assert.rejects(authenticate(fake({ organization_members: [{ data: { organization_id: id(2), role: "admin" } }] }), "Bearer valid", id(9)), expectStatus(403));
});
test("organization header selects a verified DB membership and ignores metadata roles", async () => {
  const result = await authenticate(fake({ organization_members: [{ data: { organization_id: id(9), role: "strategist" } }] }, { id: actor.userId, user_metadata: { role: "admin" } }), "Bearer valid", id(9));
  assert.deepEqual(result, { userId: actor.userId, organizationId: id(9), role: "strategist" });
});
test("pit corrections permit members, deletion still owner or admin", () => {
  const foreign = { scout_user_id: id(6), entry_type: "pit" };
  assert.equal(canCorrect(actor, foreign), true); assert.equal(canDelete(actor, foreign), false);
  assert.equal(canCorrect({ ...actor, role: "global_scout" }, { ...foreign, entry_type: "match" }), false);
});
test("report corrections reject filtered text without writing or changing the source", async () => {
  const unsafe = {...entry, payload:{average_pieces:'12',notes:'shit'}};
  const db = fake({events:[eventResult], scouting_entries:[{data:entry}],event_teams:[{data:{team_id:entry.team_id}}]});
  await assert.rejects(correctReport(db,actor,{entry:unsafe,expectedUpdatedAt:time}), error=>error instanceof MobileError && error.status===422 && error.code==='content_filtered');
  assert.equal(db.writes.length,0);
  assert.equal(unsafe.payload.notes,'shit');
});
test("cross-org correction rejected before any DB operation", async () => {
  const db = fake({});
  await assert.rejects(correctReport(db, actor, { entry: { ...entry, organization_id: id(9) }, expectedUpdatedAt: time }), expectStatus(404));
  assert.equal(db.writes.length, 0);
});
test("cannot correct another author or rewrite permanent identity", async () => {
  const db = fake({ events: [eventResult], scouting_entries: [{ data: { ...entry, scout_user_id: id(6) } }] });
  await assert.rejects(correctReport(db, actor, { entry, expectedUpdatedAt: time }), expectStatus(403));
  const adminDb = fake({ events: [eventResult], scouting_entries: [{ data: entry }] });
  await assert.rejects(correctReport(adminDb, { ...actor, role: "admin" }, { entry: { ...entry, team_id: id(7) }, expectedUpdatedAt: time }), expectStatus(422));
});
test("stale correction and atomic update race return conflict", async () => {
  const stale = fake({ events: [eventResult], scouting_entries: [{ data: { ...entry, updated_at: "later" } }] });
  await assert.rejects(correctReport(stale, actor, { entry, expectedUpdatedAt: time }), expectStatus(409));
  const race = fake({ events: [eventResult], scouting_entries: [{ data: entry }, { data: null }], event_teams: [{ data: { team_id: entry.team_id } }] });
  await assert.rejects(correctReport(race, actor, { entry, expectedUpdatedAt: time }), expectStatus(409));
  assert.ok(race.writes[0].filters.some(([key, value]) => key === "updated_at" && value === time));
});
test("successful correction writes only payload and editor", async () => {
  const db = fake({ events: [eventResult], scouting_entries: [{ data: entry }, { data: { ...entry, updated_at: "new" } }], event_teams: [{ data: { team_id: entry.team_id } }] });
  await correctReport(db, actor, { entry, expectedUpdatedAt: time });
  assert.deepEqual(db.writes[0].value, { payload: entry.payload, last_edited_by: actor.userId });
});
test("timestamp serialization does not change submission identity", () => {
  assertFixedIdentity({ ...entry, submitted_at: "2026-10-13T00:00:00+00:00" }, entry);
  assert.throws(() => assertFixedIdentity(entry, { ...entry, submitted_at: "2026-10-13T00:00:01.000Z" }), expectStatus(422));
});
test("deletion absent is idempotent; stale or foreign author blocked", async () => {
  assert.deepEqual(await deleteReport(fake({ events: [eventResult] }), actor, { entryId: entry.id, eventId: entry.event_id, expectedUpdatedAt: time }), { deleted: true, alreadyDeleted: true });
  await assert.rejects(deleteReport(fake({ events: [eventResult], scouting_entries: [{ data: { ...entry, scout_user_id: id(6) } }] }), actor, { entryId: entry.id, eventId: entry.event_id, expectedUpdatedAt: time }), expectStatus(403));
  await assert.rejects(deleteReport(fake({ events: [eventResult], scouting_entries: [{ data: { ...entry, updated_at: "later" } }] }), actor, { entryId: entry.id, eventId: entry.event_id, expectedUpdatedAt: time }), expectStatus(409));
});
test("picker deletion with no assignment ID uses atomic scoped reopen RPC", async () => {
  const scheduled = { ...entry, entry_type: "match", assignment_id: null, match_id: id(9) };
  const db = fake({ events: [eventResult], scouting_entries: [{ data: scheduled }], mobile_delete_report: [{ data: { deleted: true, assignmentReopened: true } }] });
  const result = await deleteReport(db, actor, { entryId: entry.id, eventId: entry.event_id, expectedUpdatedAt: time });
  assert.equal(result.assignmentReopened, true);
  assert.equal(db.writes.length, 1);
  assert.deepEqual(db.writes[0].value, { target_entry_id: entry.id, target_organization_id: actor.organizationId, target_event_id: entry.event_id, caller_user_id: actor.userId, expected_updated_at: time });
});
test("deletion with remaining submitted reports does not claim reopening", async () => {
  const db = fake({ events: [eventResult], scouting_entries: [{ data: entry }], mobile_delete_report: [{ data: { deleted: true, assignmentReopened: false } }] });
  assert.equal((await deleteReport(db, actor, { entryId: entry.id, eventId: entry.event_id, expectedUpdatedAt: time })).assignmentReopened, false);
});
test("atomic deletion conflict and missing migration never fall back to direct delete", async () => {
  for (const rpc of [{ data: { code: "conflict" } }, { data: null, error: { code: "PGRST202" } }]) {
    const db = fake({ events: [eventResult], scouting_entries: [{ data: entry }], mobile_delete_report: [rpc] });
    await assert.rejects(deleteReport(db, actor, { entryId: entry.id, eventId: entry.event_id, expectedUpdatedAt: time }), expectStatus(rpc.error ? 503 : 409));
    assert.equal(db.writes.length, 1); assert.equal(db.writes[0].action, "rpc");
  }
});
