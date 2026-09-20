import { AppShell, PageHeader } from "@/components/app-shell";
import { createClient } from "@/lib/supabase/server";
import { LiveRefresh } from "@/components/live-refresh";
import { calculateScoutStats, competitiveMatchEntries, selectedMatchReportEntries } from "@/lib/scouting-stats";
import { officialFuelAverages } from "@/lib/official-fuel-stats";
import { CompareMetrics } from "./compare-metrics";
import { CompareTeamPicker } from "./compare-team-picker";

const asNumber = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
function tbaMetric(ranking: any, info: any[], pattern: RegExp) { const index = info.findIndex((metric) => pattern.test(metric.name)); return index >= 0 ? asNumber(ranking?.sort_orders?.[index]) : 0; }
function officialClimb(matches: any[], teamId: string) {
  const auto: string[] = []; const endgame: string[] = [];
  for (const match of matches) {
    const side = match.red_teams?.includes(teamId) ? "red" : match.blue_teams?.includes(teamId) ? "blue" : null;
    if (!side) continue;
    const slot = (side === "red" ? match.red_teams : match.blue_teams).indexOf(teamId) + 1;
    const breakdown = match.tba_score_breakdown?.[side];
    if (!breakdown || !slot) continue;
    auto.push(String(breakdown[`autoTowerRobot${slot}`] ?? "None"));
    endgame.push(String(breakdown[`endGameTowerRobot${slot}`] ?? "None"));
  }
  const typical = (values: string[]) => values.length ? [...new Set(values)].sort((left, right) => values.filter((value) => value === right).length - values.filter((value) => value === left).length)[0] : "—";
  const success = (values: string[]) => values.length ? values.filter((value) => value !== "None" && value !== "").length / values.length * 100 : 0;
  return { autoClimb: typical(auto), autoClimbRate: success(auto), endgameClimb: typical(endgame), endgameClimbRate: success(endgame) };
}
export default async function ComparePage({ params, searchParams }: { params: Promise<{ eventId: string }>; searchParams: Promise<{ a?: string; b?: string }> }) {
  const { eventId: eventKey } = await params; const { a, b } = await searchParams; const supabase = await createClient();
  const { data: event } = await supabase.from("events").select("id,name,event_key,is_manual").eq("event_key", eventKey).maybeSingle();
  const { data: rows } = event ? await supabase.from("event_teams").select("team_id,teams(team_number,name)").eq("event_id", event.id) : { data: [] };
  const teamRows = (rows ?? []).sort((first: any, second: any) => first.teams?.team_number - second.teams?.team_number);
  const pick = (id?: string) => teamRows.find((row: any) => String(row.teams?.team_number) === id) as any;
  const left = pick(a), right = pick(b); const selectedTeamIds = left && right ? [left.team_id, right.team_id] : [];
  const [{ data: entries }, { data: reportSources }, { data: officialMatches }, { data: photos }] = await Promise.all([
    event && selectedTeamIds.length ? (supabase as any).from("scouting_entries").select("id,match_id,team_id,payload,matches(id,match_type)").eq("event_id", event.id).eq("entry_type", "match").eq("status", "submitted").in("team_id", selectedTeamIds) : Promise.resolve({ data: [] }),
    event && selectedTeamIds.length ? (supabase as any).from("match_report_sources").select("team_id,match_key,selected_entry_id").eq("event_id", event.id).in("team_id", selectedTeamIds) : Promise.resolve({ data: [] }),
    event && selectedTeamIds.length ? (supabase as any).from("matches").select("red_teams,blue_teams,tba_score_breakdown").eq("event_id", event.id).eq("status", "played") : Promise.resolve({ data: [] }),
    event && selectedTeamIds.length ? (supabase as any).from("pit_photos").select("team_id,storage_path,created_at").eq("event_id", event.id).in("team_id", selectedTeamIds).order("created_at", { ascending: false }) : Promise.resolve({ data: [] }),
  ]);
  const newestPhotos = new Map<string, string>();
  for (const photo of photos ?? []) if (!newestPhotos.has(photo.team_id)) newestPhotos.set(photo.team_id, photo.storage_path);
  const photoUrlByTeam = new Map((await Promise.all([...newestPhotos.entries()].map(async ([teamId, storagePath]) => {
    const { data } = await supabase.storage.from("pit-photos").createSignedUrl(storagePath, 3600);
    return [teamId, data?.signedUrl] as const;
  }))).filter((item): item is readonly [string, string] => Boolean(item[1])));

  let rankings: any[] = []; let sortInfo: any[] = []; let oprs: Record<string, number> = {};
  if (event && !event.is_manual && selectedTeamIds.length && process.env.TBA_AUTH_KEY) try {
    const headers = { "X-TBA-Auth-Key": process.env.TBA_AUTH_KEY };
    const [rankingsResponse, oprsResponse] = await Promise.all([fetch(`https://www.thebluealliance.com/api/v3/event/${event.event_key}/rankings`, { headers, next: { revalidate: 20 } }), fetch(`https://www.thebluealliance.com/api/v3/event/${event.event_key}/oprs`, { headers, next: { revalidate: 20 } })]);
    const [rankingPayload, oprPayload] = await Promise.all([rankingsResponse.json(), oprsResponse.json()]);
    if (rankingsResponse.ok && Array.isArray(rankingPayload?.rankings)) { rankings = rankingPayload.rankings; sortInfo = rankingPayload.sort_order_info ?? []; oprs = oprPayload?.oprs ?? {}; }
  } catch {}
  const tbaByTeam = new Map(rankings.map((ranking) => [Number(String(ranking.team_key ?? "").replace("frc", "")), ranking]));
  const formatTeam = (row: any, color: string) => {
    const reports = selectedMatchReportEntries(competitiveMatchEntries((entries ?? []).filter((entry: any) => entry.team_id === row.team_id)), reportSources ?? []);
    const stats = calculateScoutStats(reports);
    const tba = tbaByTeam.get(row.teams?.team_number);
    const officialFuel = officialFuelAverages(officialMatches ?? [], row.team_id);
    return { number: row.teams?.team_number, name: row.teams?.name, photoUrl: photoUrlByTeam.get(row.team_id) ?? null, color, rank: tba?.rank ?? null, record: tba?.record ? `${tba.record.wins}-${tba.record.losses}-${tba.record.ties}` : "—", opr: asNumber(oprs[`frc${row.teams?.team_number}`]), tbaTotalFuel: officialFuel?.totalFuel ?? tbaMetric(tba, sortInfo, /total.*fuel|avg.*match/i), tbaAutoFuel: officialFuel?.autoFuel ?? tbaMetric(tba, sortInfo, /auto.*fuel/i), tbaTransitionFuel: tbaMetric(tba, sortInfo, /transition.*fuel/i), tbaTeleopFuel: officialFuel?.teleopFuel ?? tbaMetric(tba, sortInfo, /teleop.*fuel/i), tbaEndgameFuel: tbaMetric(tba, sortInfo, /endgame.*fuel/i), maxFuel: stats.peakFuel, ...officialClimb(officialMatches ?? [], row.team_id), stats };
  };
  return <AppShell active="Summary"><LiveRefresh tables={["scouting_entries", "match_report_sources", "pit_photos", "matches"]} eventId={event?.id}/><PageHeader eyebrow={event?.name ?? "Comparison"} title="Compare teams."/><CompareTeamPicker action={`/events/${eventKey}/compare`} teams={teamRows.map((row: any) => ({ id: String(row.teams?.team_number), number: row.teams?.team_number, name: row.teams?.name ?? "Unknown team" }))} initialA={a} initialB={b}/>{left && right && <CompareMetrics left={formatTeam(left, "#ef4444")} right={formatTeam(right, "#3b82f6")}/>}</AppShell>;
}
