import { z } from "zod";
import { validateNativeEntry } from "@wildcard/shared/src/native-contracts";
import { canonicalJson } from "@wildcard/shared/src/relay-contract";

export class MobileError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
type Role = "admin" | "developer" | "scout" | "global_scout" | "master" | "strategist";
export type Actor = { userId: string; organizationId: string; role: Role };
// The application schema is newer than generated Database types. Keep this boundary
// injected so authorization, failures, and concurrency can be tested without secrets.
export type MobileDatabase = { auth: { getUser(token: string): Promise<any> }; from(table: string): any; rpc?: (name: string, args: Record<string, unknown>) => Promise<any> | any };
const uuid = z.string().uuid();
const timestamp = z.string().datetime({ offset: true });
const correctionSchema = z.object({ entry: z.unknown(), expectedUpdatedAt: timestamp }).strict();
const deletionSchema = z.object({ entryId: uuid, eventId: uuid, expectedUpdatedAt: timestamp }).strict();
const fail = (status: number, code: string, message: string): never => { throw new MobileError(status, code, message); };
const check = (error: unknown) => { if (error) fail(503, "database_unavailable", "The database operation could not be completed. Retry later."); };

export async function authenticate(database: MobileDatabase, authorization: string | null, requestedOrganization?: string | null): Promise<Actor> {
  const token = authorization?.match(/^Bearer ([^\s]+)$/i)?.[1];
  if (!token || token.length > 16384) return fail(401, "unauthenticated", "Sign in before using this operation.");
  const { data, error } = await database.auth.getUser(token);
  if (error || !data?.user?.id || data.user.is_anonymous) return fail(401, "unauthenticated", "Your session could not be verified.");
  const organization = requestedOrganization == null ? null : uuid.safeParse(requestedOrganization);
  if (organization && !organization.success) return fail(422, "invalid_organization", "The requested organization identifier is invalid.");
  let membershipQuery = database.from("organization_members").select("organization_id,role").eq("user_id", data.user.id);
  if (organization?.success) membershipQuery = membershipQuery.eq("organization_id", organization.data);
  const membership = await membershipQuery.limit(1).maybeSingle();
  check(membership.error);
  if (!membership.data || (organization?.success && membership.data.organization_id !== organization.data) || !["admin", "developer", "scout", "global_scout", "master", "strategist"].includes(membership.data.role)) return fail(403, "membership_required", "Organization membership is required.");
  return { userId: data.user.id, organizationId: membership.data.organization_id, role: membership.data.role };
}

export async function scopedEvent(database: MobileDatabase, actor: Actor, eventId: string) {
  uuid.parse(eventId);
  const result = await database.from("events").select("id,organization_id,event_key,tba_team_remaps,status").eq("id", eventId).eq("organization_id", actor.organizationId).maybeSingle();
  check(result.error);
  if (!result.data) return fail(404, "event_unavailable", "This event is unavailable.");
  return result.data;
}

export function canCorrect(actor: Actor, entry: { scout_user_id: string; entry_type: string }) {
  return entry.entry_type === "pit" || canDelete(actor, entry);
}
export function canDelete(actor: Actor, entry: { scout_user_id: string }) {
  return actor.userId === entry.scout_user_id || actor.role === "admin" || actor.role === "developer";
}
export function assertFixedIdentity(before: Record<string, unknown>, after: Record<string, unknown>) {
  for (const key of ["id", "organization_id", "event_id", "team_id", "match_id", "assignment_id", "scout_user_id", "entry_type", "form_version"]) {
    if ((before[key] ?? null) !== (after[key] ?? null)) fail(422, "identity_changed", "A correction cannot change the report identity or author.");
  }
  // PostgreSQL returns +00:00 while devices generate Z; preserve the instant,
  // not the incidental timestamp serialization.
  if (before.submitted_at == null ? after.submitted_at != null : Date.parse(String(before.submitted_at)) !== Date.parse(String(after.submitted_at))) fail(422, "identity_changed", "A correction cannot change the original submission time.");
  if (before.entry_type === "match") assertFixedManualMetadata(before.payload, after.payload);
}
export function assertFixedManualMetadata(beforeValue: unknown, afterValue: unknown) {
  const before = (beforeValue ?? {}) as Record<string, unknown>; const after = (afterValue ?? {}) as Record<string, unknown>;
  const normalized = (payload: Record<string, unknown>) => ({ manual: payload.manual_match ?? null, source: payload.report_source ?? (payload.manual_match ? "manual" : "scheduled") });
  if (canonicalJson(normalized(before)) !== canonicalJson(normalized(after))) fail(422, "manual_identity_changed", "Use manual report correction to change its stage, match label, alliance, or source.");
}

export function strictPayload(entry: ReturnType<typeof validateNativeEntry>) {
  if ((entry.entry_type === "match" && entry.form_version !== 4) || (entry.entry_type !== "match" && entry.form_version !== 2)) fail(422, "unsupported_form", "This report version cannot be corrected by this app.");
  const payload = entry.payload;
  if ("shifts" in payload || "climb" in payload) fail(422, "invalid_payload", "Unsupported scouting fields.");
  if (entry.entry_type !== "match") {
    for (const value of Object.values(payload)) if (typeof value !== "string" || value.length > 200000) fail(422, "invalid_payload", "Manual scouting values must be bounded text.");
    if (entry.entry_type === "pre_scout" && payload.average_pieces !== undefined && payload.average_pieces !== "" && !/^[0-9]{1,3}$/.test(String(payload.average_pieces))) fail(422, "invalid_payload", "Average pieces must contain at most three digits.");
  } else {
    const spots = ["depot", "depot-bump", "hub", "outpost-bump", "outpost", "depot-trench", "outpost-trench", "line-1", "line-2"];
    if (payload.starting_spot != null && !spots.includes(String(payload.starting_spot))) fail(422, "invalid_payload", "Invalid starting position.");
    for (const issue of payload.breakage_issues as { timestamp: string | null }[]) if (issue.timestamp && !/^\d:[0-5]\d$/.test(issue.timestamp)) fail(422, "invalid_payload", "Breakage time must use M:SS.");
    const auto = payload.auto as { shoot: number; ferry: number }; const teleop = payload.teleop as { shoot: number; ferry: number };
    if (payload.auto_fuel !== auto.shoot + auto.ferry || payload.teleop_fuel !== teleop.shoot + teleop.ferry) fail(422, "invalid_payload", "Fuel totals do not match the scoring counters.");
  }
}

export async function correctReport(database: MobileDatabase, actor: Actor, input: unknown) {
  const parsed = correctionSchema.parse(input);
  const entry = validateNativeEntry(parsed.entry);
  strictPayload(entry);
  if (entry.organization_id !== actor.organizationId) return fail(404, "report_unavailable", "This report is unavailable.");
  await scopedEvent(database, actor, entry.event_id);
  const result = await database.from("scouting_entries").select("*").eq("id", entry.id).eq("organization_id", actor.organizationId).maybeSingle();
  check(result.error); const before = result.data;
  if (!before) return fail(404, "report_unavailable", "This report is unavailable.");
  if (!canCorrect(actor, before)) return fail(403, "forbidden", "You can only correct your own reports.");
  assertFixedIdentity(before, entry);
  if (before.status !== "submitted" || entry.status !== "submitted" || !entry.submitted_at) return fail(422, "submitted_required", "Use direct draft sync for an unsubmitted report.");
  if (before.updated_at !== parsed.expectedUpdatedAt) return fail(409, "conflict", "This report changed on another device. Refresh before correcting it.");
  const team = await database.from("event_teams").select("team_id").eq("event_id", entry.event_id).eq("team_id", entry.team_id).maybeSingle();
  check(team.error); if (!team.data) return fail(422, "invalid_team", "The report team is not in this event.");
  // Only mutable fields are written. The updated_at comparison is applied by
  // PostgreSQL in the same statement, not merely checked in application code.
  const update = await database.from("scouting_entries").update({ payload: entry.payload, last_edited_by: actor.userId }).eq("id", entry.id).eq("organization_id", actor.organizationId).eq("updated_at", parsed.expectedUpdatedAt).select("*").maybeSingle();
  check(update.error);
  if (!update.data) return fail(409, "conflict", "This report changed during the correction. Refresh and retry.");
  return { entry: update.data };
}

export async function deleteReport(database: MobileDatabase, actor: Actor, input: unknown) {
  const parsed = deletionSchema.parse(input);
  await scopedEvent(database, actor, parsed.eventId);
  const result = await database.from("scouting_entries").select("*").eq("id", parsed.entryId).eq("organization_id", actor.organizationId).eq("event_id", parsed.eventId).maybeSingle();
  check(result.error); const entry = result.data;
  if (!entry) return { deleted: true, alreadyDeleted: true };
  if (!canDelete(actor, entry)) return fail(403, "forbidden", "You can only delete your own reports.");
  if (entry.updated_at !== parsed.expectedUpdatedAt) return fail(409, "conflict", "This report changed. Refresh before deleting it.");
  if (!database.rpc) return fail(503, "deletion_unavailable", "Transactional report deletion requires the mobile database migration.");
  const deleted = await database.rpc("mobile_delete_report", { target_entry_id: entry.id, target_organization_id: actor.organizationId, target_event_id: parsed.eventId, caller_user_id: actor.userId, expected_updated_at: parsed.expectedUpdatedAt });
  if (deleted.error || !deleted.data) return fail(503, "deletion_unavailable", "Transactional report deletion is unavailable. Your report was not confirmed deleted.");
  if (deleted.data.code === "conflict") return fail(409, "conflict", "This report changed during deletion. Refresh and retry.");
  if (deleted.data.code === "forbidden") return fail(403, "forbidden", "Your permission to delete this report changed.");
  return deleted.data as { deleted: boolean; alreadyDeleted?: boolean; assignmentReopened?: boolean };
}
