import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getViewerContext } from "@/lib/viewer-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncAllActiveEvents, syncLiveEvent } from "@/lib/tba-live-sync";
import { revalidateEventTeamNavigation } from "@/lib/navigation-data";

export const dynamic = "force-dynamic";

function revalidateLiveEvent(eventKey: string) {
  revalidatePath("/dashboard");
  revalidatePath("/events");
  revalidatePath("/scout/manual");
  revalidatePath(`/events/${eventKey}/matches`);
  revalidatePath(`/events/${eventKey}/teams`);
  revalidatePath(`/events/${eventKey}/summary`);
  revalidatePath(`/events/${eventKey}/compare`);
  revalidatePath(`/events/${eventKey}/picklist`);
}

export async function POST() {
  const viewer = await getViewerContext();
  if (!viewer?.organizationId || !viewer.activeEvent) return NextResponse.json({ error: "No active event is available." }, { status: 401, headers: { "Cache-Control": "private, no-store" } });
  try {
    const result = await syncLiveEvent(viewer.activeEvent.id, viewer.organizationId);
    if (result.updated) {
      revalidateLiveEvent(viewer.activeEvent.event_key);
      revalidateEventTeamNavigation(viewer.activeEvent.id);
    }
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Live TBA sync failed", error);
    return NextResponse.json({ error: "Live official data could not be refreshed." }, { status: 502, headers: { "Cache-Control": "private, no-store" } });
  }
}

/** Supabase Cron invokes this route once a minute while competition data is changing. */
export async function GET(request: Request) {
  const authorization = request.headers.get("authorization");
  const candidate = authorization?.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : "";
  const database: any = createAdminClient();
  const { data: authorized, error: authorizationError } = await database.rpc("verify_live_sync_trigger", { candidate });
  if (authorizationError || authorized !== true) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "private, no-store" } });
  }
  try {
    const results = await syncAllActiveEvents();
    for (const result of results) if (result.updated) {
      revalidateLiveEvent(result.eventKey);
      revalidateEventTeamNavigation(result.eventId);
    }
    return NextResponse.json({ activeEvents: results.length, updatedEvents: results.filter((result) => result.updated).length }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Scheduled live TBA sync failed", error);
    return NextResponse.json({ error: "Live official data could not be refreshed." }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
