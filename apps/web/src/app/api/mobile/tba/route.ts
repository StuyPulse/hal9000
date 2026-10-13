import { protectedOperation } from "@/lib/mobile/http";
import { scopedEvent } from "@/lib/mobile/operations";
import { fetchTbaRankings } from "@/lib/tba-event-stats";
import { mobileUserClient } from "@/lib/mobile/user-client";
import { MobileError } from "@/lib/mobile/operations";

export async function GET(request: Request) {
  return protectedOperation(request, async (database, actor) => {
    const event = await scopedEvent(database, actor, new URL(request.url).searchParams.get("eventId") ?? "");
    const visible = await mobileUserClient(request).from("events").select("id").eq("id", event.id).maybeSingle();
    if (visible.error || !visible.data) throw new MobileError(404, "event_unavailable", "This event is unavailable to your account.");
    // Keys come from the verified event, never an arbitrary client URL/path.
    if (!/^[a-z0-9_-]{1,100}$/i.test(event.event_key ?? "")) return { rankings: [], sortInfo: [], oprs: {}, apiError: "This event has no usable TBA key." };
    return fetchTbaRankings(event.event_key, event.tba_team_remaps ?? {});
  });
}
