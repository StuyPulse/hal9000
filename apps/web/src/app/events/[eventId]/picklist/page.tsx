import { notFound, redirect } from "next/navigation";
import { AppShell, PageHeader } from "@/components/app-shell";
import { LiveRefresh } from "@/components/live-refresh";
import { createClient } from "@/lib/supabase/server";
import { getViewerContext, viewerCanManage } from "@/lib/viewer-context";
import { calculateScoutStats, competitiveMatchEntries, selectedMatchReportEntries } from "@/lib/scouting-stats";
import { PicklistBoard } from "./picklist-board";

async function getCompletePicklistHistory(supabase: any, eventId: string) {
  const rows: any[] = [];
  const pageSize = 1_000;
  for (let start = 0; ; start += pageSize) {
    const { data, error } = await supabase
      .from("picklist_change_log")
      .select("id,team_id,actor_user_id,action,before_state,after_state,created_at,teams(team_number,name),profiles!picklist_change_log_actor_user_id_fkey(display_name)")
      .eq("event_id", eventId)
      .order("created_at", { ascending: false })
      .range(start, start + pageSize - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if ((data ?? []).length < pageSize) return rows;
  }
}

async function getCompleteEventMatchReports(supabase: any, eventId: string) {
  const rows: any[] = [];
  const pageSize = 1_000;
  for (let start = 0; ; start += pageSize) {
    const { data, error } = await supabase.from("scouting_entries").select("id,team_id,match_id,payload,matches(id,match_type)").eq("event_id", eventId).eq("entry_type", "match").eq("status", "submitted").range(start, start + pageSize - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if ((data ?? []).length < pageSize) return rows;
  }
}

export default async function PicklistPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId: eventKey } = await params;
  const [viewer, supabase] = await Promise.all([getViewerContext(), createClient()]);
  if (!viewer?.organizationId) redirect("/dashboard");
  const { data: canViewPicklist } = await (supabase as any).rpc("can_view_picklist", { target_organization: viewer.organizationId });
  if (!canViewPicklist) return <AppShell active="Picklist"><PageHeader eyebrow="Strategy access" title="Picklist unavailable."/><section className="card"><h2>Picklist access is restricted.</h2><p className="muted">Ask an administrator if you need access to the team picklist.</p></section></AppShell>;
  const canEdit = viewer.role === "global_scout" || viewer.role === "strategist" || viewer.role === "master" || viewerCanManage(viewer);
  const { data: event } = await supabase.from("events").select("id,name,event_key,is_manual").eq("event_key", eventKey).eq("organization_id", viewer.organizationId).maybeSingle();
  if (!event) notFound();
  let oprs: Record<string, number> = {}; const eventRanks = new Map<number, number>();
  if (!event.is_manual && process.env.TBA_AUTH_KEY) try {
    const headers = { "X-TBA-Auth-Key": process.env.TBA_AUTH_KEY };
    const [oprsResponse, rankingsResponse] = await Promise.all([
      fetch(`https://www.thebluealliance.com/api/v3/event/${event.event_key}/oprs`, { headers, next: { revalidate: 20 } }),
      fetch(`https://www.thebluealliance.com/api/v3/event/${event.event_key}/rankings`, { headers, next: { revalidate: 20 } }),
    ]);
    if (oprsResponse.ok) oprs = (await oprsResponse.json())?.oprs ?? {};
    if (rankingsResponse.ok) for (const ranking of (await rankingsResponse.json())?.rankings ?? []) {
      const teamNumber = Number(String(ranking.team_key ?? "").replace("frc", ""));
      if (Number.isFinite(teamNumber) && typeof ranking.rank === "number") eventRanks.set(teamNumber, ranking.rank);
    }
  } catch { /* Team number is a safe fallback while TBA is unavailable. */ }
  const [{ data: categoryRows }, { data: tagRows }, { data: eventTeamRows }, { data: rankingRows }, { data: reportSources }, matchReports, changeRows] = await Promise.all([
    (supabase as any).from("picklist_categories").select("id,name,color,sort_order").eq("organization_id", viewer.organizationId).order("sort_order").order("name"),
    (supabase as any).from("picklist_tags").select("id,name,color,sort_order").eq("organization_id", viewer.organizationId).order("sort_order").order("name"),
    supabase.from("event_teams").select("team_id,teams(id,team_number,name)").eq("event_id", event.id),
    (supabase as any).from("shared_picklist_rankings").select("id,team_id,category_id,rank,note,selected,tag_ids,created_by,updated_by,updated_at").eq("event_id", event.id),
    (supabase as any).from("match_report_sources").select("team_id,match_key,selected_entry_id").eq("event_id", event.id),
    getCompleteEventMatchReports(supabase, event.id),
    // Revision history is intentionally complete. A picklist is a shared strategy
    // document, so an older decision must remain reachable and restorable.
    getCompletePicklistHistory(supabase, event.id),
  ]);
  const statsByTeam = new Map<string, ReturnType<typeof calculateScoutStats>>();
  for (const row of eventTeamRows ?? []) {
    const reports = (matchReports ?? []).filter((report: any) => report.team_id === row.team_id);
    statsByTeam.set(row.team_id, calculateScoutStats(selectedMatchReportEntries(competitiveMatchEntries(reports), reportSources ?? [])));
  }
  const teams = (eventTeamRows ?? []).map((row: any) => row.teams ? { ...row.teams, opr: Number(oprs[`frc${row.teams.team_number}`] ?? 0), eventRank: eventRanks.get(row.teams.team_number) ?? null, scouting: statsByTeam.get(row.team_id) ?? null } : null).filter(Boolean).sort((a: any, b: any) => b.opr - a.opr || a.team_number - b.team_number);
  return <AppShell active="Picklist"><LiveRefresh tables={["picklist_categories", "picklist_tags"]}/><LiveRefresh tables={["shared_picklist_rankings", "picklist_change_log", "scouting_entries", "match_report_sources"]} eventId={event.id}/><PageHeader eyebrow={event.name} title="Picklist."/><PicklistBoard organizationId={viewer.organizationId} eventId={event.id} eventKey={eventKey} userId={viewer.userId} canEdit={canEdit} categories={categoryRows ?? []} tags={tagRows ?? []} teams={teams} rankings={rankingRows ?? []} changes={changeRows}/></AppShell>;
}
