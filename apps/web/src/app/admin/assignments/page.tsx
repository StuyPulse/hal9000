import Link from "next/link";
import { AppShell, PageHeader } from "@/components/app-shell";
import { AssignmentEditor, GenerateAssignmentsForm, PrescoutAssignmentEditor } from "@/components/admin-forms";
import { LocalDateTime } from "@/components/local-date-time";
import { AppSelect } from "@/components/app-select";
import { getActiveEvent } from "@/lib/active-event";
import { createClient } from "@/lib/supabase/server";
import { matchLabel } from "@/lib/match-label";

type PageProps = { searchParams: Promise<{ eventId?: string }> };
export default async function AssignmentBoardPage({ searchParams }: PageProps) {
  const { eventId: requestedEventId } = await searchParams;
  const [supabase, viewerActiveEvent] = await Promise.all([createClient(), getActiveEvent()]);
  const { data: { user } } = await supabase.auth.getUser();
  const { data: membership } = user ? await supabase.from("organization_members").select("organization_id").eq("user_id", user.id).in("role", ["admin", "developer"]).limit(1).maybeSingle() : { data: null };
  if (!membership) return <AppShell active="Assignments"><PageHeader eyebrow="Administration" title="Assignments."/><section className="card"><p className="muted">Admin access is required to manage scout assignments.</p></section></AppShell>;
  const { data: events } = await supabase.from("events").select("id,name,event_key,starts_at").eq("organization_id", membership.organization_id).order("starts_at", { ascending: false });
  const activeEventId = events?.some((event) => event.id === requestedEventId)
    ? requestedEventId!
    : events?.some((event) => event.id === viewerActiveEvent?.id)
      ? viewerActiveEvent!.id
      : events?.[0]?.id;
  if (!activeEventId) return <AppShell active="Assignments"><PageHeader eyebrow="Administration" title="Assignments."/><section className="card"><p className="muted">Import an event before creating scout assignments.</p><Link className="button" href="/admin/sync">Import from TBA</Link></section></AppShell>;
  const [{ data: scouts }, { data: matches }, { data: eventTeams }, { data: prescoutAssignments }] = await Promise.all([
    supabase.from("organization_members").select("user_id,profiles(display_name)").eq("organization_id", membership.organization_id).in("role", ["scout", "global_scout", "admin", "developer"]).order("created_at"),
    supabase.from("matches").select("id,tba_match_key,match_number,match_type,red_teams,blue_teams,scheduled_at,status").eq("event_id", activeEventId).order("scheduled_at"),
    supabase.from("event_teams").select("team_id,teams(team_number,name)").eq("event_id", activeEventId),
    (supabase as any).from("prescout_assignments").select("team_id,scout_user_id").eq("event_id", activeEventId),
  ]);
  const matchIds = (matches ?? []).map((match) => match.id);
  const { data: assignments } = matchIds.length ? await supabase.from("scouting_assignments").select("id,match_id,team_id,scout_user_id,status").eq("assignment_type", "objective").in("match_id", matchIds) : { data: [] };
  const scoutOptions = (scouts ?? []).map((scout) => ({ id: scout.user_id, name: ((scout.profiles as unknown as { display_name: string } | null)?.display_name) ?? "Unnamed scout" }));
  const teamsById = new Map((eventTeams ?? []).map((row) => [row.team_id, row.teams as unknown as { team_number: number; name: string } | null]));
  const assignmentByMatchTeam = new Map<string, string[]>();
  for (const assignment of assignments ?? []) assignmentByMatchTeam.set(`${assignment.match_id}:${assignment.team_id}`, [...(assignmentByMatchTeam.get(`${assignment.match_id}:${assignment.team_id}`) ?? []), assignment.scout_user_id]);
  const prescoutByTeam = new Map<string, string[]>();
  for (const assignment of prescoutAssignments ?? []) prescoutByTeam.set(assignment.team_id, [...(prescoutByTeam.get(assignment.team_id) ?? []), assignment.scout_user_id]);
  const activeEvent = events?.find((event) => event.id === activeEventId);
  return <AppShell active="Assignments"><PageHeader eyebrow="Administration" title="Scout assignments."/>
    <section className="card assignment-setup"><div className="assignment-setup-controls"><form action="/admin/assignments" className="event-picker"><label htmlFor="eventId">Event</label><AppSelect id="eventId" name="eventId" defaultValue={activeEventId} options={(events ?? []).map((event) => ({ value: event.id, label: event.name }))}/><button className="button secondary">Open</button></form><GenerateAssignmentsForm eventId={activeEventId}/></div><p className="assignment-setup-hint">Assign one or more scouts to each team in a match. Use the board to add another scout or clear a team before a submission is received.</p></section>
    {!scoutOptions.length && <section className="card" style={{ marginBottom: 18 }}><h2>No scouts available</h2><p className="muted" style={{ lineHeight: 1.6 }}>Invite teammates with the Scout role first. They will appear here once their account and membership exist.</p><Link className="button secondary" href="/admin/users">Manage users</Link></section>}
    <section className="card"><div className="card-head"><div><h2>{activeEvent?.name}</h2><p className="muted" style={{ margin: "5px 0 0" }}>{matches?.length ?? 0} scheduled matches · {scoutOptions.length} available scouts</p></div><Link className="button secondary" href={`/events/${activeEventId}/matches`}>Schedule</Link></div>{matches?.length ? <div className="assignment-board">{matches.map((match) => { const renderTeam = (teamId: string, alliance: "red" | "blue") => { const team = teamsById.get(teamId); const assignmentIds = assignmentByMatchTeam.get(`${match.id}:${teamId}`) ?? []; return <div className={alliance} key={teamId}><AssignmentEditor matchId={match.id} teamId={teamId} teamLabel={`${team?.team_number ?? "—"} · ${team?.name ?? "Unknown team"}`} scoutUserIds={assignmentIds} scouts={scoutOptions}/></div>; }; return <article className="assignment-match" key={match.id}><div className="assignment-match-head"><div><strong>{matchLabel(match)}</strong><span>{match.scheduled_at ? <LocalDateTime value={match.scheduled_at} format="time"/> : "Time pending"}</span></div><span className={`tag ${match.status === "played" ? "complete" : "pending"}`}>{match.status}</span></div><div className="assignment-alliance-grid"><div><div className="assignment-alliance-title red">Red alliance</div>{match.red_teams.map((teamId: string) => renderTeam(teamId, "red"))}</div><div><div className="assignment-alliance-title blue">Blue alliance</div>{match.blue_teams.map((teamId: string) => renderTeam(teamId, "blue"))}</div></div></article>; })}</div> : <p className="muted">This event does not have a match schedule yet.</p>}</section>
    <section className="card section" style={{ marginTop: 18 }}><div className="card-head"><div><h2>Prescout assignments</h2><p className="muted" style={{ margin: "5px 0 0" }}>Assignments help coordinate coverage, but every Scout can submit a prescout report for any event team.</p></div><Link className="button secondary" href="/scout/pre-scout">Open prescouting</Link></div>{eventTeams?.length ? <div className="assignment-board">{[...eventTeams].sort((a: any, b: any) => (a.teams?.team_number ?? 0) - (b.teams?.team_number ?? 0)).map((row: any) => <PrescoutAssignmentEditor key={row.team_id} eventId={activeEventId} teamId={row.team_id} teamLabel={`${row.teams?.team_number ?? "—"} · ${row.teams?.name ?? "Unknown team"}`} scoutUserIds={prescoutByTeam.get(row.team_id) ?? []} scouts={scoutOptions}/>)}</div> : <p className="muted">Add teams to this event before assigning prescouting.</p>}</section>
  </AppShell>;
}
