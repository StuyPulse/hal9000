import Link from "next/link";
import { AppShell, PageHeader } from "@/components/app-shell";
import { createClient } from "@/lib/supabase/server";
import { getViewerContext, viewerCanManage } from "@/lib/viewer-context";
import { EventSelector } from "@/components/event-selector";
import { AddEventTeamForm } from "@/components/add-event-team-form";

export default async function TeamsPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId: eventKey } = await params;
  const [supabase, viewer] = await Promise.all([createClient(), getViewerContext()]);
  const [{ data: event }, { data: events }] = await Promise.all([
    supabase.from("events").select("id,name,event_key,is_manual").eq("event_key", eventKey).maybeSingle(),
    viewer?.organizationId ? supabase.from("events").select("event_key,name,status").eq("organization_id", viewer.organizationId).order("starts_at", { ascending: false }) : Promise.resolve({ data: [] }),
  ]);
  const { data } = event ? await supabase.from("event_teams").select("teams(id,team_number,name)").eq("event_id", event.id) : { data: [] };
  const teams = (data ?? []).map((row: any) => row.teams).filter(Boolean).sort((a: any, b: any) => a.team_number - b.team_number);
  const details = event?.is_manual ? "Scout reports, pit data, and photos." : "Official TBA history, scout reports, pit data, and photos.";

  return <AppShell active="Teams">
    <PageHeader eyebrow={event?.name ?? "Event directory"} title="Teams."/>
    {event && viewerCanManage(viewer) && <section className="card event-roster-setup">
      <div className="card-head"><div><h2>Add a team</h2><p className="muted">Add a team to {event.name} using its team number.</p></div></div>
      <AddEventTeamForm eventId={event.id}/>
    </section>}
    <section className="card">
      <div className="card-head"><div><h2>{teams.length} teams</h2><p className="muted">The active event is selected automatically; use this only to review another event.</p></div><EventSelector events={(events ?? []) as any} value={eventKey}/></div>
      {teams.length ? teams.map((team: any) => <Link className="list-row team-directory-row" key={team.id} href={`/events/${eventKey}/teams/${team.team_number}`}><div><strong>{team.team_number} · {team.name}</strong><div className="muted">{details}</div></div></Link>) : <p className="muted">No teams are assigned to this event yet.</p>}
    </section>
  </AppShell>;
}
