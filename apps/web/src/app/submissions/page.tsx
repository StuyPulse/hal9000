import { AppShell, PageHeader } from "@/components/app-shell";
import { LiveRefresh } from "@/components/live-refresh";
import { LocalDateTime } from "@/components/local-date-time";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { getViewerContext } from "@/lib/viewer-context";
import { matchLabel } from "@/lib/match-label";
import { DeleteSubmissionForm } from "@/components/delete-submission-form";

export default async function SubmissionsPage({ searchParams }: { searchParams: Promise<{ scope?: string; match?: string }> }) {
  const queryParams = await searchParams;
  const scope = queryParams.scope === "mine" ? "mine" : "all";
  const matchId = queryParams.match ?? "";
  const [supabase, viewer] = await Promise.all([createClient(), getViewerContext()]);
  let query = (supabase as any).from("scouting_entries").select("id,match_id,scout_user_id,entry_type,status,submitted_at,created_at,matches(match_number,match_type,tba_match_key),teams(team_number,name),profiles(display_name)").order("created_at", { ascending: false }).limit(100);
  if (viewer?.activeEvent) query = query.eq("event_id", viewer.activeEvent.id);
  if (scope === "mine" && viewer) query = query.eq("scout_user_id", viewer.userId);
  if (matchId) query = query.eq("match_id", matchId);
  const { data } = await query;
  const canDelete = viewer?.role === "admin" || viewer?.role === "developer";

  const scopeHref = (nextScope: "all" | "mine") => `/submissions?scope=${nextScope}${matchId ? `&match=${matchId}` : ""}`;
  return <AppShell active="Submissions"><LiveRefresh tables={["scouting_entries"]} eventId={viewer?.activeEvent?.id}/><PageHeader eyebrow="Scouting record" title={matchId ? "Match reports." : "Submissions."}/><section className="card"><div className="card-head"><div><h2>{matchId ? "Scouting reports for this match" : scope === "mine" ? "Your scouting entries" : "All scouting entries"}</h2><span className="muted">Open any entry to review its full scouting report.</span></div><div className="filter-tabs"><Link className={scope === "all" ? "active" : ""} href={scopeHref("all")}>Everyone</Link><Link className={scope === "mine" ? "active" : ""} href={scopeHref("mine")}>Just me</Link></div></div>{data?.length ? data.map((entry: any) => { const canEdit = entry.entry_type === "match" && entry.match_id && viewer && (entry.scout_user_id === viewer.userId || canDelete); const returnPath = scopeHref(scope); return <div className="list-row submission-row" key={entry.id}><Link className="submission-row-main" href={`/submissions/${entry.id}`}><div><strong>{entry.entry_type === "match" ? `${matchLabel(entry.matches ?? {})} · ` : ""}{entry.teams?.team_number} {entry.teams?.name}</strong><div className="muted">{entry.entry_type.replace("_", " ")} · {entry.profiles?.display_name ?? "Scout"} · {(entry.submitted_at ?? entry.created_at) ? <LocalDateTime value={entry.submitted_at ?? entry.created_at}/> : "Pending"}</div></div><span aria-hidden="true">→</span></Link><div className="submission-row-action">{canEdit && <Link className="link" href={`/scout/match/${entry.match_id}?edit=${entry.id}&returnTo=${encodeURIComponent(returnPath)}`}>Edit</Link>}<span className={`tag ${entry.status === "submitted" ? "complete" : "pending"}`}>{entry.status}</span>{canDelete && <DeleteSubmissionForm entryId={entry.id} compact/>}</div></div>; }) : <p className="muted">No scouting entries have been submitted yet.</p>}</section></AppShell>;
}
