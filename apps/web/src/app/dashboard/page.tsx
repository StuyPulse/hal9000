import Link from "next/link";
import { AppShell, PageHeader } from "@/components/app-shell";
import { createClient } from "@/lib/supabase/server";
import { getViewerContext } from "@/lib/viewer-context";

export default async function Dashboard() {
  const viewer = await getViewerContext();
  const supabase = await createClient();
  const [{ data: organization }, { count: submissionCount }, { data: assignments }] = viewer?.organizationId && viewer.userId
    ? await Promise.all([
      supabase.from("organizations").select("name").eq("id", viewer.organizationId).maybeSingle(),
      viewer.activeEvent ? supabase.from("scouting_entries").select("id", { count: "exact", head: true }).eq("event_id", viewer.activeEvent.id).eq("status", "submitted") : Promise.resolve({ count: 0 }),
      viewer.activeEvent
        ? supabase.from("scouting_assignments").select("id,status,assignment_type,matches!inner(id,match_number,event_id),teams(team_number,name)").eq("scout_user_id", viewer.userId).eq("matches.event_id", viewer.activeEvent.id).neq("status", "complete").order("created_at", { ascending: false }).limit(5)
        : Promise.resolve({ data: [] }),
    ])
    : [{ data: null }, { count: 0 }, { data: [] }];

  return <AppShell active="Assignments"><PageHeader eyebrow={organization?.name ?? "HAL9000"} title={organization ? "Assignments." : "You’re almost ready."}/>
    {!viewer?.organizationId ? <div className="card"><h2>Your account has been created.</h2><p className="muted" style={{marginTop:8,lineHeight:1.6}}>An admin needs to add you to an organization and assign your role before event data becomes visible. This is intentional: access is secured in Supabase RLS, not trusted from the browser.</p><Link className="button" href="/demo" style={{display:"inline-block",marginTop:16}}>View workspace preview</Link></div> : <><div className="grid stats dashboard-stats"><div className="card"><div className="stat-label">Submissions received</div><div className="stat-value">{submissionCount ?? 0}</div><div className="trend">Active event total</div></div>{viewer?.role === "admin" && <div className="card"><div className="stat-label">Sync status</div><div className="stat-value" style={{fontSize:22}}>Online</div><div className="trend">Supabase Realtime connected</div></div>}</div><section className="card section"><div className="card-head"><h2>Your assignments</h2><Link className="button secondary" href="/scout/match">Scout a match</Link></div>{assignments?.length ? assignments.map((assignment: any) => <div className="list-row" key={assignment.id}><div><strong>Q{assignment.matches?.match_number} · {assignment.teams?.team_number}</strong><div className="muted">{assignment.assignment_type} scouting · {assignment.teams?.name}</div></div><div className="row-actions"><span className="tag pending">{assignment.status.replace("_", " ")}</span><Link className="button secondary" href={`/scout/match/${assignment.matches?.id}?assignment=${assignment.id}`}>Scout</Link></div></div>) : <p className="muted">No assignments are currently waiting for you.</p>}</section></>}
  </AppShell>;
}
