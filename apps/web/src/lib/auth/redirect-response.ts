import { NextResponse, type NextRequest } from "next/server";

/** Keep refreshed/cleared session cookies while removing one-time auth codes. */
export function authRedirect(request: NextRequest, path: string, source?: NextResponse, error?: string) {
  const url = request.nextUrl.clone();
  url.pathname = path;
  url.search = "";
  if (error) url.searchParams.set("error", error);
  const response = NextResponse.redirect(url);
  for (const cookie of source?.cookies.getAll() ?? []) response.cookies.set(cookie);
  return response;
}
