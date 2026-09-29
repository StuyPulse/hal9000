"use server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { getViewerContext, viewerCanManage } from "@/lib/viewer-context";
import { type ActionState } from "@/lib/admin/shared";

export async function deleteScoutingEntry(_: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const input = z.object({ entryId: z.string().uuid() }).safeParse({ entryId: formData.get("entryId") });
    if (!input.success) return { error: "This submission could not be identified." };

    const viewer = await getViewerContext();
    if (!viewer?.organizationId) return { error: "Sign in again before deleting this submission." };
    const organizationId = viewer.organizationId;
    const database: any = createAdminClient();
    const { data: entry, error: entryError } = await database
      .from("scouting_entries")
      .select("id,organization_id,event_id,match_id,team_id,scout_user_id,assignment_id,entry_type")
      .eq("id", input.data.entryId)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (entryError || !entry) return { error: "This submission is unavailable or you no longer have access." };
    if (entry.scout_user_id !== viewer.userId && !viewerCanManage(viewer)) return { error: "You can only delete your own submissions." };

    const { error: deleteError } = await database
      .from("scouting_entries")
      .delete()
      .eq("id", entry.id)
      .eq("organization_id", organizationId);
    if (deleteError) return { error: "Couldn’t delete this submission." };

    if (entry.assignment_id && entry.entry_type === "match" && entry.match_id) {
      const { data: remaining, error: remainingError } = await database
        .from("scouting_entries")
        .select("id")
        .eq("organization_id", organizationId)
        .eq("entry_type", "match")
        .eq("status", "submitted")
        .eq("match_id", entry.match_id)
        .eq("team_id", entry.team_id)
        .eq("scout_user_id", entry.scout_user_id)
        .limit(1);
      if (remainingError) return { error: "Submission deleted, but the matching assignment could not be checked." };
      if (!remaining?.length) {
        const { error: assignmentError } = await database
          .from("scouting_assignments")
          .update({ status: "pending", completed_at: null })
          .eq("id", entry.assignment_id)
          .eq("scout_user_id", entry.scout_user_id)
          .eq("match_id", entry.match_id)
          .eq("team_id", entry.team_id);
        if (assignmentError) return { error: "Submission deleted, but the matching assignment could not be reopened." };
      }
    }

    revalidatePath("/submissions");
    revalidatePath(`/submissions/${entry.id}`);
    revalidatePath("/dashboard");
    revalidatePath("/admin/assignments");
    revalidatePath("/scout/match");
    return { success: "Submission deleted." };
  } catch {
    return { error: "Couldn’t verify permission to delete this submission." };
  }
}

