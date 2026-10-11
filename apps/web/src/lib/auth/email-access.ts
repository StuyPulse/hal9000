import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export const canManageEmailAccess = cache(async () => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("can_manage_email_access");
  return !error && data === true;
});
