"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const drivetrainTypes = ["", "Swerve", "Tank"] as const;
const shooterTypes = ["", "Single Turret", "Single Fixed Shooter", "Double Wide Shooter", "Dumper", "No Shooter", "Triple Wide Shooter", "Dual Fixed Shooters", "Double Turret"] as const;
const inputSchema = z.object({ eventId: z.string().uuid(), eventKey: z.string().min(1).max(80), teamId: z.string().uuid(), teamNumber: z.number().int().positive(), drivetrainType: z.enum(drivetrainTypes), shooterType: z.enum(shooterTypes) });

export async function saveTeamRobotProfile(input: z.input<typeof inputSchema>): Promise<{ error?: string }> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { error: "Those robot details are not valid." };

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = typeof claims?.claims?.sub === "string" ? claims.claims.sub : null;
  if (!userId) return { error: "Sign in again before saving." };

  const database: any = createAdminClient();
  const { data: event } = await database.from("events").select("id,event_key,organization_id").eq("id", parsed.data.eventId).maybeSingle();
  if (!event || event.event_key !== parsed.data.eventKey) return { error: "That event is not available to your organization." };

  const { data: membership } = await database.from("organization_members").select("organization_id").eq("user_id", userId).eq("organization_id", event.organization_id).maybeSingle();
  if (!membership) return { error: "Your organization membership could not be verified." };

  const { error } = await database.from("event_teams").update({ drivetrain_type: parsed.data.drivetrainType || null, shooter_type: parsed.data.shooterType || null }).eq("event_id", event.id).eq("team_id", parsed.data.teamId);
  if (error) return { error: "Could not save the robot profile. Try again." };
  revalidatePath(`/events/${event.event_key}/teams/${parsed.data.teamNumber}`);
  revalidatePath(`/events/${event.event_key}/teams`);
  return {};
}
