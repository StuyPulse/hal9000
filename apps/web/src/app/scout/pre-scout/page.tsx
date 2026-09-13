import { AppShell, PageHeader } from "@/components/app-shell";
import { getActiveEvent } from "@/lib/active-event";
import { createClient } from "@/lib/supabase/server";
import { ManualScouting } from "../manual/manual-scouting";

export default async function PreScoutPage() {
  const [event, supabase] = await Promise.all([getActiveEvent(), createClient()]);
  const { data: eventTeams } = event
    ? await supabase.from("event_teams").select("team_id,teams(team_number,name)").eq("event_id", event.id)
    : { data: [] };
  const teams = (eventTeams ?? []).map((row: any) => ({ id: row.team_id, number: row.teams?.team_number, name: row.teams?.name }));
  return <AppShell active="Pre scouting"><PageHeader eyebrow={event?.name ?? "No active event"} title="Pre scouting."/>{event ? <ManualScouting eventId={event.id} teams={teams} type="pre_scout"/> : <section className="card"><p className="muted">Set an active event first.</p></section>}</AppShell>;
}
