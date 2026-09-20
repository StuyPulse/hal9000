import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";

const matchSchema = z.object({
  key: z.string().min(1),
  comp_level: z.string(),
  match_number: z.number().int().positive(),
  time: z.number().nullable().optional(),
  predicted_time: z.number().nullable().optional(),
  actual_time: z.number().nullable().optional(),
  post_result_time: z.number().nullable().optional(),
  alliances: z.object({
    red: z.object({ team_keys: z.array(z.string().regex(/^frc\d+$/)), score: z.number().int() }),
    blue: z.object({ team_keys: z.array(z.string().regex(/^frc\d+$/)), score: z.number().int() }),
  }),
  score_breakdown: z.object({ red: z.record(z.string(), z.unknown()).nullable(), blue: z.record(z.string(), z.unknown()).nullable() }).nullable().optional(),
});

export type LiveSyncResult = { updated: boolean; skipped?: boolean; message: string };
export type ActiveEventSyncResult = LiveSyncResult & { eventId: string; eventKey: string };
const intervalMs = 25_000;
const typeFor = (level: string) => level === "qm" ? "qualification" : level === "pr" ? "practice" : "playoff";
const scoreFor = (score: number) => score >= 0 ? score : null;
const tbaSimpleTeamSchema = z.object({ team_number: z.number().int().positive(), nickname: z.string().nullable().optional() });

async function ensureLiveEventRoster(database: any, event: { id: string }, organizationId: string, officialTeams: z.infer<typeof tbaSimpleTeamSchema>[], reconcile: boolean) {
  if (!officialTeams.length) throw new Error("TBA returned an empty event roster, so the current roster was left unchanged.");
  const teamNumbers = [...new Set(officialTeams.map((team) => team.team_number))];
  const { data: storedTeams, error: storedTeamsError } = await database.from("teams").select("id,team_number").eq("organization_id", organizationId);
  if (storedTeamsError) throw new Error("Could not load the event team directory.");
  let teamIdByNumber = new Map<number, string>((storedTeams ?? []).map((team: { id: string; team_number: number }) => [team.team_number, team.id]));
  const missingNumbers = teamNumbers.filter((number) => !teamIdByNumber.has(number));

  if (missingNumbers.length) {
    const namesByNumber = new Map(officialTeams.map((team) => [team.team_number, team.nickname || `FRC Team ${team.team_number}`]));
    const { error: saveTeamsError } = await database.from("teams").upsert(missingNumbers.map((team_number) => ({ organization_id: organizationId, team_number, name: namesByNumber.get(team_number) ?? `FRC Team ${team_number}` })), { onConflict: "organization_id,team_number" });
    if (saveTeamsError) throw new Error("Could not save the live event team directory.");
    const { data: refreshedTeams, error: refreshedTeamsError } = await database.from("teams").select("id,team_number").eq("organization_id", organizationId);
    if (refreshedTeamsError) throw new Error("Could not reload the live event team directory.");
    teamIdByNumber = new Map<number, string>((refreshedTeams ?? []).map((team: { id: string; team_number: number }) => [team.team_number, team.id]));
  }

  const unresolvedTeam = teamNumbers.find((number) => !teamIdByNumber.has(number));
  if (unresolvedTeam) throw new Error(`Could not prepare team ${unresolvedTeam} for the live event.`);
  const rosterTeamIds = teamNumbers.map((team_number) => teamIdByNumber.get(team_number)!);
  const { data: existingLinks, error: existingLinksError } = await database.from("event_teams").select("team_id").eq("event_id", event.id);
  if (existingLinksError) throw new Error("Could not load the current event roster.");
  const existingTeamIds = new Set<string>((existingLinks ?? []).map((link: { team_id: string }) => link.team_id));
  const newTeamIds = rosterTeamIds.filter((teamId) => !existingTeamIds.has(teamId));
  if (newTeamIds.length) {
    const { error: linkError } = await database.from("event_teams").upsert(newTeamIds.map((team_id) => ({ event_id: event.id, team_id })), { onConflict: "event_id,team_id" });
    if (linkError) throw new Error("Could not link the official team roster to the live event.");
  }
  const staleTeamIds = reconcile ? [...existingTeamIds].filter((teamId) => !rosterTeamIds.includes(teamId)) : [];
  if (staleTeamIds.length) {
    const { error: unlinkError } = await database.from("event_teams").delete().eq("event_id", event.id).in("team_id", staleTeamIds);
    if (unlinkError) throw new Error("Could not remove withdrawn teams from the event roster.");
  }
  return { teamIdByNumber, addedTeamCount: missingNumbers.length, linkedTeamCount: newTeamIds.length, removedTeamCount: staleTeamIds.length };
}

export async function syncLiveEvent(eventId: string, organizationId: string): Promise<LiveSyncResult> {
  const database: any = createAdminClient();
  const { data: event, error: eventError } = await database.from("events").select("id,event_key,is_manual,tba_live_matches_etag,tba_teams_etag").eq("id", eventId).eq("organization_id", organizationId).eq("status", "active").maybeSingle();
  if (eventError || !event) return { updated: false, skipped: true, message: "No active event is available." };
  if (event.is_manual) return { updated: false, skipped: true, message: "Manual events do not sync with TBA." };

  const now = new Date();
  const staleBefore = new Date(now.getTime() - intervalMs).toISOString();
  const { data: claim, error: claimError } = await database.from("events").update({ tba_live_sync_started_at: now.toISOString() }).eq("id", event.id).or(`tba_live_sync_started_at.is.null,tba_live_sync_started_at.lt.${staleBefore}`).select("id").maybeSingle();
  if (claimError) throw new Error("Could not reserve the live TBA sync.");
  if (!claim) return { updated: false, skipped: true, message: "Live data is already fresh." };

  const key = process.env.TBA_AUTH_KEY;
  if (!key) throw new Error("TBA_AUTH_KEY is not configured.");
  const [response, rosterResponse] = await Promise.all([
    fetch(`https://www.thebluealliance.com/api/v3/event/${event.event_key}/matches`, { headers: { "X-TBA-Auth-Key": key, ...(event.tba_live_matches_etag ? { "If-None-Match": event.tba_live_matches_etag } : {}) }, cache: "no-store" }),
    fetch(`https://www.thebluealliance.com/api/v3/event/${event.event_key}/teams/simple`, { headers: { "X-TBA-Auth-Key": key, ...(event.tba_teams_etag ? { "If-None-Match": event.tba_teams_etag } : {}) }, cache: "no-store" }),
  ]);
  if (!response.ok && response.status !== 304) throw new Error(`TBA live match sync returned HTTP ${response.status}.`);
  if (!rosterResponse.ok && rosterResponse.status !== 304) throw new Error(`TBA live roster sync returned HTTP ${rosterResponse.status}.`);

  let teamIdByNumber = new Map<number, string>();
  let addedTeamCount = 0;
  let linkedTeamCount = 0;
  let removedTeamCount = 0;
  if (rosterResponse.status !== 304) {
    const parsedRoster = z.array(tbaSimpleTeamSchema).safeParse(await rosterResponse.json());
    if (!parsedRoster.success) throw new Error("TBA returned an unexpected live event roster.");
    const roster = await ensureLiveEventRoster(database, event, organizationId, parsedRoster.data, true);
    teamIdByNumber = roster.teamIdByNumber;
    addedTeamCount = roster.addedTeamCount;
    linkedTeamCount = roster.linkedTeamCount;
    removedTeamCount = roster.removedTeamCount;
  }
  if (response.status === 304) {
    const update: Record<string, string> = { tba_last_live_synced_at: now.toISOString() };
    const rosterEtag = rosterResponse.headers.get("etag");
    if (rosterEtag) update.tba_teams_etag = rosterEtag;
    await database.from("events").update(update).eq("id", event.id);
    const rosterChange = addedTeamCount || linkedTeamCount || removedTeamCount;
    return { updated: Boolean(rosterChange), message: rosterChange ? `Official roster updated${removedTeamCount ? `; removed ${removedTeamCount} withdrawn team${removedTeamCount === 1 ? "" : "s"}` : ""}.` : "Official match and roster data are unchanged." };
  }
  const parsed = z.array(matchSchema).safeParse(await response.json());
  if (!parsed.success) throw new Error("TBA returned an unexpected live match payload.");

  const numberFromKey = (teamKey: string) => Number(teamKey.slice(3));
  const teamNumbers = [...new Set(parsed.data.flatMap((match) => [...match.alliances.red.team_keys, ...match.alliances.blue.team_keys]).map(numberFromKey))];
  if (teamNumbers.some((number) => !teamIdByNumber.has(number))) {
    const matchTeams = teamNumbers.map((team_number) => ({ team_number, nickname: null }));
    const roster = await ensureLiveEventRoster(database, event, organizationId, matchTeams, false);
    teamIdByNumber = roster.teamIdByNumber;
    addedTeamCount += roster.addedTeamCount;
    linkedTeamCount += roster.linkedTeamCount;
  }

  const rows = parsed.data.map((match) => ({
    event_id: event.id,
    tba_match_key: match.key,
    match_number: match.match_number,
    match_type: typeFor(match.comp_level),
    red_teams: match.alliances.red.team_keys.map(numberFromKey).map((number) => teamIdByNumber.get(number)!),
    blue_teams: match.alliances.blue.team_keys.map(numberFromKey).map((number) => teamIdByNumber.get(number)!),
    scheduled_at: (match.predicted_time ?? match.time) ? new Date((match.predicted_time ?? match.time)! * 1000).toISOString() : null,
    actual_at: match.actual_time ? new Date(match.actual_time * 1000).toISOString() : null,
    status: match.actual_time || match.post_result_time ? "played" : "scheduled",
    red_score: scoreFor(match.alliances.red.score),
    blue_score: scoreFor(match.alliances.blue.score),
    tba_score_breakdown: match.score_breakdown ?? {},
  }));
  if (rows.length) {
    const { error } = await database.from("matches").upsert(rows, { onConflict: "event_id,tba_match_key" });
    if (error) throw new Error("Could not save live match results.");
    const { error: reconciliationError } = await database.rpc("reconcile_manual_match_reports", { p_event_id: event.id });
    if (reconciliationError) throw new Error("Could not reconcile manual scouting reports with the official schedule.");
  }
  const update: Record<string, string> = { tba_last_live_synced_at: now.toISOString() };
  const matchesEtag = response.headers.get("etag");
  const rosterEtag = rosterResponse.headers.get("etag");
  if (matchesEtag) update.tba_live_matches_etag = matchesEtag;
  if (rosterEtag) update.tba_teams_etag = rosterEtag;
  await database.from("events").update(update).eq("id", event.id);
  return { updated: true, message: `Updated ${rows.length} official matches${addedTeamCount ? ` and added ${addedTeamCount} teams` : ""}${linkedTeamCount && !addedTeamCount ? ` and linked ${linkedTeamCount} teams` : ""}${removedTeamCount ? `; removed ${removedTeamCount} withdrawn team${removedTeamCount === 1 ? "" : "s"}` : ""}.` };
}

/** Sync each organization’s active event for the protected production scheduler. */
export async function syncAllActiveEvents(): Promise<ActiveEventSyncResult[]> {
  const database: any = createAdminClient();
  const { data: events, error } = await database.from("events").select("id,organization_id,event_key").eq("status", "active").eq("is_manual", false);
  if (error) throw new Error("Could not load active events for live synchronization.");

  return Promise.all((events ?? []).map(async (event: { id: string; organization_id: string; event_key: string }) => ({
    eventId: event.id,
    eventKey: event.event_key,
    ...(await syncLiveEvent(event.id, event.organization_id)),
  })));
}
