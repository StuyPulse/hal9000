import { AppShell, PageHeader } from "@/components/app-shell";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LocalDateTime } from "@/components/local-date-time";
import { PayloadGrid } from "@/components/scouting-payload";
import { getViewerContext, viewerCanManage } from "@/lib/viewer-context";
import { DeleteSubmissionForm } from "@/components/delete-submission-form";
import { scoutingEntryLabel, scoutingEntryTypeLabel } from "@/lib/scouting-entry-label";

function reportEditHref(entry: { id: string; entry_type: string; match_id: string | null }) {
  const params = `edit=${entry.id}&returnTo=${encodeURIComponent(`/submissions/${entry.id}`)}`;
  if (entry.entry_type === "match") return entry.match_id ? `/scout/match/${entry.match_id}?${params}` : `/scout/match/manual?${params}`;
  if (entry.entry_type === "pit") return `/scout/pit?${params}`;
  if (entry.entry_type === "pre_scout") return `/scout/pre-scout?${params}`;
  return null;
}

export default async function SubmissionDetailPage({ params, searchParams }: { params: Promise<{ entryId: string }>; searchParams: Promise<{ returnTo?: string }> }) {
  const { entryId } = await params;
  const { returnTo: requestedReturnTo } = await searchParams;
  const [supabase, viewer] = await Promise.all([createClient(), getViewerContext()]);
  const { data: entry } = await (supabase as any).from("scouting_entries").select("id,event_id,match_id,scout_user_id,entry_type,status,form_version,payload,submitted_at,created_at,updated_at,matches(match_number,match_type,tba_match_key),teams(team_number,name),profiles(display_name)").eq("id", entryId).maybeSingle();
  if (!entry) notFound();
  const { data: eventTeams } = await supabase.from("event_teams").select("team_id,teams(team_number,name)").eq("event_id", entry.event_id);
  const teamNames = Object.fromEntries((eventTeams ?? []).map((row: any) => [row.team_id, `${row.teams?.team_number ?? "Unknown"} · ${row.teams?.name ?? "team"}`]));
  const timestamp = entry.submitted_at ?? entry.created_at;
  const teamName = [entry.teams?.team_number, entry.teams?.name].filter(Boolean).join(" · ") || "Team report";
  const canEdit = viewer && (entry.scout_user_id === viewer.userId || viewerCanManage(viewer));
  const canDelete = viewer && (entry.scout_user_id === viewer.userId || viewerCanManage(viewer));
  const editHref = canEdit ? reportEditHref(entry) : null;
  const defaultSubmissionsHref = entry.entry_type === "match" ? "/submissions" : `/submissions?type=${entry.entry_type}`;
  const submissionsHref = requestedReturnTo?.startsWith("/submissions") && !requestedReturnTo.startsWith("//") ? requestedReturnTo : defaultSubmissionsHref;
  return <AppShell active="Submissions"><PageHeader title={teamName}><Link className="link" href={submissionsHref}>All submissions</Link></PageHeader><section className="card submission-detail"><div className="submission-detail-head"><div><span className="submission-kind">{scoutingEntryTypeLabel(entry.entry_type)} report</span><h2>{scoutingEntryLabel(entry)}</h2><p className="muted">{entry.profiles?.display_name ?? "Scout"} · {timestamp ? <LocalDateTime value={timestamp}/> : "Saved draft"}</p></div><div className="row-actions">{editHref && <Link className="button secondary" href={editHref}>Edit report</Link>}{canDelete && <DeleteSubmissionForm entryId={entry.id} compact/>}<span className={`tag ${entry.status === "submitted" ? "complete" : "pending"}`}>{entry.status}</span></div></div><div className="submission-meta"><span>Updated <LocalDateTime value={entry.updated_at}/></span></div><PayloadGrid payload={entry.payload ?? {}} teamNames={teamNames}/></section></AppShell>;
}
