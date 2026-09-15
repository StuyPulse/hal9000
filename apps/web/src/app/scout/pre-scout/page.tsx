import { AppShell, PageHeader } from "@/components/app-shell";
import { createClient } from "@/lib/supabase/server";
import { ManualScouting } from "../manual/manual-scouting";

export default async function PreScoutPage() {
  const supabase = await createClient();
  const { data: event } = await supabase
    .from("events")
    .select("id,name,event_key")
    .eq("event_key", "2026cc")
    .maybeSingle();
  const { data: eventTeams } = event
    ? await supabase.from("event_teams").select("team_id,teams(team_number,name)").eq("event_id", event.id)
    : { data: [] };
  const teams = (eventTeams ?? []).map((row: any) => ({ id: row.team_id, number: row.teams?.team_number, name: row.teams?.name }));
  return <AppShell active="Pre scouting"><PageHeader eyebrow={event?.name ?? "Chezy Champs unavailable"} title="Pre scouting."/>{event ? <ManualScouting eventId={event.id} teams={teams} type="pre_scout"/> : <section className="card"><p className="muted">Chezy Champs must be imported before pre scouting can begin.</p></section>}</AppShell>;
}
