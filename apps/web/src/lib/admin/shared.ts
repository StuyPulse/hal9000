import { createClient } from "@/lib/supabase/server";

export type ActionState = { error?: string; success?: string; undoSnapshotId?: string };
export async function adminContext() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Sign in required.");
  const { data: member } = await supabase.from("organization_members").select("organization_id, role").eq("user_id", user.id).in("role", ["admin", "developer"]).limit(1).maybeSingle();
  if (!member) throw new Error("Admin access required.");
  return { supabase, organizationId: member.organization_id, userId: user.id };
}

export function importDatabaseError(stage: string, error: { message: string; code?: string } | null): ActionState {
  console.error(`TBA import database failure at ${stage}`, error);
  const detail = error?.code ? ` (${error.code})` : "";
  return { error: `The import could not save ${stage}${detail}. Check that the latest Supabase migrations have been applied, then try again.` };
}
