import { AppShell, PageHeader } from "@/components/app-shell";
import { LiveRefresh } from "@/components/live-refresh";
import { LocalDateTime } from "@/components/local-date-time";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { getViewerContext } from "@/lib/viewer-context";
import { DeleteSubmissionForm } from "@/components/delete-submission-form";
import { SubmissionScoutFilter } from "@/components/submission-scout-filter";
import { scoutingEntryLabel, scoutingEntryTypeLabel } from "@/lib/scouting-entry-label";
import { viewerCanManage } from "@/lib/viewer-context";
import { createAdminClient } from "@/lib/supabase/admin";

type ReportType = "match" | "pit" | "pre_scout";

const reportTabs: { value: ReportType; label: string }[] = [
  { value: "match", label: "Match scouting" },
  { value: "pit", label: "Pit scouting" },
  { value: "pre_scout", label: "Pre scouting" },
];

function reportEditHref(entry: { id: string; entry_type: string; match_id: string | null }, returnTo: string) {
  const params = `edit=${entry.id}&returnTo=${encodeURIComponent(returnTo)}`;
  if (entry.entry_type === "match") return entry.match_id ? `/scout/match/${entry.match_id}?${params}` : `/scout/match/manual?${params}`;
  if (entry.entry_type === "pit") return `/scout/pit?${params}`;
  if (entry.entry_type === "pre_scout") return `/scout/pre-scout?${params}`;
  return null;
}

export default async function SubmissionsPage({ searchParams }: { searchParams: Promise<{ scope?: string; match?: string; scout?: string; type?: string }> }) {
  const queryParams = await searchParams;
  const scope = queryParams.scope === "mine" ? "mine" : "all";
  const matchId = queryParams.match ?? "";
  const requestedScoutId = queryParams.scout ?? "";
  const type: ReportType = queryParams.type === "pit" ? "pit" : queryParams.type === "pre_scout" ? "pre_scout" : "match";
  const [supabase, viewer] = await Promise.all([createClient(), getViewerContext()]);
  const database: any = createAdminClient();
  const { data: preScoutEvent } = type === "pre_scout" && viewer?.organizationId
    ? await database.from("events").select("id").eq("organization_id", viewer.organizationId).eq("event_key", "2026cc").maybeSingle()
    : { data: null };
  const submissionEventId = type === "pre_scout" ? preScoutEvent?.id : viewer?.activeEvent?.id;
  const { data: members } = viewer?.organizationId ? await supabase.from("organization_members").select("user_id,profiles(display_name)").eq("organization_id", viewer.organizationId).order("created_at") : { data: [] };
  const scouts = (members ?? []).map((member: any) => ({ id: member.user_id, name: member.profiles?.display_name ?? "Unnamed scout" })).sort((left, right) => left.name.localeCompare(right.name));
  const scoutId = scouts.some((scout) => scout.id === requestedScoutId) ? requestedScoutId : "";
  let query = (supabase as any).from("scouting_entries").select("id,match_id,scout_user_id,entry_type,status,payload,submitted_at,created_at,matches(match_number,match_type,tba_match_key),teams(team_number,name),profiles(display_name)").eq("entry_type", type).order("created_at", { ascending: false });
  if (submissionEventId) query = query.eq("event_id", submissionEventId);
  if (scope === "mine" && viewer) query = query.eq("scout_user_id", viewer.userId);
  if (scoutId) query = query.eq("scout_user_id", scoutId);
  if (matchId) query = query.eq("match_id", matchId);
  const { data } = await query;
  function href(next: Partial<{ scope: "all" | "mine"; type: ReportType; matchId: string; scoutId: string }> = {}) {
    const params = new URLSearchParams();
    const nextType = next.type ?? type;
    const nextScope = next.scope ?? scope;
    const nextMatchId = next.matchId ?? matchId;
    const nextScoutId = next.scoutId ?? scoutId;
    if (nextType !== "match" || !nextMatchId) params.set("type", nextType);
    if (nextScope !== "all") params.set("scope", nextScope);
    if (nextMatchId) params.set("match", nextMatchId);
    if (nextScoutId) params.set("scout", nextScoutId);
    const queryString = params.toString();
    return `/submissions${queryString ? `?${queryString}` : ""}`;
  }

  const heading = matchId
    ? "Scouting reports for this match"
    : scoutId
      ? `${scoutingEntryTypeLabel(type)} reports by ${scouts.find((scout) => scout.id === scoutId)?.name ?? "scout"}`
      : scope === "mine"
        ? `Your ${scoutingEntryTypeLabel(type).toLowerCase()} reports`
        : `${scoutingEntryTypeLabel(type)} reports`;

  return <AppShell active="Submissions">
    <LiveRefresh tables={["scouting_entries"]} eventId={submissionEventId}/>
    <PageHeader eyebrow="Scouting record" title={matchId ? "Match reports." : "Submissions."}/>
    <section className="card">
      <div className="card-head">
        <div><h2>{heading}</h2><span className="muted">Open a report to review its details.</span></div>
        <div className="filter-tabs"><Link className={scope === "all" ? "active" : ""} href={href({ scope: "all" })}>Everyone</Link><Link className={scope === "mine" ? "active" : ""} href={href({ scope: "mine" })}>Just me</Link></div>
      </div>
      <div className="filter-tabs submission-type-tabs" aria-label="Submission type">
        {reportTabs.map((tab) => <Link key={tab.value} className={type === tab.value ? "active" : ""} href={href({ type: tab.value, matchId: tab.value === "match" ? matchId : "" })}>{tab.label}</Link>)}
      </div>
      <div className="submission-filter-row"><div className="field"><label htmlFor="submission-scout-filter">Scout</label><SubmissionScoutFilter scouts={scouts} value={scoutId}/></div></div>
      {data?.length ? data.map((entry: any) => {
        const canEdit = viewer && (entry.scout_user_id === viewer.userId || viewerCanManage(viewer));
        const returnPath = href();
        const editHref = canEdit ? reportEditHref(entry, returnPath) : null;
        return <div className="list-row submission-row" key={entry.id}>
          <Link className="submission-row-main" href={`/submissions/${entry.id}`}>
            <div><strong>{scoutingEntryLabel(entry)} · {entry.teams?.team_number} {entry.teams?.name}</strong><div className="muted">{scoutingEntryTypeLabel(entry.entry_type)} · {entry.profiles?.display_name ?? "Scout"} · {(entry.submitted_at ?? entry.created_at) ? <LocalDateTime value={entry.submitted_at ?? entry.created_at}/> : "Pending"}</div></div><span aria-hidden="true">→</span>
          </Link>
          <div className="submission-row-action">{editHref && <Link className="link" href={editHref}>Edit</Link>}<span className={`tag ${entry.status === "submitted" ? "complete" : "pending"}`}>{entry.status}</span>{canEdit && <DeleteSubmissionForm entryId={entry.id} compact/>}</div>
        </div>;
      }) : <p className="muted">No {scoutingEntryTypeLabel(type).toLowerCase()} reports match these filters.</p>}
    </section>
  </AppShell>;
}
