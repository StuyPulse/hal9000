import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { tbaTeamRemapsSchema } from "./tba-team-remaps-schema";
import { type TbaTeamRemaps } from "@/lib/tba-team-identity";

/** Read saved aliases under the viewer's existing event RLS permissions. */
export const getEventTeamRemaps = cache(async (eventId: string | null | undefined): Promise<TbaTeamRemaps> => {
  if (!eventId) return {};
  const database = await createClient();
  const { data, error } = await database.from("events").select("tba_team_remaps").eq("id", eventId).maybeSingle();
  if (error) throw new Error("Could not load event team labels.");
  return tbaTeamRemapsSchema.parse(data?.tba_team_remaps ?? {});
});
