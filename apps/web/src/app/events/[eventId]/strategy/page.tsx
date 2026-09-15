import { AppShell, PageHeader } from "@/components/app-shell";
import { LiveRefresh } from "@/components/live-refresh";
import { calculateScoutStats } from "@/lib/scouting-stats";
import { createClient } from "@/lib/supabase/server";
import { MatchStrategyPanel } from "./match-strategy-panel";

export default async function MatchStrategyPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId: eventKey } = await params;
  const supabase = await createClient();
  const { data: event } = await supabase.from("events").select("id,name").eq("event_key", eventKey).maybeSingle();
  if (!event) return <AppShell active="Match strategy"><PageHeader eyebrow="Match strategy" title="Event unavailable."/><section className="card"><p className="muted">This event could not be found.</p></section></AppShell>;
  const [{ data: matches }, { data: eventTeams }, { data: entries }] = await Promise.all([
    supabase.from("matches").select("id,tba_match_key,match_number,match_type,scheduled_at,status,red_teams,blue_teams").eq("event_id", event.id).order("scheduled_at", { nullsFirst: false }).order("match_number"),
    supabase.from("event_teams").select("team_id,teams(team_number,name)").eq("event_id", event.id),
    (supabase as any).from("scouting_entries").select("team_id,payload").eq("event_id", event.id).eq("entry_type", "match").eq("status", "submitted"),
  ]);
  const teams = (eventTeams ?? []).map((link: any) => ({ id: link.team_id, number: link.teams?.team_number ?? 0, name: link.teams?.name ?? "Unknown team", stats: calculateScoutStats((entries ?? []).filter((entry: any) => entry.team_id === link.team_id)) })).sort((left, right) => left.number - right.number);
  const scheduledMatches = (matches ?? []).map((match: any) => ({ id: match.id, key: match.tba_match_key, number: match.match_number, type: match.match_type, scheduledAt: match.scheduled_at, status: match.status, red: match.red_teams ?? [], blue: match.blue_teams ?? [] }));
  return <AppShell active="Match strategy"><LiveRefresh tables={["matches", "event_teams", "scouting_entries"]} eventId={event.id}/><PageHeader eyebrow={event.name} title="Match strategy."/><section className="card strategy-card"><div className="card-head"><div><h2>Alliance strategy mat</h2><p className="muted">Six live scouting summaries placed where each robot starts the match.</p></div></div><MatchStrategyPanel matches={scheduledMatches} teams={teams}/></section></AppShell>;
}
