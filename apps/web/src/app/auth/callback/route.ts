import { createServerClient } from "@supabase/ssr";
import type { NextRequest } from "next/server";
import { isAuthorizedEmail } from "@/lib/auth/authorized-email-server";
import { authRedirect } from "@/lib/auth/redirect-response";
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const next = request.nextUrl.searchParams.get("next");
  if (!code) {
    return authRedirect(request, "/auth/login", undefined, "Google sign-in did not return an authorization code. Please try again.");
  }
  const response = authRedirect(request, next === "/auth/reset-password" ? next : "/scout/match");
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { cookies: { getAll: () => request.cookies.getAll(), setAll: (items) => items.forEach(({name, value, options}) => response.cookies.set(name, value, options)) }});
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return authRedirect(request, "/auth/login", response, next === "/auth/reset-password" ? "That password-reset link is invalid or expired. Request a new one." : "Google sign-in could not be completed. Please try again.");
  }
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email || !await isAuthorizedEmail(user.email)) {
    await supabase.auth.signOut();
    return authRedirect(request, "/auth/login", response, "Use an authorized Google account to access HAL9000.");
  }
  return response;
}
