"use server";
import { z } from "zod";
import { DEFAULT_2026_FORM, formDefinitionSchema, organizationRoleSchema } from "@wildcard/shared";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";

export type ActionState = { error?: string; success?: string };
async function adminContext() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Sign in required.");
  const { data: member } = await supabase.from("organization_members").select("organization_id, role").eq("user_id", user.id).in("role", ["admin", "developer"]).limit(1).maybeSingle();
  if (!member) throw new Error("Admin access required.");
  return { supabase, organizationId: member.organization_id };
}

export async function createPracticeMatch(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const parsed = z.object({ eventId: z.string().uuid(), matchNumber: z.coerce.number().int().positive(), redTeams: z.string(), blueTeams: z.string() }).safeParse({ eventId: formData.get("eventId"), matchNumber: formData.get("matchNumber"), redTeams: formData.get("redTeams"), blueTeams: formData.get("blueTeams") });
    if (!parsed.success) return { error: "Enter a positive practice-match number and the red and blue team numbers." };
    const parseAlliance = (value: string) => [...new Set(value.split(/[\\s,]+/).filter(Boolean).map(Number))];
    const redNumbers = parseAlliance(parsed.data.redTeams), blueNumbers = parseAlliance(parsed.data.blueTeams);
    if (!redNumbers.length || !blueNumbers.length || redNumbers.length > 3 || blueNumbers.length > 3 || [...redNumbers, ...blueNumbers].some((number) => !Number.isInteger(number) || number <= 0) || redNumbers.some((number) => blueNumbers.includes(number))) return { error: "Enter one to three distinct positive team numbers for each alliance." };
    const { organizationId } = await adminContext(); const database: any = createAdminClient();
    const { data: event } = await database.from("events").select("id").eq("id", parsed.data.eventId).eq("organization_id", organizationId).maybeSingle();
    if (!event) return { error: "This event is unavailable." };
    const numbers = [...redNumbers, ...blueNumbers];
    const { data: existingTeams } = await database.from("teams").select("id,team_number").eq("organization_id", organizationId).in("team_number", numbers);
    const existingByNumber = new Map((existingTeams ?? []).map((team: any) => [team.team_number, team.id]));
    const missing = numbers.filter((number) => !existingByNumber.has(number));
    if (missing.length) { const { error } = await database.from("teams").insert(missing.map((team_number) => ({ organization_id: organizationId, team_number, name: `FRC Team ${team_number}` }))); if (error) return importDatabaseError("practice-match teams", error); const { data: added } = await database.from("teams").select("id,team_number").eq("organization_id", organizationId).in("team_number", missing); (added ?? []).forEach((team: any) => existingByNumber.set(team.team_number, team.id)); }
    const teamLinks = numbers.map((number) => ({ event_id: event.id, team_id: existingByNumber.get(number) }));
    const { error: linkError } = await database.from("event_teams").upsert(teamLinks, { onConflict: "event_id,team_id" }); if (linkError) return importDatabaseError("practice-match event teams", linkError);
    const { error } = await database.from("matches").insert({ event_id: event.id, tba_match_key: `manual_practice_${randomUUID()}`, match_number: parsed.data.matchNumber, match_type: "practice", red_teams: redNumbers.map((number) => existingByNumber.get(number)), blue_teams: blueNumbers.map((number) => existingByNumber.get(number)), status: "scheduled" });
    if (error) return importDatabaseError("practice match", error);
    revalidatePath("/scout/match"); revalidatePath(`/events/${parsed.data.eventId}/matches`); return { success: "Practice match added locally. It will never be sent to or overwritten by TBA." };
  } catch { return { error: "Admin access is required to add a practice match." }; }
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
    return { success: "Manual event created. Add its teams and matches next." };
  } catch { return { error: "Admin access is required." }; }
}

export async function addManualEventTeam(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const parsed = z.object({ eventId: z.string().uuid(), teamNumber: z.coerce.number().int().positive().max(99999), name: z.string().trim().min(1).max(160) }).safeParse({ eventId: formData.get("eventId"), teamNumber: formData.get("teamNumber"), name: formData.get("name") });
    if (!parsed.success) return { error: "Enter a positive team number and a team name." };
    const { database, organizationId, event } = await manualEventContext(parsed.data.eventId);
    const { error: teamError } = await database.from("teams").upsert({ organization_id: organizationId, team_number: parsed.data.teamNumber, name: parsed.data.name }, { onConflict: "organization_id,team_number" });
    if (teamError) return { error: "Couldn’t save that team." };
    const { data: team, error: teamLookupError } = await database.from("teams").select("id").eq("organization_id", organizationId).eq("team_number", parsed.data.teamNumber).single();
    if (teamLookupError || !team) return { error: "Couldn’t find that team after saving it." };
    const { error: linkError } = await database.from("event_teams").upsert({ event_id: event.id, team_id: team.id }, { onConflict: "event_id,team_id" });
    if (linkError) return { error: "Couldn’t add that team to the event." };
    revalidatePath(`/events/${event.event_key}/matches`); revalidatePath(`/events/${event.event_key}/teams`);
    return { success: `Team ${parsed.data.teamNumber} is ready for this event.` };
  } catch { return { error: "Manual-event admin access is required." }; }
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
    return { success: `${event.name} is now the active event.` };
  } catch { return { error: "Admin access is required." }; }
}

export async function generateObjectiveAssignments(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const input = z.object({ eventId: z.string().uuid() }).safeParse({ eventId: formData.get("eventId") });
    if (!input.success) return { error: "This event could not be identified." };
    const { organizationId } = await adminContext();
    const database = createAdminClient();
    const { data: event, error: eventError } = await database.from("events").select("id").eq("id", input.data.eventId).eq("organization_id", organizationId).maybeSingle();
    if (eventError || !event) return { error: "This event is unavailable or you no longer have admin access." };
    const [{ data: scouts, error: scoutsError }, { data: matches, error: matchesError }] = await Promise.all([
      database.from("organization_members").select("user_id").eq("organization_id", organizationId).eq("role", "scout"),
      database.from("matches").select("id,red_teams,blue_teams").eq("event_id", event.id).order("scheduled_at"),
    ]);
    if (scoutsError || matchesError) return { error: "Couldn’t read the schedule or scout roster." };
    if (!scouts?.length) return { error: "Add at least one user with the Scout role before creating assignments." };
    if (!matches?.length) return { error: "Import a match schedule before creating assignments." };
    const { data: existing, error: existingError } = await database.from("scouting_assignments").select("match_id,team_id,assignment_type").eq("assignment_type", "objective").in("match_id", matches.map((match) => match.id));
    if (existingError) return { error: "Couldn’t read existing scouting assignments." };
    const alreadyAssigned = new Set((existing ?? []).map((assignment) => `${assignment.match_id}:${assignment.team_id}:${assignment.assignment_type}`));
    const assignments: { match_id: string; scout_user_id: string; team_id: string; assignment_type: "objective" }[] = [];
    let scoutIndex = 0;
    for (const match of matches ?? []) {
      for (const teamId of [...new Set([...match.red_teams, ...match.blue_teams])]) {
        const key = `${match.id}:${teamId}:objective`;
        if (alreadyAssigned.has(key)) continue;
        assignments.push({ match_id: match.id, scout_user_id: scouts[scoutIndex % scouts.length].user_id, team_id: teamId, assignment_type: "objective" });
        scoutIndex += 1;
      }
    }
    if (!assignments.length) return { success: "Every team in this schedule already has an objective assignment." };
    const { error } = await database.from("scouting_assignments").upsert(assignments, { onConflict: "match_id,scout_user_id,team_id,assignment_type" });
    if (error) return importDatabaseError("scouting assignments", error);
    revalidatePath(`/events/${event.id}/matches`);
    revalidatePath("/scout/assignments");
    revalidatePath("/dashboard");
    return { success: `Created ${assignments.length} objective assignments across the imported schedule.` };
  } catch {
    return { error: "Admin access and the server secret are required to create assignments." };
  }
}

export async function setObjectiveAssignment(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const input = z.object({
      matchId: z.string().uuid(),
      teamId: z.string().uuid(),
      scoutUserId: z.union([z.literal(""), z.string().uuid()]),
    }).safeParse({ matchId: formData.get("matchId"), teamId: formData.get("teamId"), scoutUserId: formData.get("scoutUserId") });
    if (!input.success) return { error: "This assignment could not be identified." };
    const { organizationId } = await adminContext();
    const database = createAdminClient();
    const { data: match, error: matchError } = await database.from("matches").select("id,event_id,red_teams,blue_teams").eq("id", input.data.matchId).maybeSingle();
    if (matchError || !match) return { error: "This match is unavailable." };
    const { data: event, error: eventError } = await database.from("events").select("id").eq("id", match.event_id).eq("organization_id", organizationId).maybeSingle();
    if (eventError || !event || ![...match.red_teams, ...match.blue_teams].includes(input.data.teamId)) return { error: "That team is not scheduled for this match." };
    if (input.data.scoutUserId) {
      const { data: scout, error: scoutError } = await database.from("organization_members").select("user_id").eq("organization_id", organizationId).eq("user_id", input.data.scoutUserId).eq("role", "scout").maybeSingle();
      if (scoutError || !scout) return { error: "Choose a Scout-role user from this organization." };
    }
    const { data: existing, error: existingError } = await database.from("scouting_assignments").select("id,scout_user_id").eq("match_id", match.id).eq("team_id", input.data.teamId).eq("assignment_type", "objective");
    if (existingError) return { error: "Couldn’t read the current assignment." };
    if (existing?.length) {
      const { data: submitted, error: submittedError } = await database.from("match_submissions").select("id").in("assignment_id", existing.map((assignment) => assignment.id)).limit(1);
      if (submittedError) return { error: "Couldn’t check existing submissions." };
      if (submitted?.length) return { error: "This assignment already has a submission and cannot be reassigned." };
    }
    if (input.data.scoutUserId) {
      if (existing?.some((assignment) => assignment.scout_user_id === input.data.scoutUserId)) return { success: "Scout is already assigned." };
      const { error: insertError } = await database.from("scouting_assignments").insert({ match_id: match.id, team_id: input.data.teamId, scout_user_id: input.data.scoutUserId, assignment_type: "objective" });
      if (insertError) return importDatabaseError("the new assignment", insertError);
    } else if (existing?.length) {
      const { error: deleteError } = await database.from("scouting_assignments").delete().in("id", existing.map((assignment) => assignment.id));
      if (deleteError) return importDatabaseError("the previous assignment", deleteError);
    }
    revalidatePath("/admin/assignments");
    revalidatePath(`/events/${match.event_id}/matches`);
    revalidatePath("/scout/assignments");
    revalidatePath("/dashboard");
    return { success: input.data.scoutUserId ? "Scout added to this team." : "All assignments cleared." };
  } catch {
    return { error: "Admin access and the server secret are required to manage assignments." };
  }
}

export async function setPrescoutAssignment(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const input = z.object({
      eventId: z.string().uuid(),
      teamId: z.string().uuid(),
      scoutUserId: z.union([z.literal(""), z.string().uuid()]),
    }).safeParse({ eventId: formData.get("eventId"), teamId: formData.get("teamId"), scoutUserId: formData.get("scoutUserId") });
    if (!input.success) return { error: "This prescout assignment could not be identified." };
    const { organizationId } = await adminContext();
    const database: any = createAdminClient();
    const { data: event } = await database.from("events").select("id,event_key").eq("id", input.data.eventId).eq("organization_id", organizationId).maybeSingle();
    if (!event) return { error: "This event is unavailable." };
    const { data: eventTeam } = await database.from("event_teams").select("team_id").eq("event_id", event.id).eq("team_id", input.data.teamId).maybeSingle();
    if (!eventTeam) return { error: "That team is not part of this event." };
    if (input.data.scoutUserId) {
      const { data: scout } = await database.from("organization_members").select("user_id").eq("organization_id", organizationId).eq("user_id", input.data.scoutUserId).eq("role", "scout").maybeSingle();
      if (!scout) return { error: "Choose a Scout-role user from this organization." };
      const { error } = await database.from("prescout_assignments").upsert({ organization_id: organizationId, event_id: event.id, team_id: input.data.teamId, scout_user_id: input.data.scoutUserId }, { onConflict: "event_id,team_id,scout_user_id" });
      if (error) return { error: "Couldn’t save that prescout assignment." };
    } else {
      const { error } = await database.from("prescout_assignments").delete().eq("event_id", event.id).eq("team_id", input.data.teamId);
      if (error) return { error: "Couldn’t clear those prescout assignments." };
    }
    revalidatePath("/admin/assignments");
    revalidatePath("/scout/pre-scout");
    revalidatePath(`/events/${event.event_key}/teams`);
    return { success: input.data.scoutUserId ? "Scout added to this prescout team." : "Prescout assignments cleared." };
  } catch {
    return { error: "Admin access is required to manage prescout assignments." };
  }
}

export async function publishDefaultForm(_: ActionState): Promise<ActionState> { try { const {supabase,organizationId}=await adminContext(); const {data:latest}=await supabase.from("form_definitions").select("version").eq("organization_id",organizationId).eq("name",DEFAULT_2026_FORM.title).order("version",{ascending:false}).limit(1).maybeSingle();const {error}=await supabase.from("form_definitions").insert({organization_id:organizationId,name:DEFAULT_2026_FORM.title,version:(latest?.version??0)+1,schema_json:DEFAULT_2026_FORM,is_active:true});return error?{error:"Couldn’t publish the form."}:{success:"New form version published."}; }catch{return{error:"Admin access is required."};} }

export async function publishFormDefinition(_: ActionState, formData: FormData): Promise<ActionState> { try { const raw=String(formData.get("schema")??"");let json:unknown;try{json=JSON.parse(raw)}catch{return{error:"The form schema must be valid JSON."};}const form=formDefinitionSchema.safeParse(json);if(!form.success)return{error:"The schema needs a title, game year, and valid field definitions."};const {supabase,organizationId}=await adminContext();const {data:latest}=await supabase.from("form_definitions").select("version").eq("organization_id",organizationId).eq("name",form.data.title).order("version",{ascending:false}).limit(1).maybeSingle();const {error}=await supabase.from("form_definitions").insert({organization_id:organizationId,name:form.data.title,version:(latest?.version??0)+1,schema_json:form.data,is_active:true});return error?{error:"Couldn’t publish the form."}:{success:`Published ${form.data.title} v${(latest?.version??0)+1}.`};}catch{return{error:"Admin access is required."};} }

export async function inviteMember(_: ActionState, formData: FormData): Promise<ActionState> { try {const input=z.object({email:z.string().email().toLowerCase().refine(email=>email.endsWith("@stuypulse.com")),role:organizationRoleSchema}).safeParse({email:formData.get("email"),role:formData.get("role")});if(!input.success)return{error:"Invitees must use a @stuypulse.com email and a valid role."};const {supabase,organizationId}=await adminContext();const admin=createAdminClient();const origin=process.env.NEXT_PUBLIC_SITE_URL??"http://localhost:3000";const {data,error}=await admin.auth.admin.inviteUserByEmail(input.data.email,{redirectTo:`${origin}/auth/callback`});if(error||!data.user)return{error:"Couldn’t send the invitation."};const {error:membershipError}=await supabase.from("organization_members").upsert({organization_id:organizationId,user_id:data.user.id,role:input.data.role});return membershipError?{error:"Invitation sent, but the role assignment failed."}:{success:`Invitation sent to ${input.data.email}.`};}catch{return{error:"Admin access or server secret is required."};} }

export async function setMemberRole(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const input = z.object({ userId: z.string().uuid(), role: organizationRoleSchema }).safeParse({ userId: formData.get("userId"), role: formData.get("role") });
    if (!input.success) return { error: "Choose a valid team role." };
    const { supabase, organizationId } = await adminContext();
    const { data: updated, error } = await supabase.from("organization_members").update({ role: input.data.role }).eq("organization_id", organizationId).eq("user_id", input.data.userId).select("role").maybeSingle();
    if (error || !updated) return { error: "Couldn’t update that role. The final admin account cannot be demoted." };
    revalidatePath("/admin/users"); revalidatePath("/admin/assignments"); revalidatePath("/dashboard");
    return { success: `Role changed to ${updated.role}.` };
  } catch { return { error: "Admin access is required." }; }
}

const tbaEventSchema = z.object({ name: z.string().min(1), start_date: z.string().min(1), end_date: z.string().min(1) });
const tbaTeamSchema = z.object({ key: z.string().regex(/^frc\d+$/), team_number: z.number().int().positive(), nickname: z.string().nullable() });
const tbaMatchSchema = z.object({
  key: z.string().min(1), comp_level: z.string(), match_number: z.number().int().positive(), time: z.number().nullable().optional(), actual_time: z.number().nullable().optional(),
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

function importDatabaseError(stage: string, error: { message: string; code?: string } | null): ActionState {
  console.error(`TBA import database failure at ${stage}`, error);
  const detail = error?.code ? ` (${error.code})` : "";
  return { error: `The import could not save ${stage}${detail}. Check that the latest Supabase migrations have been applied, then try again.` };
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
          scheduled_at: match.time ? new Date(match.time * 1000).toISOString() : null,
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
    return { success: `Synced ${teamCount} teams and ${matchCount} matches from TBA. Unchanged data was kept from the previous sync.` };
  } catch (error) {
    console.error("TBA import failed", error);
    return { error: "The import failed before it could finish. Check the server logs for the exact failure, then try again." };
  }
}
