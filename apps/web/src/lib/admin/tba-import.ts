"use server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { revalidateEventTeamNavigation, revalidateOrganizationNavigation } from "@/lib/navigation-data";
import { adminContext, importDatabaseError, type ActionState } from "@/lib/admin/shared";

const tbaEventSchema = z.object({ name: z.string().min(1), start_date: z.string().min(1), end_date: z.string().min(1) });
const tbaTeamSchema = z.object({ key: z.string().regex(/^frc\d+$/), team_number: z.number().int().positive(), nickname: z.string().nullable() });
const tbaMatchSchema = z.object({
  key: z.string().min(1), comp_level: z.string(), match_number: z.number().int().positive(), time: z.number().nullable().optional(), predicted_time: z.number().nullable().optional(), actual_time: z.number().nullable().optional(),
  alliances: z.object({ red: z.object({ team_keys: z.array(z.string().regex(/^frc\d+$/)) }), blue: z.object({ team_keys: z.array(z.string().regex(/^frc\d+$/)) }) }),
});

function tbaHeaders(key: string, etag?: string | null) {
  return { "X-TBA-Auth-Key": key, ...(etag ? { "If-None-Match": etag } : {}) };
}

function tbaResponseError(response: Response, resource: string): ActionState | null {
  if (response.ok || response.status === 304) return null;
  if (response.status === 401 || response.status === 403) return { error: "TBA rejected the read key. Replace TBA_AUTH_KEY in the server environment and restart the app." };
  if (response.status === 404) return { error: `TBA could not find this event while loading ${resource}. Copy the event key exactly from the TBA URL.` };
  if (response.status === 429) return { error: "TBA is rate-limiting requests. Wait a minute and try again." };
  return { error: `TBA returned HTTP ${response.status} while loading ${resource}. Try again shortly.` };
}

export async function importTbaEvent(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const parsed = z.object({ eventKey: z.string().trim().toLowerCase().regex(/^[0-9]{4}[a-z0-9_]+$/) }).safeParse({ eventKey: formData.get("eventKey") });
    if (!parsed.success) return { error: "Enter a valid TBA event key, such as 2026nytr." };

    const tbaKey = process.env.TBA_AUTH_KEY;
    if (!tbaKey) return { error: "TBA_AUTH_KEY is not configured on the server." };
    const { organizationId } = await adminContext();
    const database = createAdminClient();
    const { data: existing, error: existingError } = await database
      .from("events")
      .select("id,tba_etag,tba_teams_etag,tba_matches_etag")
      .eq("organization_id", organizationId)
      .eq("event_key", parsed.data.eventKey)
      .maybeSingle();
    if (existingError) return importDatabaseError("the existing event", existingError);

    const baseUrl = `https://www.thebluealliance.com/api/v3/event/${parsed.data.eventKey}`;
    const [eventResponse, teamsResponse, matchesResponse] = await Promise.all([
      fetch(baseUrl, { headers: tbaHeaders(tbaKey, existing?.tba_etag), cache: "no-store" }),
      fetch(`${baseUrl}/teams/simple`, { headers: tbaHeaders(tbaKey, existing?.tba_teams_etag), cache: "no-store" }),
      fetch(`${baseUrl}/matches/simple`, { headers: tbaHeaders(tbaKey, existing?.tba_matches_etag), cache: "no-store" }),
    ]);
    for (const [response, resource] of [[eventResponse, "the event"], [teamsResponse, "teams"], [matchesResponse, "the match schedule"]] as const) {
      const failure = tbaResponseError(response, resource);
      if (failure) return failure;
    }
    if (!existing && (eventResponse.status === 304 || teamsResponse.status === 304 || matchesResponse.status === 304)) {
      return { error: "TBA returned cached data before the event was created locally. Retry the import once." };
    }

    let eventId = existing?.id;
    if (eventResponse.status !== 304) {
      const event = tbaEventSchema.safeParse(await eventResponse.json());
      if (!event.success) return { error: "TBA returned an event with an unexpected format. Try again shortly." };
      const { data: savedEvent, error } = await database.from("events").upsert({
        organization_id: organizationId,
        event_key: parsed.data.eventKey,
        name: event.data.name,
        starts_at: `${event.data.start_date}T00:00:00Z`,
        ends_at: `${event.data.end_date}T23:59:59Z`,
        status: "upcoming",
        is_manual: false,
      }, { onConflict: "organization_id,event_key" }).select("id").single();
      if (error || !savedEvent) return importDatabaseError("the event", error);
      eventId = savedEvent.id;
    }
    if (!eventId) return { error: "The existing event could not be identified. Retry the import once." };

    let importedTeams: z.infer<typeof tbaTeamSchema>[] | null = null;
    let teamCount = 0;
    if (teamsResponse.status !== 304) {
      const parsedTeams = z.array(tbaTeamSchema).safeParse(await teamsResponse.json());
      if (!parsedTeams.success) return { error: "TBA returned teams with an unexpected format. Try again shortly." };
      importedTeams = parsedTeams.data;
      teamCount = importedTeams.length;
      if (importedTeams.length) {
        const { error } = await database.from("teams").upsert(importedTeams.map((team) => ({
          organization_id: organizationId, team_number: team.team_number, name: team.nickname || `FRC Team ${team.team_number}`,
        })), { onConflict: "organization_id,team_number" });
        if (error) return importDatabaseError("teams", error);
      }
    }

    const { data: databaseTeams, error: databaseTeamsError } = await database.from("teams").select("id,team_number").eq("organization_id", organizationId);
    if (databaseTeamsError) return importDatabaseError("the team directory", databaseTeamsError);
    const teamIdByNumber = new Map((databaseTeams ?? []).map((team) => [team.team_number, team.id]));
    const teamNumberFromKey = (teamKey: string) => Number(teamKey.slice(3));

    if (importedTeams?.length) {
      const teamLinks = importedTeams.map((team) => ({ event_id: eventId, team_id: teamIdByNumber.get(team.team_number) })).filter((link): link is { event_id: string; team_id: string } => Boolean(link.team_id));
      if (teamLinks.length !== importedTeams.length) return { error: "TBA returned a participant that was not saved. Retry the import once." };
      const { error } = await database.from("event_teams").upsert(teamLinks, { onConflict: "event_id,team_id" });
      if (error) return importDatabaseError("event team links", error);
    }

    let matchCount = 0;
    if (matchesResponse.status !== 304) {
      const parsedMatches = z.array(tbaMatchSchema).safeParse(await matchesResponse.json());
      if (!parsedMatches.success) return { error: "TBA returned a schedule with an unexpected format. Try again shortly." };
      matchCount = parsedMatches.data.length;
      const missingTeam = parsedMatches.data.flatMap((match) => [...match.alliances.red.team_keys, ...match.alliances.blue.team_keys]).map(teamNumberFromKey).find((number) => !teamIdByNumber.has(number));
      if (missingTeam) return { error: `TBA's schedule references team ${missingTeam}, but that team was not saved. Retry the import once.` };
      if (parsedMatches.data.length) {
        const { error } = await database.from("matches").upsert(parsedMatches.data.map((match) => ({
          event_id: eventId,
          tba_match_key: match.key,
          match_number: match.match_number,
          match_type: match.comp_level === "qm" ? "qualification" : match.comp_level === "pr" ? "practice" : "playoff",
          red_teams: match.alliances.red.team_keys.map(teamNumberFromKey).map((number) => teamIdByNumber.get(number)!),
          blue_teams: match.alliances.blue.team_keys.map(teamNumberFromKey).map((number) => teamIdByNumber.get(number)!),
          scheduled_at: (match.predicted_time ?? match.time) ? new Date((match.predicted_time ?? match.time)! * 1000).toISOString() : null,
          status: match.actual_time ? "played" : "scheduled",
        })), { onConflict: "event_id,tba_match_key" });
        if (error) return importDatabaseError("the match schedule", error);
      }
    }

    const { error: metadataError } = await database.from("events").update({
      tba_etag: eventResponse.status === 304 ? existing?.tba_etag ?? null : eventResponse.headers.get("etag") ?? existing?.tba_etag ?? null,
      tba_teams_etag: teamsResponse.status === 304 ? existing?.tba_teams_etag ?? null : teamsResponse.headers.get("etag") ?? existing?.tba_teams_etag ?? null,
      tba_matches_etag: matchesResponse.status === 304 ? existing?.tba_matches_etag ?? null : matchesResponse.headers.get("etag") ?? existing?.tba_matches_etag ?? null,
      tba_last_synced_at: new Date().toISOString(),
    }).eq("id", eventId);
    if (metadataError) return importDatabaseError("sync metadata", metadataError);

    revalidatePath("/events");
    revalidatePath("/admin/sync");
    revalidatePath(`/events/${eventId}/matches`);
    revalidateOrganizationNavigation(organizationId);
    revalidateEventTeamNavigation(eventId);
    return { success: `Synced ${teamCount} teams and ${matchCount} matches from TBA. Unchanged data was kept from the previous sync.` };
  } catch (error) {
    console.error("TBA import failed", error);
    return { error: "The import failed before it could finish. Check the server logs for the exact failure, then try again." };
  }
}

