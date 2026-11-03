import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";
// The service worker must install for signed-out visitors too and must never be redirected,
// or offline support silently disappears.
export async function proxy(request: NextRequest) { return updateSession(request); }
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|sw\\.js$|manifest\\.webmanifest$|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"] };
