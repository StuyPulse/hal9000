"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getViewerContext, viewerCanManage } from "@/lib/viewer-context";

const inputSchema = z.object({
  entryId: z.string().uuid(),
  payload: z.record(z.string(), z.unknown()),
  teamId: z.string().uuid().optional(),
  matchId: z.string().uuid().nullable().optional(),
});

/**
 * Scheduled reports keep their identity fixed. Manual reports can correct
 * their team and then attach to the matching scheduled slot when one exists.
 */
export async function updateMatchScoutingEntry(input: z.input<typeof inputSchema>): Promise<{ error?: string }> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { error: "That scouting report is not valid." };

  const viewer = await getViewerContext();
  if (!viewer?.organizationId) return { error: "Sign in again before editing this report." };

  const database: any = createAdminClient();
  const { data: entry } = await database
    .from("scouting_entries")
    .select("id,organization_id,event_id,team_id,match_id,scout_user_id,entry_type,status,payload")
    .eq("id", parsed.data.entryId)
    .maybeSingle();

  if (!entry || entry.organization_id !== viewer.organizationId || entry.entry_type !== "match") {
    return { error: "That match report is no longer available." };
  }

  const canEdit = entry.scout_user_id === viewer.userId || viewerCanManage(viewer);
  if (!canEdit) return { error: "You can only edit your own scouting reports." };

  const hasManualMatch = entry.payload?.manual_match && typeof entry.payload.manual_match === "object" && !Array.isArray(entry.payload.manual_match);
  const changingIdentity = parsed.data.teamId !== undefined || parsed.data.matchId !== undefined;
  if (changingIdentity && !hasManualMatch) return { error: "Only manual match reports can change teams." };

  const teamId = parsed.data.teamId ?? entry.team_id;
  const matchId = parsed.data.matchId === undefined ? entry.match_id : parsed.data.matchId;
  if (changingIdentity) {
    const { data: eventTeam } = await database.from("event_teams").select("team_id").eq("event_id", entry.event_id).eq("team_id", teamId).maybeSingle();
    if (!eventTeam) return { error: "Choose a team in this event." };
    if (matchId) {
      const { data: match } = await database.from("matches").select("id,red_teams,blue_teams").eq("id", matchId).eq("event_id", entry.event_id).maybeSingle();
      if (!match || ![...(match.red_teams ?? []), ...(match.blue_teams ?? [])].includes(teamId)) return { error: "That team is not scheduled in the selected match." };
    }
  }

  const { error } = await database
    .from("scouting_entries")
    .update({ payload: parsed.data.payload, team_id: teamId, match_id: matchId, status: "submitted" })
    .eq("id", entry.id);
  if (error) return { error: "Could not save your changes. Check your connection and try again." };

  revalidatePath(`/submissions/${entry.id}`);
  revalidatePath("/submissions");
  return {};
}
