import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { NextRequest } from "next/server";
import { isAuthorizedEmail } from "@/lib/auth/allowed-email";
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code"); const url = request.nextUrl.clone();
  const next = request.nextUrl.searchParams.get("next");
  url.pathname = next === "/auth/reset-password" ? next : "/scout/match";
  if (!code) {
    url.pathname = "/auth/login";
    url.searchParams.set("error", "Google sign-in did not return an authorization code. Please try again.");
    return NextResponse.redirect(url);
  }
  const response = NextResponse.redirect(url);
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { cookies: { getAll: () => request.cookies.getAll(), setAll: (items) => items.forEach(({name, value, options}) => response.cookies.set(name, value, options)) }});
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/auth/login";
    loginUrl.searchParams.set("error", next === "/auth/reset-password" ? "That password-reset link is invalid or expired. Request a new one." : "Google sign-in could not be completed. Please try again.");
    return NextResponse.redirect(loginUrl);
  }
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email || !isAuthorizedEmail(user.email)) {
    await supabase.auth.signOut();
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/auth/login";
    loginUrl.searchParams.set("error", "Use an authorized Google account to access HAL9000.");
    return NextResponse.redirect(loginUrl);
  }
  return response;
}
