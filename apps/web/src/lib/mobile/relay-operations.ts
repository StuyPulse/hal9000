import { createPublicKey, verify } from "node:crypto";
import { z } from "zod";
import { validateNativeEntry } from "@wildcard/shared/src/native-contracts";
import { canonicalJson } from "@wildcard/shared/src/relay-contract";
import { MobileError, scopedEvent, strictPayload, type Actor, type MobileDatabase } from "./operations";

const proofSchema = z.object({ envelope: z.object({ version: z.literal(1), deviceId: z.string().uuid(), entry: z.unknown(), createdAt: z.string().datetime({ offset: true }) }).strict(), signature: z.string().regex(/^[A-Za-z0-9+/]{86}==$/) }).strict();
export function validSignature(publicKey: string, envelope: unknown, signature: string) {
  try {
    const keyBytes = Buffer.from(publicKey, "base64");
    if (keyBytes.length !== 32 || keyBytes.toString("base64") !== publicKey) return false;
    const key = createPublicKey({ key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), keyBytes]), format: "der", type: "spki" });
    return verify(null, Buffer.from(canonicalJson(envelope), "utf8"), key, Buffer.from(signature, "base64"));
  } catch { return false; }
}
export function sameSignedReport(remote: Record<string, unknown>, entry: Record<string, unknown>) {
  // updated_at/last_edited_by are server metadata; manual match linking may be
  // applied by a server trigger. Author, payload, and all other IDs stay fixed.
  return ["id", "organization_id", "event_id", "team_id", "assignment_id", "scout_user_id", "entry_type", "form_version", "status"].every((key) => (remote[key] ?? null) === (entry[key] ?? null))
    && Date.parse(String(remote.submitted_at)) === Date.parse(String(entry.submitted_at))
    && canonicalJson(remote.payload) === canonicalJson(entry.payload)
    && (remote.match_id === entry.match_id || Boolean((entry.payload as any)?.manual_match && entry.match_id === null));
}
export async function relayReport(database: MobileDatabase, actor: Actor, input: unknown) {
  if (!["master", "admin", "developer"].includes(actor.role)) throw new MobileError(403, "forbidden", "Master relay access is required.");
  const proof = proofSchema.parse(input);
  const entry = validateNativeEntry(proof.envelope.entry);
  strictPayload(entry);
  if (entry.organization_id !== actor.organizationId) throw new MobileError(404, "report_unavailable", "This report is unavailable.");
  if (entry.status !== "submitted" || !entry.submitted_at) throw new MobileError(422, "submitted_required", "Only completed reports can be relayed.");
  const device = await database.from("mobile_device_keys").select("*").eq("id", proof.envelope.deviceId).eq("organization_id", actor.organizationId).eq("user_id", entry.scout_user_id).maybeSingle();
  if (device.error) throw new MobileError(503, "relay_unavailable", "Signed relay requires the mobile device-key database migration.");
  if (!device.data || device.data.revoked_at || !validSignature(device.data.public_key, proof.envelope, proof.signature)) throw new MobileError(403, "invalid_provenance", "The report signature or registered author device could not be verified.");
  // An author removed from the organization cannot continue relaying with a
  // previously registered device. Device registration alone is not membership.
  const member = await database.from("organization_members").select("role").eq("organization_id", actor.organizationId).eq("user_id", entry.scout_user_id).maybeSingle();
  if (member.error || !member.data) throw new MobileError(403, "author_unavailable", "The report author is no longer a member of this organization.");
  await scopedEvent(database, actor, entry.event_id);
  const team = await database.from("event_teams").select("team_id").eq("event_id", entry.event_id).eq("team_id", entry.team_id).maybeSingle();
  if (team.error || !team.data) throw new MobileError(422, "invalid_team", "This team is not in the signed report's event.");
  if (entry.match_id) {
    const match = await database.from("matches").select("id,red_teams,blue_teams").eq("id", entry.match_id).eq("event_id", entry.event_id).maybeSingle();
    if (match.error || !match.data || ![...(match.data.red_teams ?? []), ...(match.data.blue_teams ?? [])].includes(entry.team_id)) throw new MobileError(422, "invalid_match", "The signed team is not scheduled in this match.");
  }
  if (entry.assignment_id) {
    const assignment = await database.from("scouting_assignments").select("id").eq("id", entry.assignment_id).eq("scout_user_id", entry.scout_user_id).eq("team_id", entry.team_id).eq("match_id", entry.match_id).maybeSingle();
    if (assignment.error || !assignment.data) throw new MobileError(422, "invalid_assignment", "The signed assignment does not belong to this report author.");
  }
  if (entry.entry_type === "pre_scout" && !["admin", "developer", "global_scout"].includes(member.data.role)) {
    const event = await scopedEvent(database, actor, entry.event_id);
    if (event.status !== "active") {
      const assigned = await database.from("prescout_assignments").select("id").eq("event_id", entry.event_id).eq("team_id", entry.team_id).eq("scout_user_id", entry.scout_user_id).maybeSingle();
      if (assigned.error || !assigned.data) throw new MobileError(403, "prescout_unassigned", "The author is not assigned to this pre-scouting report.");
    }
  }
  const existing = await database.from("scouting_entries").select("*").eq("id", entry.id).maybeSingle();
  if (existing.error) throw new MobileError(503, "database_unavailable", "This report could not be checked.");
  if (existing.data) {
    if (!sameSignedReport(existing.data, entry)) throw new MobileError(409, "conflict", "This report ID already contains different data. Relay never overwrites it.");
    return { entry: existing.data, alreadyReceived: true };
  }
  const { updated_at: _serverTimestamp, ...insert } = entry;
  const result = await database.from("scouting_entries").insert(insert).select("*").maybeSingle();
  if (result.error) {
    // Concurrent direct upload and relay may race. Read back, acknowledge only
    // equal signed content, and never replace the winner.
    const raced = await database.from("scouting_entries").select("*").eq("id", entry.id).maybeSingle();
    if (!raced.error && raced.data && sameSignedReport(raced.data, entry)) return { entry: raced.data, alreadyReceived: true };
    if (raced.data) throw new MobileError(409, "conflict", "This report ID was received with different data.");
    throw new MobileError(503, "relay_upload_failed", "The signed report was not uploaded. Keep it in the relay queue and retry.");
  }
  if (!result.data) throw new MobileError(503, "relay_upload_failed", "The signed report could not be confirmed.");
  return { entry: result.data, alreadyReceived: false };
}
