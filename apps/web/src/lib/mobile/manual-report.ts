import { z } from "zod";
import { validateNativeEntry } from "@wildcard/shared/src/native-contracts";
import { canDelete, MobileError, scopedEvent, strictPayload, type Actor, type MobileDatabase } from "./operations";

const metadataSchema = z.object({ stage: z.enum(["Qualification", "Practice", "Quarterfinal", "Semifinal", "Final", "Other / exception"]), label: z.string().trim().max(30).nullable(), alliance: z.enum(["red", "blue"]) }).strict().superRefine((value, context) => {
  if (value.stage !== "Other / exception" && !/^[1-9]\d{0,5}$/.test(value.label ?? "")) context.addIssue({ code: "custom", message: "A numbered stage needs a positive numeric match label." });
});
const inputSchema = z.object({ entryId: z.string().uuid(), eventId: z.string().uuid(), teamId: z.string().uuid(), payload: z.record(z.string(), z.unknown()), expectedUpdatedAt: z.string().datetime({ offset: true }) }).strict();
export type ManualMetadata = z.infer<typeof metadataSchema>;
export type ManualCandidate = { id: string; match_number: number; match_type: string; tba_match_key: string | null; red_teams: string[]; blue_teams: string[] };
export function manualCandidate(matches: ManualCandidate[], teamId: string, metadata: ManualMetadata) {
  if (metadata.stage === "Other / exception") return null;
  const label = Number(metadata.label); const stage = metadata.stage.toLowerCase();
  const keySuffix = stage === "qualification" ? `_qm${label}` : stage === "practice" ? `_pm${label}` : stage === "quarterfinal" ? `_qf${label}m1` : stage === "semifinal" ? `_sf${label}m1` : `_f1m${label}`;
  const type = ["qualification", "practice"].includes(stage) ? stage : "playoff";
  const candidates = matches.filter(match => (match.tba_match_key ? match.tba_match_key.endsWith(keySuffix) : match.match_type === type && match.match_number === label) && [...match.red_teams, ...match.blue_teams].includes(teamId));
  if (candidates.some(match => !(metadata.alliance === "red" ? match.red_teams : match.blue_teams).includes(teamId))) throw new MobileError(422, "wrong_alliance", "This team is scheduled on the other alliance for that match.");
  return candidates.length === 1 ? candidates[0] : null;
}
export async function correctManualReport(database: MobileDatabase, actor: Actor, value: unknown) {
  const input = inputSchema.parse(value);
  await scopedEvent(database, actor, input.eventId);
  const existing = await database.from("scouting_entries").select("*").eq("id", input.entryId).eq("event_id", input.eventId).eq("organization_id", actor.organizationId).maybeSingle();
  if (existing.error) throw new MobileError(503, "database_unavailable", "The manual report could not be loaded.");
  const before = existing.data;
  if (!before || before.entry_type !== "match" || before.form_version !== 4 || before.status !== "submitted" || !before.payload?.manual_match || typeof before.payload.manual_match !== "object" || Array.isArray(before.payload.manual_match)) throw new MobileError(404, "manual_report_unavailable", "This submitted manual report is unavailable.");
  if (!canDelete(actor, before)) throw new MobileError(403, "forbidden", "You can only correct your own manual reports.");
  if (before.updated_at !== input.expectedUpdatedAt) throw new MobileError(409, "conflict", "This manual report changed. Refresh before correcting it.");
  const metadata = metadataSchema.parse(input.payload.manual_match);
  const payload = { ...input.payload, manual_match: metadata, report_source: "manual" };
  const entry = validateNativeEntry({ ...before, team_id: input.teamId, payload });
  strictPayload(entry);
  const team = await database.from("event_teams").select("team_id").eq("event_id", input.eventId).eq("team_id", input.teamId).maybeSingle();
  if (team.error || !team.data) throw new MobileError(422, "invalid_team", "Choose a team in this event.");
  const matches: ManualCandidate[] = [];
  if (metadata.stage !== "Other / exception") {
    for (let offset = 0; ; offset += 1000) {
      const page = await database.from("matches").select("id,match_number,match_type,tba_match_key,red_teams,blue_teams").eq("event_id", input.eventId).order("id").range(offset, offset + 999);
      if (page.error) throw new MobileError(503, "database_unavailable", "The event schedule could not be checked.");
      matches.push(...(page.data ?? [])); if ((page.data?.length ?? 0) < 1000) break;
    }
  }
  const match = manualCandidate(matches, input.teamId, metadata);
  if (!database.rpc) throw new MobileError(503, "manual_correction_unavailable", "Transactional manual correction requires the mobile database migration.");
  const saved = await database.rpc("mobile_correct_manual_report", { target_entry_id: before.id, target_organization_id: actor.organizationId, target_event_id: input.eventId, caller_user_id: actor.userId, expected_updated_at: input.expectedUpdatedAt, corrected_team_id: input.teamId, corrected_match_id: match?.id ?? null, corrected_payload: payload });
  if (saved.error || !saved.data) throw new MobileError(503, "manual_correction_unavailable", "Transactional manual correction is unavailable. Refresh before retrying.");
  const code = saved.data.code;
  if (code === "conflict") throw new MobileError(409, code, "This manual report changed during correction. Refresh and retry.");
  if (code === "forbidden") throw new MobileError(403, code, "Your permission to correct this report changed.");
  if (code === "manual_report_unavailable") throw new MobileError(404, code, "This manual report is unavailable.");
  if (code === "invalid_team" || code === "invalid_match") throw new MobileError(422, code, "The selected team or match changed. Refresh the event schedule.");
  if (!saved.data.entry) throw new MobileError(503, "confirmation_failed", "The correction could not be confirmed. Refresh before retrying.");
  return { entry: saved.data.entry };
}
