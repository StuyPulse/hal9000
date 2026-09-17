import Link from "next/link";
import { AppShell, PageHeader } from "@/components/app-shell";
import { GenerateAssignmentsForm } from "@/components/admin-forms";
import { LiveRefresh } from "@/components/live-refresh";
import { ScheduleOfflineCache } from "@/components/schedule-offline-cache";
import { createClient } from "@/lib/supabase/server";
import { getViewerContext, viewerCanManage } from "@/lib/viewer-context";
import { MatchesBoard } from "./matches-board";

export default async function MatchesPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId: eventKey } = await params;
  const [supabase, viewer] = await Promise.all([createClient(), getViewerContext()]);
  const { data: event } = await supabase.from("events").select("id,name,is_manual").eq("event_key", eventKey).maybeSingle();
  const [{ data: matches }, { data: eventTeams }] = await Promise.all([event ? supabase.from("matches").select("id,tba_match_key,match_number,match_type,red_teams,blue_teams,scheduled_at,status,red_score,blue_score").eq("event_id", event.id).order("scheduled_at") : Promise.resolve({ data: [] }), event ? supabase.from("event_teams").select("team_id,teams(team_number,name)").eq("event_id", event.id) : Promise.resolve({ data: [] })]);
  const teams = (eventTeams ?? []).map((row: any) => ({ id: row.team_id, number: row.teams?.team_number, name: row.teams?.name ?? `Team ${row.teams?.team_number}` }));
  const canManage = viewerCanManage(viewer);
  return <AppShell active="Match schedule"><ScheduleOfflineCache path={`/events/${eventKey}/matches`}/><LiveRefresh tables={["matches", "event_teams"]} eventId={event?.id}/><PageHeader eyebrow={event?.name ?? "Event schedule"} title="Match schedule."/>{canManage && event && <section className="card" style={{ marginBottom: 18 }}><div className="card-head"><div><h2>Scout assignments</h2><p className="muted">Assignments auto-fill the same shared match form.</p></div><Link className="button secondary" href={`/admin/assignments?eventId=${event.id}`}>Assignment board</Link></div><GenerateAssignmentsForm eventId={event.id}/></section>}<MatchesBoard matches={(matches ?? []).map((match) => ({ id: match.id, key: match.tba_match_key, number: match.match_number, type: match.match_type, red: match.red_teams, blue: match.blue_teams, scheduledAt: match.scheduled_at, status: match.status, redScore: match.red_score, blueScore: match.blue_score }))} teams={teams} eventId={event?.id ?? ""} isManual={event?.is_manual ?? false} canManage={canManage}/></AppShell>;
}
