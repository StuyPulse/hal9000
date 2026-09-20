import { AppShell, PageHeader } from "@/components/app-shell";
import { getActiveEvent } from "@/lib/active-event";
import { createClient } from "@/lib/supabase/server";
import { ManualMatchPicker } from "./manual-match-picker";
import { MatchScoutPicker } from "./match-scout-picker";
import { ScheduleOfflineCache } from "@/components/schedule-offline-cache";

export default async function MatchScoutPage({ searchParams }: { searchParams: Promise<{ match?: string }> }) {
  const { match: requestedMatchId } = await searchParams;
  const event = await getActiveEvent();
  const supabase = await createClient();
  const [{ data: matches }, { data: eventTeams }] = event ? await Promise.all([
    supabase.from("matches").select("id,tba_match_key,match_number,match_type,status,red_teams,blue_teams").eq("event_id", event.id).order("scheduled_at"),
    supabase.from("event_teams").select("team_id,teams(team_number,name)").eq("event_id", event.id),
  ]) : [{ data: [] }, { data: [] }];
  const teams = (eventTeams ?? []).map((row: any) => ({ id: row.team_id, number: row.teams?.team_number, name: row.teams?.name })).sort((a, b) => a.number - b.number);

  return <AppShell active="Manual scouting">
    <ScheduleOfflineCache path="/scout/match"/>
    <PageHeader eyebrow={event?.name ?? "No active event"} title="Match scouting." />
    {event ? <div className="match-scout-grid">
      <MatchScoutPicker matches={(matches ?? []).map((match) => ({ id: match.id, key: match.tba_match_key, number: match.match_number, type: match.match_type, status: match.status, red: match.red_teams, blue: match.blue_teams }))} teams={teams} initialMatchId={(matches ?? []).some((match) => match.id === requestedMatchId) ? requestedMatchId : ""} />
      <ManualMatchPicker teams={teams} />
    </div> : <section className="card"><p className="muted">Set an active event first.</p></section>}
  </AppShell>;
}
