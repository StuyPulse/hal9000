import { createClient } from "@supabase/supabase-js";

/** JWT-scoped client for RPCs whose authorization depends on auth.uid(). */
export function mobileUserClient(request: Request) {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: request.headers.get("authorization")! } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
