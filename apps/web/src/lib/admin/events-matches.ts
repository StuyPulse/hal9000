"use server";
import { z } from "zod";
import { tbaTeamRemapsSchema } from "../tba-team-remaps-schema";
import { eventTeamNumberFromInput, type TbaTeamRemaps } from "../tba-team-identity";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";
import { revalidateEventTeamNavigation, revalidateOrganizationNavigation } from "@/lib/navigation-data";
import { adminContext, importDatabaseError, type ActionState } from "@/lib/admin/shared";

const localMatchSchema = z.object({ eventId: z.string().uuid(), matchId: z.union([z.literal(""), z.string().uuid()]), matchNumber: z.coerce.number().int().positive(), matchType: z.enum(["qualification", "playoff", "practice"]), redTeams: z.string(), blueTeams: z.string() });
const parseAlliance = (value: string, remaps: TbaTeamRemaps = {}) => [...new Set(value.split(/[\s,]+/).filter(Boolean).map((input) => eventTeamNumberFromInput(input, remaps)))];

async function localMatchContext(formData: FormData) {
  const parsed = localMatchSchema.safeParse({ eventId: formData.get("eventId"), matchId: formData.get("matchId") || "", matchNumber: formData.get("matchNumber"), matchType: formData.get("matchType"), redTeams: formData.get("redTeams"), blueTeams: formData.get("blueTeams") });
  if (!parsed.success) return { error: "Choose a round and enter a positive match number and the red and blue team numbers." } as const;
  const { organizationId } = await adminContext();
  const database: any = createAdminClient();
  const { data: event } = await database.from("events").select("id,event_key,tba_team_remaps").eq("id", parsed.data.eventId).eq("organization_id", organizationId).maybeSingle();
  if (!event) return { error: "This event is unavailable." } as const;
  const remaps = tbaTeamRemapsSchema.parse(event.tba_team_remaps ?? {});
  let redNumbers: number[], blueNumbers: number[];
  try { redNumbers = parseAlliance(parsed.data.redTeams, remaps); blueNumbers = parseAlliance(parsed.data.blueTeams, remaps); }
  catch (error) { return { error: error instanceof Error ? error.message : "Enter valid event team numbers." } as const; }
  if (!redNumbers.length || !blueNumbers.length || redNumbers.length > 3 || blueNumbers.length > 3 || redNumbers.some((number) => blueNumbers.includes(number))) return { error: "Enter one to three distinct positive team numbers for each alliance." } as const;
  const numbers = [...redNumbers, ...blueNumbers];
  const { data: existingTeams, error: teamsError } = await database.from("teams").select("id,team_number").eq("organization_id", organizationId).in("team_number", numbers);
  if (teamsError) return { error: "Couldn’t load the team directory." } as const;
  const teamIdByNumber = new Map((existingTeams ?? []).map((team: any) => [team.team_number, team.id]));
  const missing = numbers.filter((number) => !teamIdByNumber.has(number));
  if (missing.length) {
    const { error } = await database.from("teams").insert(missing.map((team_number) => ({ organization_id: organizationId, team_number, name: `FRC Team ${team_number}` })));
    if (error) return { error: importDatabaseError("manual-match teams", error).error! } as const;
    const { data: added, error: addedError } = await database.from("teams").select("id,team_number").eq("organization_id", organizationId).in("team_number", missing);
    if (addedError) return { error: "Couldn’t reload the new teams." } as const;
    (added ?? []).forEach((team: any) => teamIdByNumber.set(team.team_number, team.id));
  }
  const { error: linkError } = await database.from("event_teams").upsert(numbers.map((number) => ({ event_id: event.id, team_id: teamIdByNumber.get(number)! })), { onConflict: "event_id,team_id" });
  if (linkError) return { error: importDatabaseError("manual-match event teams", linkError).error! } as const;
  return { database, event, parsed: parsed.data, redTeamIds: redNumbers.map((number) => teamIdByNumber.get(number)!), blueTeamIds: blueNumbers.map((number) => teamIdByNumber.get(number)!) } as const;
}

function revalidateLocalMatch(event: { id: string; event_key: string }) {
  revalidatePath("/scout/match");
  revalidatePath(`/events/${event.event_key}/matches`);
  revalidatePath("/admin/assignments");
  revalidateEventTeamNavigation(event.id);
}

function revalidateManualMatchCompletion(event: { id: string; event_key: string }) {
  revalidateLocalMatch(event);
  revalidatePath(`/events/${event.event_key}/strategy`);
  revalidatePath(`/events/${event.event_key}/summary`);
}

export async function createLocalMatch(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const context = await localMatchContext(formData);
    if ("error" in context) return { error: context.error };
    const { error } = await context.database.from("matches").insert({ event_id: context.event.id, tba_match_key: `manual_${randomUUID()}`, match_number: context.parsed.matchNumber, match_type: context.parsed.matchType, red_teams: context.redTeamIds, blue_teams: context.blueTeamIds, status: "scheduled" });
    if (error) return importDatabaseError("manual match", error);
    revalidateLocalMatch(context.event);
    return { success: "Manual match added locally. It will never be sent to or overwritten by TBA." };
  } catch { return { error: "Admin access is required to add a manual match." }; }
}

export async function updateLocalMatch(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const target = z.object({ eventId: z.string().uuid(), matchId: z.string().uuid() }).safeParse({ eventId: formData.get("eventId"), matchId: formData.get("matchId") });
    if (!target.success) return { error: "This manual match could not be identified." };
    const { organizationId } = await adminContext();
    const preflightDatabase: any = createAdminClient();
    const { data: protectedMatch } = await preflightDatabase.from("matches").select("id").eq("id", target.data.matchId).eq("event_id", target.data.eventId).like("tba_match_key", "manual_%").maybeSingle();
    const { data: protectedEvent } = await preflightDatabase.from("events").select("id").eq("id", target.data.eventId).eq("organization_id", organizationId).maybeSingle();
    if (!protectedEvent || !protectedMatch) return { error: "Only locally created manual matches can be edited." };
    const context = await localMatchContext(formData);
    if ("error" in context) return { error: context.error };
    const { data: match } = await context.database.from("matches").select("id,red_teams,blue_teams").eq("id", context.parsed.matchId).eq("event_id", context.event.id).like("tba_match_key", "manual_%").maybeSingle();
    if (!match) return { error: "Only locally created manual matches can be edited." };
    const changedTeams = [...match.red_teams, ...match.blue_teams].sort().join(":") !== [...context.redTeamIds, ...context.blueTeamIds].sort().join(":");
    if (changedTeams) {
      const [{ data: reports }, { data: legacySubmissions }, { data: completeAssignments }] = await Promise.all([
        context.database.from("scouting_entries").select("id").eq("match_id", match.id).eq("status", "submitted").limit(1),
        context.database.from("match_submissions").select("id").eq("match_id", match.id).limit(1),
        context.database.from("scouting_assignments").select("id").eq("match_id", match.id).eq("status", "complete").limit(1),
      ]);
      if (reports?.length || legacySubmissions?.length || completeAssignments?.length) return { error: "This manual match has submitted reports, so its teams cannot be changed." };
      const { error: clearAssignmentsError } = await context.database.from("scouting_assignments").delete().eq("match_id", match.id).neq("status", "complete");
      if (clearAssignmentsError) return importDatabaseError("pending manual assignments", clearAssignmentsError);
    }
    const { error } = await context.database.from("matches").update({ match_number: context.parsed.matchNumber, match_type: context.parsed.matchType, red_teams: context.redTeamIds, blue_teams: context.blueTeamIds }).eq("id", match.id);
    if (error) return importDatabaseError("manual match", error);
    revalidateLocalMatch(context.event);
    return { success: "Manual match updated." };
  } catch { return { error: "Admin access is required to edit a manual match." }; }
}

export async function deleteLocalMatch(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const input = z.object({ eventId: z.string().uuid(), matchId: z.string().uuid() }).safeParse({ eventId: formData.get("eventId"), matchId: formData.get("matchId") });
    if (!input.success) return { error: "This manual match could not be identified." };
    const { organizationId } = await adminContext();
    const database: any = createAdminClient();
    const { data: event } = await database.from("events").select("id,event_key").eq("id", input.data.eventId).eq("organization_id", organizationId).maybeSingle();
    if (!event) return { error: "This event is unavailable." };
    const { data: match } = await database.from("matches").select("id").eq("id", input.data.matchId).eq("event_id", event.id).like("tba_match_key", "manual_%").maybeSingle();
    if (!match) return { error: "Only locally created manual matches can be deleted." };
    const [{ data: reports }, { data: legacySubmissions }] = await Promise.all([
      database.from("scouting_entries").select("id").eq("match_id", match.id).eq("status", "submitted").limit(1),
      database.from("match_submissions").select("id").eq("match_id", match.id).limit(1),
    ]);
    if (reports?.length || legacySubmissions?.length) return { error: "This manual match has submitted reports and cannot be deleted." };
    const { error } = await database.from("matches").delete().eq("id", match.id);
    if (error) return importDatabaseError("manual match", error);
    revalidateLocalMatch(event);
    return { success: "Manual match deleted." };
  } catch { return { error: "Admin access is required to delete a manual match." }; }
}

export async function completeManualMatch(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const input = z.object({ eventId: z.string().uuid(), matchId: z.string().uuid() }).safeParse({ eventId: formData.get("eventId"), matchId: formData.get("matchId") });
    if (!input.success) return { error: "This manual match could not be identified." };

    const { organizationId } = await adminContext();
    const database: any = createAdminClient();
    const { data: event } = await database.from("events").select("id,event_key,is_manual").eq("id", input.data.eventId).eq("organization_id", organizationId).maybeSingle();
    if (!event) return { error: "This event is unavailable." };
    const { data: match } = await database.from("matches").select("id,tba_match_key,status").eq("id", input.data.matchId).eq("event_id", event.id).maybeSingle();
    if (!match || (!event.is_manual && !String(match.tba_match_key).startsWith("manual_"))) return { error: "Only manual matches can be marked complete." };
    if (match.status === "played") return { success: "This manual match is already complete." };

    const { error } = await database.from("matches").update({ status: "played" }).eq("id", match.id).eq("event_id", event.id);
    if (error) return importDatabaseError("manual match completion", error);
    revalidateManualMatchCompletion(event);
    return { success: "Manual match marked complete." };
  } catch { return { error: "Admin access is required to complete a manual match." }; }
}

const manualEventSchema = z.object({ name: z.string().trim().min(3).max(160), startsAt: z.string().date(), endsAt: z.string().date().optional() }).refine((input) => !input.endsAt || input.endsAt >= input.startsAt, { message: "The end date must not be before the event date." });
const manualMatchSchema = z.object({ eventId: z.string().uuid(), matchId: z.union([z.literal(""), z.string().uuid()]), matchNumber: z.coerce.number().int().positive(), matchType: z.enum(["qualification", "playoff", "practice"]), redTeams: z.string(), blueTeams: z.string(), scheduledAtIso: z.iso.datetime({ offset: true }).optional() });

function manualEventKey() { return `manual_${randomUUID().replaceAll("-", "")}`; }
function parseAllianceTeams(value: string) { return [...new Set(value.split(/[\s,]+/).filter(Boolean).map(Number))]; }

async function manualEventContext(eventId: string) {
  const { organizationId } = await adminContext();
  const database: any = createAdminClient();
  const { data: event } = await database.from("events").select("id,event_key,is_manual").eq("id", eventId).eq("organization_id", organizationId).maybeSingle();
  if (!event?.is_manual) throw new Error("Manual event access required.");
  return { database, organizationId, event };
}

async function ensureManualEventTeams(database: any, organizationId: string, eventId: string, teamNumbers: number[]) {
  const unique = [...new Set(teamNumbers)];
  const { data: existing, error: existingError } = await database.from("teams").select("id,team_number").eq("organization_id", organizationId).in("team_number", unique);
  if (existingError) throw new Error("Could not load the team directory.");
  const ids = new Map((existing ?? []).map((team: any) => [team.team_number, team.id]));
  const missing = unique.filter((number) => !ids.has(number));
  if (missing.length) {
    const { error } = await database.from("teams").insert(missing.map((team_number) => ({ organization_id: organizationId, team_number, name: `Team ${team_number}` })));
    if (error) throw new Error("Could not save the new teams.");
    const { data: added, error: addedError } = await database.from("teams").select("id,team_number").eq("organization_id", organizationId).in("team_number", missing);
    if (addedError) throw new Error("Could not reload the new teams.");
    (added ?? []).forEach((team: any) => ids.set(team.team_number, team.id));
  }
  const { error: linkError } = await database.from("event_teams").upsert(unique.map((number) => ({ event_id: eventId, team_id: ids.get(number)! })), { onConflict: "event_id,team_id" });
  if (linkError) throw new Error("Could not add teams to this event.");
  return ids;
}

export async function createEvent(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const parsed = manualEventSchema.safeParse({ name: formData.get("name"), startsAt: formData.get("startsAt"), endsAt: formData.get("endsAt") || undefined });
    if (!parsed.success) return { error: "Enter an event name and valid date range." };
    const { organizationId } = await adminContext();
    const database: any = createAdminClient();
    const { data: event, error } = await database.from("events").insert({ organization_id: organizationId, name: parsed.data.name, event_key: manualEventKey(), starts_at: `${parsed.data.startsAt}T00:00:00Z`, ends_at: `${parsed.data.endsAt ?? parsed.data.startsAt}T23:59:59Z`, status: "upcoming", is_manual: true }).select("event_key").single();
    if (error || !event) return { error: "Couldn’t create the manual event." };
    revalidatePath("/events");
    revalidateOrganizationNavigation(organizationId);
    return { success: "Manual event created. Add its teams and matches next." };
  } catch { return { error: "Admin access is required." }; }
}

export async function addEventTeam(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const parsed = z.object({ eventId: z.string().uuid(), teamNumber: z.string().trim().regex(/^\d+[A-Za-z]*$/), name: z.string().trim().max(160).optional() }).safeParse({ eventId: formData.get("eventId"), teamNumber: formData.get("teamNumber"), name: formData.get("name") || undefined });
    if (!parsed.success) return { error: "Enter a positive team number." };
    const { organizationId } = await adminContext();
    const database: any = createAdminClient();
    const { data: event } = await database.from("events").select("id,event_key,is_manual,tba_team_remaps").eq("id", parsed.data.eventId).eq("organization_id", organizationId).maybeSingle();
    if (!event) return { error: "This event is unavailable." };
    let teamNumber: number;
    try { teamNumber = eventTeamNumberFromInput(parsed.data.teamNumber, tbaTeamRemapsSchema.parse(event.tba_team_remaps ?? {})); }
    catch (error) { return { error: error instanceof Error ? error.message : "Enter a valid event team number." }; }
    if (teamNumber > 99999) return { error: "Enter a team number below 100000." };
    const { data: existingTeam, error: lookupError } = await database.from("teams").select("id").eq("organization_id", organizationId).eq("team_number", teamNumber).maybeSingle();
    if (lookupError) return { error: "Couldn’t load that team." };
    let teamId = existingTeam?.id;
    if (!teamId) {
      const { data: createdTeam, error: teamError } = await database.from("teams").insert({ organization_id: organizationId, team_number: teamNumber, name: parsed.data.name || `Team ${parsed.data.teamNumber}` }).select("id").single();
      if (teamError || !createdTeam) return { error: "Couldn’t save that team." };
      teamId = createdTeam.id;
    }
    const { error: linkError } = await database.from("event_teams").upsert({ event_id: event.id, team_id: teamId, is_manual: true }, { onConflict: "event_id,team_id" });
    if (linkError) return { error: "Couldn’t add that team to the event." };
    revalidatePath(`/events/${event.event_key}/matches`); revalidatePath(`/events/${event.event_key}/teams`);
    revalidateEventTeamNavigation(event.id);
    return { success: event.is_manual ? `Team ${parsed.data.teamNumber} is ready for this event.` : `Team ${parsed.data.teamNumber} is ready for this event. TBA will merge it into the official roster when it appears there.` };
  } catch { return { error: "Admin access is required to add an event team." }; }
}

export async function removeManualEventTeam(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const parsed = z.object({ eventId: z.string().uuid(), teamId: z.string().uuid() }).safeParse({ eventId: formData.get("eventId"), teamId: formData.get("teamId") });
    if (!parsed.success) return { error: "This team could not be identified." };
    const { database, event } = await manualEventContext(parsed.data.eventId);
    const { data: matches, error: matchesError } = await database.from("matches").select("red_teams,blue_teams").eq("event_id", event.id);
    if (matchesError) return { error: "Couldn’t check this team’s matches." };
    if (matches?.some((match: any) => [...match.red_teams, ...match.blue_teams].includes(parsed.data.teamId))) return { error: "Edit or remove this team from its matches before removing it from the event." };
    const { error } = await database.from("event_teams").delete().eq("event_id", event.id).eq("team_id", parsed.data.teamId);
    if (error) return { error: "Couldn’t remove that team." };
    revalidatePath(`/events/${event.event_key}/matches`); revalidatePath(`/events/${event.event_key}/teams`);
    revalidateEventTeamNavigation(event.id);
    return { success: "Team removed from this event." };
  } catch { return { error: "Manual-event admin access is required." }; }
}

export async function saveManualMatch(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const parsed = manualMatchSchema.safeParse({ eventId: formData.get("eventId"), matchId: formData.get("matchId") || "", matchNumber: formData.get("matchNumber"), matchType: formData.get("matchType"), redTeams: formData.get("redTeams"), blueTeams: formData.get("blueTeams"), scheduledAtIso: formData.get("scheduledAtIso") || undefined });
    if (!parsed.success) return { error: "Enter a valid match number, type, and schedule." };
    const red = parseAllianceTeams(parsed.data.redTeams), blue = parseAllianceTeams(parsed.data.blueTeams);
    if (!red.length || !blue.length || red.length > 3 || blue.length > 3 || [...red, ...blue].some((number) => !Number.isInteger(number) || number <= 0) || red.some((number) => blue.includes(number))) return { error: "Enter one to three distinct positive team numbers for each alliance." };
    const { database, organizationId, event } = await manualEventContext(parsed.data.eventId);
    const teams = await ensureManualEventTeams(database, organizationId, event.id, [...red, ...blue]);
    const match = { event_id: event.id, match_number: parsed.data.matchNumber, match_type: parsed.data.matchType, red_teams: red.map((number) => teams.get(number)!), blue_teams: blue.map((number) => teams.get(number)!), scheduled_at: parsed.data.scheduledAtIso ?? null, status: "scheduled" };
    const { error } = parsed.data.matchId
      ? await database.from("matches").update(match).eq("id", parsed.data.matchId).eq("event_id", event.id)
      : await database.from("matches").insert({ ...match, tba_match_key: `manual_${randomUUID()}` });
    if (error) return { error: "Couldn’t save that match. Match numbers must be unique within each round type." };
    revalidatePath(`/events/${event.event_key}/matches`); revalidatePath("/scout/match");
    revalidateEventTeamNavigation(event.id);
    return { success: parsed.data.matchId ? "Match updated." : "Match added." };
  } catch { return { error: "Manual-event admin access is required." }; }
}

export async function deleteManualMatch(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const parsed = z.object({ eventId: z.string().uuid(), matchId: z.string().uuid() }).safeParse({ eventId: formData.get("eventId"), matchId: formData.get("matchId") });
    if (!parsed.success) return { error: "This match could not be identified." };
    const { database, event } = await manualEventContext(parsed.data.eventId);
    const { data: submissions, error: submissionsError } = await database.from("match_submissions").select("id").eq("match_id", parsed.data.matchId).limit(1);
    if (submissionsError) return { error: "Couldn’t check whether this match has submissions." };
    if (submissions?.length) return { error: "This match has submissions, so it cannot be deleted." };
    const { error } = await database.from("matches").delete().eq("id", parsed.data.matchId).eq("event_id", event.id);
    if (error) return { error: "Couldn’t delete that match." };
    revalidatePath(`/events/${event.event_key}/matches`); revalidatePath("/scout/match");
    return { success: "Match deleted." };
  } catch { return { error: "Manual-event admin access is required." }; }
}

export async function deleteEvent(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const input = z.object({ eventId: z.string().uuid(), eventName: z.string().trim().min(1).max(160) }).safeParse({ eventId: formData.get("eventId"), eventName: formData.get("eventName") });
    if (!input.success) return { error: "This event could not be identified." };
    const { supabase, organizationId } = await adminContext();
    const { data: submissions, error: submissionsError } = await supabase.from("match_submissions").select("id").eq("event_id", input.data.eventId).limit(1);
    if (submissionsError) return { error: "Couldn’t check whether the event has submissions." };
    if (submissions?.length) return { error: "This event has scouting submissions, so it is protected from deletion." };
    const { data: deleted, error } = await supabase.from("events").delete().eq("id", input.data.eventId).eq("organization_id", organizationId).select("id").maybeSingle();
    if (error || !deleted) return { error: "Couldn’t delete the event. It may have changed or you may not have access." };
    revalidatePath("/events");
    revalidatePath("/admin/sync");
    revalidateOrganizationNavigation(organizationId);
    return { success: `${input.data.eventName} was deleted.` };
  } catch { return { error: "Admin access is required." }; }
}


export async function setActiveEvent(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const input = z.object({ eventId: z.string().uuid() }).safeParse({ eventId: formData.get("eventId") });
    if (!input.success) return { error: "This event could not be identified." };
    const { organizationId } = await adminContext();
    const database = createAdminClient();
    const { data: event } = await database.from("events").select("id,name").eq("id", input.data.eventId).eq("organization_id", organizationId).maybeSingle();
    if (!event) return { error: "This event is unavailable." };
    const { error: deactivateError } = await database.from("events").update({ status: "upcoming" }).eq("organization_id", organizationId).eq("status", "active");
    if (deactivateError) return importDatabaseError("the current active event", deactivateError);
    const { error: activateError } = await database.from("events").update({ status: "active" }).eq("id", event.id).eq("organization_id", organizationId);
    if (activateError) return importDatabaseError("the selected event", activateError);
    revalidatePath("/"); revalidatePath("/dashboard"); revalidatePath("/events"); revalidatePath("/scout/manual");
    revalidateOrganizationNavigation(organizationId);
    return { success: `${event.name} is now the active event.` };
  } catch { return { error: "Admin access is required." }; }
}
