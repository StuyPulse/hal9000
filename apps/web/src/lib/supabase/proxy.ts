import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { authRedirect } from "@/lib/auth/redirect-response";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const path = request.nextUrl.pathname;
  // The scheduler endpoint authenticates with its Vault-backed secret inside
  // the route; it must reach the route before browser-session enforcement.
  const isPublicPath = path.startsWith("/auth") || path.startsWith("/demo") || path === "/privacy" || path === "/terms" || path === "/api/live-event/sync" || path.startsWith("/api/mobile/");
  if (isPublicPath && path !== "/auth/login") return response;
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims && !isPublicPath) {
    return authRedirect(request, "/auth/login", response);
  }
  if (claims && path === "/auth/login") {
    return authRedirect(request, "/scout/match", response);
  }
  return response;
}
