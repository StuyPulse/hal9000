"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getViewerContext, viewerCanManage } from "@/lib/viewer-context";

const inputSchema = z.object({
  entryId: z.string().uuid(),
  payload: z.record(z.string(), z.unknown()),
});

/**
 * Updates only the report body for an existing match report. The original
 * report identity (event, match, team, assignment, and scout) stays fixed.
 */
export async function updateMatchScoutingEntry(input: z.input<typeof inputSchema>): Promise<{ error?: string }> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { error: "That scouting report is not valid." };

  const viewer = await getViewerContext();
  if (!viewer?.organizationId) return { error: "Sign in again before editing this report." };

  const database: any = createAdminClient();
  const { data: entry } = await database
    .from("scouting_entries")
    .select("id,organization_id,event_id,team_id,match_id,scout_user_id,entry_type,status")
    .eq("id", parsed.data.entryId)
    .maybeSingle();

  if (!entry || entry.organization_id !== viewer.organizationId || entry.entry_type !== "match") {
    return { error: "That match report is no longer available." };
  }

  const canEdit = entry.scout_user_id === viewer.userId || viewerCanManage(viewer);
  if (!canEdit) return { error: "You can only edit your own scouting reports." };

  const { error } = await database
    .from("scouting_entries")
    .update({ payload: parsed.data.payload, status: "submitted" })
    .eq("id", entry.id);
  if (error) return { error: "Could not save your changes. Check your connection and try again." };

  revalidatePath(`/submissions/${entry.id}`);
  revalidatePath("/submissions");
  return {};
}
