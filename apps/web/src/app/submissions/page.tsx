import { AppShell, PageHeader } from "@/components/app-shell";
import { LiveRefresh } from "@/components/live-refresh";
import { LocalDateTime } from "@/components/local-date-time";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { getViewerContext } from "@/lib/viewer-context";
import { DeleteSubmissionForm } from "@/components/delete-submission-form";
import { SubmissionScoutFilter } from "@/components/submission-scout-filter";
import { SubmissionTeamFilter } from "@/components/submission-team-filter";
import { SubmissionEventFilter } from "@/components/submission-event-filter";
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

export default async function SubmissionsPage({ searchParams }: { searchParams: Promise<{ scope?: string; match?: string; scout?: string; team?: string; type?: string; event?: string }> }) {
  const queryParams = await searchParams;
  const scope = queryParams.scope === "mine" ? "mine" : "all";
  const matchId = queryParams.match ?? "";
  const requestedScoutId = queryParams.scout ?? "";
  const requestedTeamId = queryParams.team ?? "";
  const requestedEventId = queryParams.event ?? "";
  const type: ReportType = queryParams.type === "pit" ? "pit" : queryParams.type === "pre_scout" ? "pre_scout" : "match";
  const [supabase, viewer] = await Promise.all([createClient(), getViewerContext()]);
  const database: any = createAdminClient();
  const { data: events } = viewer?.organizationId
    ? await database.from("events").select("id,name,status").eq("organization_id", viewer.organizationId).order("starts_at", { ascending: false })
    : { data: [] };
  const organizationEvents = (events ?? []) as { id: string; name: string; status: string }[];
  const activeEventId = viewer?.activeEvent?.id ?? "";
  const selectedEvent = organizationEvents.find((event) => event.id === requestedEventId) ?? organizationEvents.find((event) => event.id === activeEventId) ?? null;
  const submissionEventId = selectedEvent?.id;
  const [{ data: members }, { data: eventTeams }, { data: submittedTeams }] = await Promise.all([
    viewer?.organizationId ? supabase.from("organization_members").select("user_id,profiles(display_name)").eq("organization_id", viewer.organizationId).order("created_at") : Promise.resolve({ data: [] }),
    submissionEventId ? supabase.from("event_teams").select("team_id,teams(id,team_number,name)").eq("event_id", submissionEventId) : Promise.resolve({ data: [] }),
    submissionEventId && type !== "match" ? (supabase as any).from("scouting_entries").select("team_id").eq("event_id", submissionEventId).eq("entry_type", type).eq("status", "submitted") : Promise.resolve({ data: [] }),
  ]);
  const scouts = (members ?? []).map((member: any) => ({ id: member.user_id, name: member.profiles?.display_name ?? "Unnamed scout" })).sort((left, right) => left.name.localeCompare(right.name));
  const teams = (eventTeams ?? []).map((row: any) => row.teams).filter(Boolean).map((team: any) => ({ id: team.id, number: team.team_number, name: team.name })).sort((left: any, right: any) => left.number - right.number);
  const scoutId = scouts.some((scout) => scout.id === requestedScoutId) ? requestedScoutId : "";
  const teamId = teams.some((team: any) => team.id === requestedTeamId) ? requestedTeamId : "";
  const markedTeamIds = [...new Set(((submittedTeams ?? []) as { team_id: string | null }[]).flatMap((entry) => entry.team_id ? [entry.team_id] : []))];
  let query = (supabase as any).from("scouting_entries").select("id,match_id,scout_user_id,entry_type,status,payload,submitted_at,created_at,matches(match_number,match_type,tba_match_key),teams(team_number,name),author:profiles!scouting_entries_scout_user_id_fkey(display_name)").eq("entry_type", type).order("created_at", { ascending: false });
  if (submissionEventId) query = query.eq("event_id", submissionEventId);
  else query = query.limit(0);
  if (scope === "mine" && viewer) query = query.eq("scout_user_id", viewer.userId);
  if (scoutId) query = query.eq("scout_user_id", scoutId);
  if (teamId) query = query.eq("team_id", teamId);
  if (matchId) query = query.eq("match_id", matchId);
  const { data } = await query;
  function href(next: Partial<{ scope: "all" | "mine"; type: ReportType; matchId: string; scoutId: string; teamId: string; eventId: string }> = {}) {
    const params = new URLSearchParams();
    const nextType = next.type ?? type;
    const nextScope = next.scope ?? scope;
    const nextMatchId = next.matchId ?? matchId;
    const nextScoutId = next.scoutId ?? scoutId;
    const nextTeamId = next.teamId ?? teamId;
    const nextEventId = next.eventId ?? selectedEvent?.id ?? "";
    if (nextType !== "match" || !nextMatchId) params.set("type", nextType);
    if (nextScope !== "all") params.set("scope", nextScope);
    if (nextMatchId) params.set("match", nextMatchId);
    if (nextScoutId) params.set("scout", nextScoutId);
    if (nextTeamId) params.set("team", nextTeamId);
    if (nextEventId && nextEventId !== activeEventId) params.set("event", nextEventId);
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
        <div><h2>{heading}</h2><span className="muted">{selectedEvent ? `${selectedEvent.name} · ` : ""}Open a report to review its details.</span></div>
        <div className="submission-top-controls">{selectedEvent && <SubmissionEventFilter events={organizationEvents} activeEventId={activeEventId} selectedEventId={selectedEvent.id}/>}<div className="filter-tabs"><Link className={scope === "all" ? "active" : ""} href={href({ scope: "all" })}>Everyone</Link><Link className={scope === "mine" ? "active" : ""} href={href({ scope: "mine" })}>Just me</Link></div></div>
      </div>
      <div className="filter-tabs submission-type-tabs" aria-label="Submission type">
        {reportTabs.map((tab) => <Link key={tab.value} className={type === tab.value ? "active" : ""} href={href({ type: tab.value, matchId: tab.value === "match" ? matchId : "" })}>{tab.label}</Link>)}
      </div>
      <div className="submission-filter-row"><div className="field"><label htmlFor="submission-team-filter">Team</label><SubmissionTeamFilter teams={teams} value={teamId} markedTeamIds={markedTeamIds} markedTeamLabel={type === "pit" ? "Pit report submitted" : type === "pre_scout" ? "Pre-scout report submitted" : undefined}/></div><div className="field"><label htmlFor="submission-scout-filter">Scout</label><SubmissionScoutFilter scouts={scouts} value={scoutId}/></div></div>
      {data?.length ? data.map((entry: any) => {
        const canEdit = viewer && (entry.entry_type === "pit" || entry.scout_user_id === viewer.userId || viewerCanManage(viewer));
        const returnPath = href();
        const editHref = canEdit ? reportEditHref(entry, returnPath) : null;
        return <div className="list-row submission-row" key={entry.id}>
          <Link className="submission-row-main" href={`/submissions/${entry.id}?returnTo=${encodeURIComponent(returnPath)}`}>
            <div><strong>{scoutingEntryLabel(entry)} · {entry.teams?.team_number} {entry.teams?.name}</strong><div className="muted">{scoutingEntryTypeLabel(entry.entry_type)} · {entry.author?.display_name ?? "Scout"} · {(entry.submitted_at ?? entry.created_at) ? <LocalDateTime value={entry.submitted_at ?? entry.created_at}/> : "Pending"}</div></div><span aria-hidden="true">→</span>
          </Link>
          <div className="submission-row-action">{editHref && <Link className="link" href={editHref}>Edit</Link>}<span className={`tag ${entry.status === "submitted" ? "complete" : "pending"}`}>{entry.status}</span>{canEdit && <DeleteSubmissionForm entryId={entry.id} compact/>}</div>
        </div>;
      }) : <p className="muted">No {scoutingEntryTypeLabel(type).toLowerCase()} reports match these filters.</p>}
    </section>
  </AppShell>;
}
