import { z } from "zod";
import { body, protectedOperation } from "@/lib/mobile/http";
import { MobileError, scopedEvent } from "@/lib/mobile/operations";

const schema = z.object({ eventId: z.string().uuid(), teamId: z.string().uuid(),
  drivetrain_type: z.enum(["", "Swerve", "Tank"]).nullable(),
  shooter_type: z.enum(["", "Single Turret", "Single Fixed Shooter", "Double Wide Shooter", "Dumper", "No Shooter", "Triple Wide Shooter", "Dual Fixed Shooters", "Double Turret"]).nullable(),
}).strict();
export async function PATCH(request: Request) {
  return protectedOperation(request, async (database, actor) => {
    const input = schema.parse(await body(request));
    await scopedEvent(database, actor, input.eventId);
    // The website explicitly allows any verified organization member to edit
    // this team/event metadata, unlike the direct table's admin-only RLS.
    const result = await database.from("event_teams").update({ drivetrain_type: input.drivetrain_type || null, shooter_type: input.shooter_type || null }).eq("event_id", input.eventId).eq("team_id", input.teamId).select("team_id,drivetrain_type,shooter_type").maybeSingle();
    if (result.error) throw new MobileError(503, "robot_profile_update_failed", "This robot profile could not be saved.");
    if (!result.data) throw new MobileError(404, "team_unavailable", "This team is not in the selected event.");
    return { profile: result.data };
  });
}
