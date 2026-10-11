import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAuthorizedEmail as checkEmail } from "./allowed-email";

/** No public allowlist endpoint: pre-login lookups stay on the server. */
export async function isAuthorizedEmail(value: string) {
  return checkEmail(value, async (email) => {
    try {
      const { data, error } = await createAdminClient().from("authorized_emails").select("email").eq("email", email).maybeSingle();
      return !error && Boolean(data);
    } catch {
      return false;
    }
  });
}
