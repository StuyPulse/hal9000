import { getEventTeamRemaps } from "@/lib/event-team-remaps";
import { eventTeamNumber, eventTeamNumberFromInput } from "@/lib/tba-team-identity";
import { AppShell, PageHeader } from "@/components/app-shell";
import { createClient } from "@/lib/supabase/server";
import { LiveRefresh } from "@/components/live-refresh";
import { type TeamScoutEntry, calculateScoutStats, competitiveMatchEntries, groupByTeam, selectedMatchReportEntries } from "@/lib/scouting-stats";
import { officialFuelAverages } from "@/lib/official-fuel-stats";
import { CompareMetrics } from "./compare-metrics";
import { CompareTeamPicker } from "./compare-team-picker";
import { type TbaRanking, type TbaSortInfo, asNumber, fetchTbaRankings, officialClimb, tbaMetric } from "@/lib/tba-event-stats";

export default async function ComparePage({ params, searchParams }: { params: Promise<{ eventId: string }>; searchParams: Promise<{ a?: string; b?: string }> }) {
  const { eventId: eventKey } = await params; const { a, b } = await searchParams; const supabase = await createClient();
  const { data: event } = await supabase.from("events").select("id,name,event_key,is_manual").eq("event_key", eventKey).maybeSingle();
  const { data: rows } = event ? await supabase.from("event_teams").select("team_id,teams(team_number,name)").eq("event_id", event.id) : { data: [] };
  const remaps = await getEventTeamRemaps(event?.id);
  const teamRows = (rows ?? []).sort((first: any, second: any) => first.teams?.team_number - second.teams?.team_number);
  const pick = (id?: string) => {
    if (!id) return null;
    try { const number = eventTeamNumberFromInput(id, remaps); return teamRows.find((row: any) => row.teams?.team_number === number) as any; } catch { return null; }
  };
  const left = pick(a), right = pick(b); const selectedTeamIds = left && right ? [left.team_id, right.team_id] : [];
  const [{ data: entries }, { data: reportSources }, { data: officialMatches }, { data: photos }] = await Promise.all([
    event && selectedTeamIds.length ? (supabase as any).from("scouting_entries").select("id,match_id,team_id,payload,matches(id,match_type)").eq("event_id", event.id).eq("entry_type", "match").eq("status", "submitted").in("team_id", selectedTeamIds) : Promise.resolve({ data: [] }),
    event && selectedTeamIds.length ? (supabase as any).from("match_report_sources").select("team_id,match_key,selected_entry_id").eq("event_id", event.id).in("team_id", selectedTeamIds) : Promise.resolve({ data: [] }),
    event && selectedTeamIds.length ? (supabase as any).from("matches").select("red_teams,blue_teams,tba_score_breakdown").eq("event_id", event.id).eq("status", "played") : Promise.resolve({ data: [] }),
    event && selectedTeamIds.length ? (supabase as any).from("pit_photos").select("team_id,storage_path,created_at").eq("event_id", event.id).in("team_id", selectedTeamIds).order("created_at", { ascending: false }) : Promise.resolve({ data: [] }),
  ]);
  const loadPhotoUrls = async () => {
    const newestPhotos = new Map<string, string>();
    for (const photo of photos ?? []) if (!newestPhotos.has(photo.team_id)) newestPhotos.set(photo.team_id, photo.storage_path);
    const photoUrlByTeam = new Map((await Promise.all([...newestPhotos.entries()].map(async ([teamId, storagePath]) => {
      const { data } = await supabase.storage.from("pit-photos").createSignedUrl(storagePath, 3600);
      return [teamId, data?.signedUrl] as const;
    }))).filter((item): item is readonly [string, string] => Boolean(item[1])));
    return photoUrlByTeam;
  };
  const loadTba = async () => event && !event.is_manual && selectedTeamIds.length ? fetchTbaRankings(event.event_key, remaps) : { rankings: [] as TbaRanking[], sortInfo: [] as TbaSortInfo[], oprs: {} as Record<string, number> };
  const [photoUrlByTeam, { rankings, sortInfo, oprs }] = await Promise.all([loadPhotoUrls(), loadTba()]);
  const tbaByTeam = new Map(rankings.map((ranking) => [Number(String(ranking.team_key ?? "").replace("frc", "")), ranking]));
  const entriesByTeam = groupByTeam<TeamScoutEntry>(entries);
  const formatTeam = (row: any, color: string) => {
    const reports = selectedMatchReportEntries(competitiveMatchEntries(entriesByTeam.get(row.team_id) ?? []), reportSources ?? []);
    const stats = calculateScoutStats(reports);
    const tba = tbaByTeam.get(row.teams?.team_number);
    const officialFuel = officialFuelAverages(officialMatches ?? [], row.team_id);
    return { number: row.teams?.team_number, displayNumber: eventTeamNumber(row.teams?.team_number, remaps), name: row.teams?.name, photoUrl: photoUrlByTeam.get(row.team_id) ?? null, color, rank: tba?.rank ?? null, record: tba?.record ? `${tba.record.wins}-${tba.record.losses}-${tba.record.ties}` : "—", opr: asNumber(oprs[`frc${row.teams?.team_number}`]), tbaTotalFuel: officialFuel?.totalFuel ?? tbaMetric(tba, sortInfo, /total.*fuel|avg.*match/i), tbaAutoFuel: officialFuel?.autoFuel ?? tbaMetric(tba, sortInfo, /auto.*fuel/i), tbaTransitionFuel: tbaMetric(tba, sortInfo, /transition.*fuel/i), tbaTeleopFuel: officialFuel?.teleopFuel ?? tbaMetric(tba, sortInfo, /teleop.*fuel/i), tbaEndgameFuel: tbaMetric(tba, sortInfo, /endgame.*fuel/i), maxFuel: stats.peakFuel, ...officialClimb(officialMatches ?? [], row.team_id), stats };
  };
  return <AppShell active="Summary"><LiveRefresh tables={["scouting_entries", "match_report_sources", "pit_photos", "matches"]} eventId={event?.id}/><PageHeader eyebrow={event?.name ?? "Comparison"} title="Compare teams."/><CompareTeamPicker action={`/events/${eventKey}/compare`} teams={teamRows.map((row: any) => ({ id: String(row.teams?.team_number), number: row.teams?.team_number, displayNumber: eventTeamNumber(row.teams?.team_number, remaps), name: row.teams?.name ?? "Unknown team" }))} initialA={left ? String(left.teams.team_number) : a} initialB={right ? String(right.teams.team_number) : b}/>{left && right && <CompareMetrics left={formatTeam(left, "#ef4444")} right={formatTeam(right, "#3b82f6")}/>}</AppShell>;
}
