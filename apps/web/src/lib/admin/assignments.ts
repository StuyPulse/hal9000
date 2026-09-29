"use server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { adminContext, importDatabaseError, type ActionState } from "@/lib/admin/shared";

const scoutCapableRoles = ["scout", "global_scout", "admin", "developer"] as const;
const rosterIdSchema = z.object({ rosterId: z.string().uuid() });

function revalidateAssignmentRosters() {
  revalidatePath("/admin/assignments");
}

export async function createScoutAssignmentRoster(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const input = z.object({ name: z.string().trim().min(1).max(80) }).safeParse({ name: formData.get("name") });
    if (!input.success) return { error: "Enter a roster name up to 80 characters." };
    const { organizationId } = await adminContext();
    const database: any = createAdminClient();
    const { error } = await database.from("scout_assignment_rosters").insert({ organization_id: organizationId, name: input.data.name });
    if (error?.code === "23505") return { error: "A roster already uses that name." };
    if (error) return importDatabaseError("the scout roster", error);
    revalidateAssignmentRosters();
    return { success: `${input.data.name} is ready for scout assignments.` };
  } catch { return { error: "Admin access is required to create a scout roster." }; }
}

export async function addScoutAssignmentRosterMember(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const input = z.object({ rosterId: z.string().uuid(), userId: z.string().uuid() }).safeParse({ rosterId: formData.get("rosterId"), userId: formData.get("userId") });
    if (!input.success) return { error: "Choose a roster and scout." };
    const { organizationId } = await adminContext();
    const database: any = createAdminClient();
    const [{ data: roster }, { data: scout }] = await Promise.all([
      database.from("scout_assignment_rosters").select("id").eq("id", input.data.rosterId).eq("organization_id", organizationId).maybeSingle(),
      database.from("organization_members").select("user_id").eq("organization_id", organizationId).eq("user_id", input.data.userId).in("role", scoutCapableRoles).maybeSingle(),
    ]);
    if (!roster || !scout) return { error: "Choose a scout-capable member in this organization." };
    const { error } = await database.from("scout_assignment_roster_members").upsert({ roster_id: roster.id, user_id: scout.user_id }, { onConflict: "roster_id,user_id", ignoreDuplicates: true });
    if (error) return importDatabaseError("the scout roster", error);
    revalidateAssignmentRosters();
    return { success: "Scout added to this roster." };
  } catch { return { error: "Admin access is required to update scout rosters." }; }
}

export async function removeScoutAssignmentRosterMember(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const input = z.object({ rosterId: z.string().uuid(), userId: z.string().uuid() }).safeParse({ rosterId: formData.get("rosterId"), userId: formData.get("userId") });
    if (!input.success) return { error: "This roster member could not be identified." };
    const { organizationId } = await adminContext();
    const database: any = createAdminClient();
    const { data: roster } = await database.from("scout_assignment_rosters").select("id").eq("id", input.data.rosterId).eq("organization_id", organizationId).maybeSingle();
    if (!roster) return { error: "This roster is unavailable." };
    const { error } = await database.from("scout_assignment_roster_members").delete().eq("roster_id", roster.id).eq("user_id", input.data.userId);
    if (error) return importDatabaseError("the roster member", error);
    revalidateAssignmentRosters();
    return { success: "Scout removed from this roster." };
  } catch { return { error: "Admin access is required to update scout rosters." }; }
}

export async function deleteScoutAssignmentRoster(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const input = rosterIdSchema.safeParse({ rosterId: formData.get("rosterId") });
    if (!input.success) return { error: "This roster could not be identified." };
    const { organizationId } = await adminContext();
    const database: any = createAdminClient();
    const { error } = await database.from("scout_assignment_rosters").delete().eq("id", input.data.rosterId).eq("organization_id", organizationId);
    if (error) return importDatabaseError("the scout roster", error);
    revalidateAssignmentRosters();
    return { success: "Scout roster deleted." };
  } catch { return { error: "Admin access is required to delete a scout roster." }; }
}

export async function generateObjectiveAssignments(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const input = z.object({ eventId: z.string().uuid(), rosterId: z.string().uuid() }).safeParse({ eventId: formData.get("eventId"), rosterId: formData.get("rosterId") });
    if (!input.success) return { error: "Choose an event and scout roster." };
    const { organizationId } = await adminContext();
    const database = createAdminClient();
    const { data: event, error: eventError } = await database.from("events").select("id").eq("id", input.data.eventId).eq("organization_id", organizationId).maybeSingle();
    if (eventError || !event) return { error: "This event is unavailable or you no longer have admin access." };
    const { data: roster } = await database.from("scout_assignment_rosters").select("id,name").eq("id", input.data.rosterId).eq("organization_id", organizationId).maybeSingle();
    if (!roster) return { error: "Choose a scout roster from this organization." };
    const [{ data: rosterMembers, error: rosterMembersError }, { data: scouts, error: scoutsError }, { data: matches, error: matchesError }] = await Promise.all([
      database.from("scout_assignment_roster_members").select("user_id").eq("roster_id", roster.id),
      database.from("organization_members").select("user_id").eq("organization_id", organizationId).in("role", scoutCapableRoles),
      database.from("matches").select("id,red_teams,blue_teams").eq("event_id", event.id).order("scheduled_at"),
    ]);
    if (rosterMembersError || scoutsError || matchesError) return { error: "Couldn’t read the schedule or scout roster." };
    const rosterUserIds = new Set((rosterMembers ?? []).map((member: any) => member.user_id));
    const selectedScouts = (scouts ?? []).filter((scout: any) => rosterUserIds.has(scout.user_id));
    if (!selectedScouts.length) return { error: `Add at least one scout-capable member to ${roster.name}.` };
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
        assignments.push({ match_id: match.id, scout_user_id: selectedScouts[scoutIndex % selectedScouts.length].user_id, team_id: teamId, assignment_type: "objective" });
        scoutIndex += 1;
      }
    }
    if (!assignments.length) return { success: "Every team in this schedule already has an objective assignment." };
    const { error } = await database.from("scouting_assignments").upsert(assignments, { onConflict: "match_id,scout_user_id,team_id,assignment_type" });
    if (error) return importDatabaseError("scouting assignments", error);
    revalidatePath(`/events/${event.id}/matches`);
    revalidatePath("/scout/assignments");
    revalidatePath("/dashboard");
    return { success: `Created ${assignments.length} objective assignments using ${roster.name}.` };
  } catch {
    return { error: "Admin access and the server secret are required to create assignments." };
  }
}

function revalidateAssignmentPages(event: { id: string; event_key: string }) {
  revalidatePath("/admin/assignments");
  revalidatePath(`/events/${event.event_key}/matches`);
  revalidatePath("/scout/assignments");
  revalidatePath("/scout/pre-scout");
  revalidatePath("/dashboard");
}

export async function clearEventAssignments(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const input = z.object({ eventId: z.string().uuid() }).safeParse({ eventId: formData.get("eventId") });
    if (!input.success) return { error: "This event could not be identified." };
    const { organizationId, userId } = await adminContext();
    const database: any = createAdminClient();
    const { data: event } = await database.from("events").select("id,event_key").eq("id", input.data.eventId).eq("organization_id", organizationId).maybeSingle();
    if (!event) return { error: "This event is unavailable." };
    const { data: matches, error: matchesError } = await database.from("matches").select("id").eq("event_id", event.id);
    if (matchesError) return { error: "Couldn’t load this event’s match schedule." };
    const matchIds = (matches ?? []).map((match: { id: string }) => match.id);
    const [{ data: objectiveAssignments, error: objectiveError }, { data: prescoutAssignments, error: prescoutError }, { data: submittedEntries, error: submittedEntriesError }, { data: legacySubmissions, error: legacySubmissionsError }] = await Promise.all([
      matchIds.length ? database.from("scouting_assignments").select("id,match_id,scout_user_id,team_id,assignment_type,status,created_at,completed_at").eq("assignment_type", "objective").in("match_id", matchIds) : Promise.resolve({ data: [], error: null }),
      database.from("prescout_assignments").select("id,organization_id,event_id,team_id,scout_user_id,created_at").eq("event_id", event.id),
      database.from("scouting_entries").select("assignment_id").eq("event_id", event.id).eq("entry_type", "match").eq("status", "submitted").not("assignment_id", "is", null),
      matchIds.length ? database.from("match_submissions").select("assignment_id").in("match_id", matchIds).not("assignment_id", "is", null) : Promise.resolve({ data: [], error: null }),
    ]);
    if (objectiveError || prescoutError || submittedEntriesError || legacySubmissionsError) return { error: "Couldn’t verify which assignments are safe to clear." };
    const protectedAssignmentIds = new Set([...(submittedEntries ?? []), ...(legacySubmissions ?? [])].map((entry: { assignment_id: string | null }) => entry.assignment_id).filter((id): id is string => Boolean(id)));
    const clearableObjectiveAssignments = (objectiveAssignments ?? []).filter((assignment: any) => assignment.status !== "complete" && !protectedAssignmentIds.has(assignment.id));
    if (!clearableObjectiveAssignments.length && !(prescoutAssignments ?? []).length) return { error: "There are no pending assignments to clear. Submitted and completed assignments are protected." };
    const { data: snapshot, error: snapshotError } = await database.from("assignment_clear_snapshots").insert({ organization_id: organizationId, event_id: event.id, actor_user_id: userId, objective_assignments: clearableObjectiveAssignments, prescout_assignments: prescoutAssignments ?? [] }).select("id").single();
    if (snapshotError || !snapshot) return { error: "Couldn’t create an undo point before clearing assignments." };
    if (clearableObjectiveAssignments.length) {
      const { error } = await database.from("scouting_assignments").delete().in("id", clearableObjectiveAssignments.map((assignment: { id: string }) => assignment.id));
      if (error) return { error: "Couldn’t clear match assignments. Nothing else was removed.", undoSnapshotId: snapshot.id };
    }
    if ((prescoutAssignments ?? []).length) {
      const { error } = await database.from("prescout_assignments").delete().eq("event_id", event.id);
      if (error) return { error: "Match assignments were cleared, but prescout assignments could not be cleared. Use Undo to restore the match assignments.", undoSnapshotId: snapshot.id };
    }
    revalidateAssignmentPages(event);
    return { success: `Cleared ${clearableObjectiveAssignments.length} pending match assignment${clearableObjectiveAssignments.length === 1 ? "" : "s"} and ${(prescoutAssignments ?? []).length} prescout assignment${(prescoutAssignments ?? []).length === 1 ? "" : "s"}. Submitted and completed assignments were preserved.`, undoSnapshotId: snapshot.id };
  } catch {
    return { error: "Admin access is required to clear assignments." };
  }
}

export async function restoreEventAssignments(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const input = z.object({ snapshotId: z.string().uuid() }).safeParse({ snapshotId: formData.get("snapshotId") });
    if (!input.success) return { error: "This undo point could not be identified." };
    const { organizationId } = await adminContext();
    const database: any = createAdminClient();
    const { data: snapshot } = await database.from("assignment_clear_snapshots").select("id,event_id,objective_assignments,prescout_assignments,events(id,event_key)").eq("id", input.data.snapshotId).eq("organization_id", organizationId).is("restored_at", null).maybeSingle();
    if (!snapshot) return { error: "This clear has already been restored or is unavailable." };
    const objectiveAssignments = Array.isArray(snapshot.objective_assignments) ? snapshot.objective_assignments : [];
    const prescoutAssignments = Array.isArray(snapshot.prescout_assignments) ? snapshot.prescout_assignments : [];
    const matchIds = [...new Set(objectiveAssignments.map((assignment: any) => assignment.match_id).filter(Boolean))];
    const { data: existing } = matchIds.length ? await database.from("scouting_assignments").select("match_id,team_id").eq("assignment_type", "objective").in("match_id", matchIds) : { data: [] };
    const occupied = new Set((existing ?? []).map((assignment: any) => `${assignment.match_id}:${assignment.team_id}`));
    const restorableObjectives = objectiveAssignments.filter((assignment: any) => !occupied.has(`${assignment.match_id}:${assignment.team_id}`));
    if (restorableObjectives.length) {
      const { error } = await database.from("scouting_assignments").insert(restorableObjectives.map((assignment: any) => ({ id: assignment.id, match_id: assignment.match_id, scout_user_id: assignment.scout_user_id, team_id: assignment.team_id, assignment_type: assignment.assignment_type, status: assignment.status, created_at: assignment.created_at, completed_at: assignment.completed_at })));
      if (error) return { error: "Couldn’t restore the saved match assignments." };
    }
    if (prescoutAssignments.length) {
      const { error } = await database.from("prescout_assignments").upsert(prescoutAssignments.map((assignment: any) => ({ id: assignment.id, organization_id: assignment.organization_id, event_id: assignment.event_id, team_id: assignment.team_id, scout_user_id: assignment.scout_user_id, created_at: assignment.created_at })), { onConflict: "event_id,team_id,scout_user_id", ignoreDuplicates: true });
      if (error) return { error: "Match assignments were restored, but prescout assignments could not be restored." };
    }
    const { error: markRestoredError } = await database.from("assignment_clear_snapshots").update({ restored_at: new Date().toISOString() }).eq("id", snapshot.id).is("restored_at", null);
    if (markRestoredError) return { error: "Assignments were restored, but the undo point could not be finalized." };
    const event = snapshot.events as { id: string; event_key: string } | null;
    if (event) revalidateAssignmentPages(event);
    const skipped = objectiveAssignments.length - restorableObjectives.length;
    return { success: `Restored ${restorableObjectives.length} match assignment${restorableObjectives.length === 1 ? "" : "s"} and ${prescoutAssignments.length} prescout assignment${prescoutAssignments.length === 1 ? "" : "s"}${skipped ? `; skipped ${skipped} match assignment${skipped === 1 ? "" : "s"} that had been reassigned.` : ""}.` };
  } catch {
    return { error: "Admin access is required to undo an assignment clear." };
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
      const { data: scout, error: scoutError } = await database.from("organization_members").select("user_id").eq("organization_id", organizationId).eq("user_id", input.data.scoutUserId).in("role", ["scout", "global_scout", "admin", "developer"]).maybeSingle();
      if (scoutError || !scout) return { error: "Choose a scout-capable user from this organization." };
    }
    const { data: existing, error: existingError } = await database.from("scouting_assignments").select("id,scout_user_id,status").eq("match_id", match.id).eq("team_id", input.data.teamId).eq("assignment_type", "objective");
    if (existingError) return { error: "Couldn’t read the current assignment." };
    if (existing?.some((assignment) => assignment.status === "complete")) return { error: "This assignment already has a submitted report and cannot be reassigned." };
    if (existing?.length) {
      const [{ data: submitted, error: submittedError }, { data: submittedEntries, error: submittedEntriesError }] = await Promise.all([
        database.from("match_submissions").select("id").in("assignment_id", existing.map((assignment) => assignment.id)).limit(1),
        database.from("scouting_entries").select("id").in("assignment_id", existing.map((assignment) => assignment.id)).eq("status", "submitted").limit(1),
      ]);
      if (submittedError || submittedEntriesError) return { error: "Couldn’t check existing submissions." };
      if (submitted?.length || submittedEntries?.length) return { error: "This assignment already has a submission and cannot be reassigned." };
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
    return { success: input.data.scoutUserId ? existing?.length ? "Scout added to this team." : "Scout assigned to this team." : "Assignment cleared." };
  } catch {
    return { error: "Admin access and the server secret are required to manage assignments." };
  }
}

export async function removeObjectiveAssignment(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const input = z.object({ matchId: z.string().uuid(), teamId: z.string().uuid(), scoutUserId: z.string().uuid() }).safeParse({ matchId: formData.get("matchId"), teamId: formData.get("teamId"), scoutUserId: formData.get("scoutUserId") });
    if (!input.success) return { error: "This assignment could not be identified." };
    const { organizationId } = await adminContext();
    const database = createAdminClient();
    const { data: match } = await database.from("matches").select("id,event_id,red_teams,blue_teams").eq("id", input.data.matchId).maybeSingle();
    if (!match || ![...match.red_teams, ...match.blue_teams].includes(input.data.teamId)) return { error: "That team is not scheduled for this match." };
    const { data: event } = await database.from("events").select("id,event_key").eq("id", match.event_id).eq("organization_id", organizationId).maybeSingle();
    if (!event) return { error: "This event is unavailable." };
    const { data: assignment, error: assignmentError } = await database.from("scouting_assignments").select("id,status").eq("match_id", match.id).eq("team_id", input.data.teamId).eq("scout_user_id", input.data.scoutUserId).eq("assignment_type", "objective").maybeSingle();
    if (assignmentError || !assignment) return { error: "That scout is no longer assigned to this team." };
    if (assignment.status === "complete") return { error: "Submitted assignments stay assigned." };
    const [{ data: submitted }, { data: submittedEntry }] = await Promise.all([
      database.from("match_submissions").select("id").eq("assignment_id", assignment.id).limit(1),
      database.from("scouting_entries").select("id").eq("assignment_id", assignment.id).eq("status", "submitted").limit(1),
    ]);
    if (submitted?.length || submittedEntry?.length) return { error: "Submitted assignments stay assigned." };
    const { error } = await database.from("scouting_assignments").delete().eq("id", assignment.id);
    if (error) return importDatabaseError("the assignment", error);
    revalidatePath("/admin/assignments"); revalidatePath(`/events/${event.event_key}/matches`); revalidatePath("/scout/assignments"); revalidatePath("/dashboard");
    return { success: "Scout removed from this team." };
  } catch { return { error: "Admin access is required to remove an assignment." }; }
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
      const { data: scout } = await database.from("organization_members").select("user_id").eq("organization_id", organizationId).eq("user_id", input.data.scoutUserId).in("role", ["scout", "global_scout", "admin", "developer"]).maybeSingle();
      if (!scout) return { error: "Choose a scout-capable user from this organization." };
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

export async function removePrescoutAssignment(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const input = z.object({ eventId: z.string().uuid(), teamId: z.string().uuid(), scoutUserId: z.string().uuid() }).safeParse({ eventId: formData.get("eventId"), teamId: formData.get("teamId"), scoutUserId: formData.get("scoutUserId") });
    if (!input.success) return { error: "This prescout assignment could not be identified." };
    const { organizationId } = await adminContext();
    const database: any = createAdminClient();
    const { data: event } = await database.from("events").select("id,event_key").eq("id", input.data.eventId).eq("organization_id", organizationId).maybeSingle();
    if (!event) return { error: "This event is unavailable." };
    const { data: submitted } = await database.from("scouting_entries").select("id").eq("event_id", event.id).eq("team_id", input.data.teamId).eq("scout_user_id", input.data.scoutUserId).eq("entry_type", "pre_scout").eq("status", "submitted").limit(1);
    if (submitted?.length) return { error: "Submitted prescout assignments stay assigned." };
    const { error } = await database.from("prescout_assignments").delete().eq("event_id", event.id).eq("team_id", input.data.teamId).eq("scout_user_id", input.data.scoutUserId);
    if (error) return { error: "Couldn’t remove that prescout assignment." };
    revalidatePath("/admin/assignments"); revalidatePath("/scout/pre-scout"); revalidatePath(`/events/${event.event_key}/teams`);
    return { success: "Scout removed from this prescout team." };
  } catch { return { error: "Admin access is required to remove a prescout assignment." }; }
}

