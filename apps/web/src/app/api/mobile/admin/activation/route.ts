import { z } from "zod";
import { body, protectedOperation } from "@/lib/mobile/http";
import { requireManager } from "@/lib/mobile/admin-operations";
import { mobileUserClient } from "@/lib/mobile/user-client";
import { MobileError, scopedEvent } from "@/lib/mobile/operations";

export async function POST(request: Request) {
  return protectedOperation(request, async (database, actor) => {
    requireManager(actor);
    const input = z.object({ eventId: z.string().uuid() }).strict().parse(await body(request));
    await scopedEvent(database, actor, input.eventId);
    const result = await mobileUserClient(request).rpc("mobile_activate_event", { target_event_id: input.eventId });
    if (result.error) throw new MobileError(503, "activation_unavailable", "Transactional event activation is unavailable. The mobile database migration must be deployed first.");
    return { activeEventId: result.data };
  });
}
