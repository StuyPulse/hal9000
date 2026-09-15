import { notFound } from "next/navigation";
import { AppShell, PageHeader } from "@/components/app-shell";
import { createClient } from "@/lib/supabase/server";
import { RebuiltMatchForm } from "./rebuilt-match-form";
import { getViewerContext } from "@/lib/viewer-context";
import { matchLabel } from "@/lib/match-label";

export default async function ScoutMatchPage({ params, searchParams }: { params: Promise<{ matchId: string }>; searchParams: Promise<{ assignment?: string; team?: string }> }) {
  const { matchId } = await params;
  const { assignment, team: requestedTeamId } = await searchParams;
  const [viewer, supabase] = await Promise.all([getViewerContext(), createClient()]);
  const { data: match } = await supabase.from("matches").select("id,event_id,match_number,match_type,tba_match_key,red_teams,blue_teams").eq("id", matchId).maybeSingle();
  if (!match) notFound();
  const { data: assignmentRow } = viewer && assignment ? await supabase.from("scouting_assignments").select("id,team_id,teams(team_number,name)").eq("id", assignment).eq("match_id", matchId).eq("scout_user_id", viewer.userId).maybeSingle() : { data: null };
  const { data: manualTeam } = !assignmentRow && requestedTeamId ? await supabase.from("event_teams").select("team_id,teams(team_number,name)").eq("event_id",match.event_id).eq("team_id",requestedTeamId).maybeSingle() : { data: null };
  const selectedTeamId=assignmentRow?.team_id??manualTeam?.team_id;
  if (!selectedTeamId || ![...match.red_teams,...match.blue_teams].includes(selectedTeamId)) return <AppShell active="Manual scouting"><PageHeader eyebrow="Scout workspace" title="Choose a match and team." /><div className="card"><p className="muted">Open the match scouting page and choose a scheduled team. Assignments automatically prefill this same form.</p></div></AppShell>;
  const team = (assignmentRow?.teams??manualTeam?.teams) as unknown as { team_number: number; name: string } | null;
  const { data: eventTeams } = await supabase.from("event_teams").select("team_id,teams(team_number)").eq("event_id", match.event_id);
  const teamNumbers = new Map((eventTeams ?? []).map((row:any)=>[row.team_id,row.teams?.team_number]));
  const red = match.red_teams.includes(selectedTeamId);
  const others = (red ? match.blue_teams : match.red_teams).map((id: string) => ({ id, number: teamNumbers.get(id) ?? 0, alliance: red ? "blue" as const : "red" as const }));
  return <AppShell active={assignmentRow?"My assignments":"Manual scouting"}><div className="match-page-header"><PageHeader eyebrow={`${matchLabel(match)} · ${red ? "Red" : "Blue"} alliance`} title={`${team?.team_number} · ${team?.name}`} /></div><RebuiltMatchForm eventId={match.event_id} matchId={match.id} teamId={selectedTeamId} assignmentId={assignmentRow?.id} alliance={red?"red":"blue"} otherTeams={others}/></AppShell>;
}
