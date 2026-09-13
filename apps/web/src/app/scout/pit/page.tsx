import { AppShell, PageHeader } from "@/components/app-shell";
import { PitPhotoUpload } from "@/components/pit-photo-upload";
import { getActiveEvent } from "@/lib/active-event";
import { createClient } from "@/lib/supabase/server";
import { ManualScouting } from "../manual/manual-scouting";

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

  return <AppShell active="Pit scouting"><PageHeader eyebrow={event?.name ?? "No active event"} title="Pit scouting."/>{event ? <><section className="card pit-photo-coverage"><div className="card-head"><div><h2>Pit-photo coverage</h2><p className="muted">{photographed} of {teams.length} teams have at least one pit photo.</p></div>{missing.length > 0 && <span className="tag pending">{missing.length} remaining</span>}</div>{missing.length ? <div className="pit-photo-missing"><p>Teams still needing a pit photo</p><div className="pit-photo-missing-list">{missing.map((team) => <span key={team.id}><strong>{team.number}</strong><small>{team.name}</small></span>)}</div></div> : <div className="pit-photo-complete" role="status"><span aria-hidden="true">✓</span><div><strong>Every team has a pit photo.</strong><p>Coverage complete — great work, PulseCrew.</p></div></div>}</section><ManualScouting eventId={event.id} teams={teams} type="pit"/><PitPhotoUpload eventId={event.id} teams={teams}/></> : <section className="card"><p className="muted">Set an active event first.</p></section>}</AppShell>;
}
