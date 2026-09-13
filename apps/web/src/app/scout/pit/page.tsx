import { AppShell, PageHeader } from "@/components/app-shell";
import { getActiveEvent } from "@/lib/active-event";
import { createClient } from "@/lib/supabase/server";
import { PitScoutingTabs } from "./pit-scouting-tabs";

export default async function PitPage() {
  const event = await getActiveEvent();
  const supabase = await createClient();
  const [{ data: eventTeams }, { data: photos }] = event ? await Promise.all([
    supabase.from("event_teams").select("team_id,teams(team_number,name)").eq("event_id", event.id),
    supabase.from("pit_photos").select("team_id").eq("event_id", event.id),
  ]) : [{ data: [] }, { data: [] }];
  const teams = (eventTeams ?? []).map((row: any) => ({ id: row.team_id, number: row.teams?.team_number, name: row.teams?.name })).sort((left, right) => left.number - right.number);
  const photographedTeamIds = new Set((photos ?? []).map((photo: any) => photo.team_id));
  const missing = teams.filter((team) => !photographedTeamIds.has(team.id));
  const photographed = teams.length - missing.length;

  return <AppShell active="Pit scouting"><PageHeader eyebrow={event?.name ?? "No active event"} title="Pit scouting."/>{event ? <PitScoutingTabs eventId={event.id} teams={teams} missing={missing} photographed={photographed}/> : <section className="card"><p className="muted">Set an active event first.</p></section>}</AppShell>;
}
