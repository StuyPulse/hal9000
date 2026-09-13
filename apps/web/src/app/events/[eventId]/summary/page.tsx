import Link from "next/link";
import { AppShell, PageHeader } from "@/components/app-shell";
import { createClient } from "@/lib/supabase/server";
import { LiveRefresh } from "@/components/live-refresh";
import { calculateScoutStats } from "@/lib/scouting-stats";
import { officialFuelAverages } from "@/lib/official-fuel-stats";
import { SummaryTable } from "./summary-table";

type PageProps = { params: Promise<{ eventId: string }>; searchParams: Promise<{ sort?: string; dir?: string }> };
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

export default async function SummaryPage({ params, searchParams }: PageProps) {
  const { eventId: eventKey } = await params; const query = await searchParams; const supabase = await createClient();
  const { data: event } = await supabase.from("events").select("id,name,event_key,is_manual").eq("event_key", eventKey).maybeSingle();
  if (!event) return <AppShell active="Summary"><PageHeader eyebrow="Event summary" title="Event unavailable."/><section className="card"><p className="muted">This event could not be found.</p></section></AppShell>;
  const [{ data: eventTeams }, { data: entries }, { data: preScoutEntries }, { data: officialMatches }] = await Promise.all([supabase.from("event_teams").select("team_id,teams(team_number,name)").eq("event_id", event.id), (supabase as any).from("scouting_entries").select("team_id,payload").eq("event_id", event.id).eq("entry_type", "match").eq("status", "submitted"), (supabase as any).from("scouting_entries").select("team_id,payload,created_at").eq("event_id", event.id).eq("entry_type", "pre_scout").eq("status", "submitted").order("created_at", { ascending: false }), (supabase as any).from("matches").select("red_teams,blue_teams,tba_score_breakdown").eq("event_id", event.id).eq("status", "played")]);
  let rankings: any[] = []; let sortInfo: any[] = []; let oprs: Record<string, number> = {}; let apiError = "";
  if (!event.is_manual) { if (!process.env.TBA_AUTH_KEY) apiError = "TBA_AUTH_KEY is unavailable to this deployment."; else try { const headers = { "X-TBA-Auth-Key": process.env.TBA_AUTH_KEY }; const [rankingsResponse, oprsResponse] = await Promise.all([fetch(`https://www.thebluealliance.com/api/v3/event/${event.event_key}/rankings`, { headers, next: { revalidate: 20 } }), fetch(`https://www.thebluealliance.com/api/v3/event/${event.event_key}/oprs`, { headers, next: { revalidate: 20 } })]); const rankingPayload = await rankingsResponse.json(); const oprPayload = await oprsResponse.json(); if (rankingsResponse.ok && Array.isArray(rankingPayload?.rankings)) { rankings = rankingPayload.rankings; sortInfo = rankingPayload.sort_order_info ?? []; oprs = oprPayload?.oprs ?? {}; } else apiError = `TBA returned HTTP ${rankingsResponse.status}.`; } catch { apiError = "Could not reach TBA right now."; } }
  const tbaByTeam = new Map(rankings.map((ranking) => [Number(String(ranking.team_key ?? "").replace("frc", "")), ranking]));
  const rows = (eventTeams ?? []).map((link: any) => { const reports = (entries ?? []).filter((entry: any) => entry.team_id === link.team_id); const tba = tbaByTeam.get(link.teams?.team_number); const matchFuel = reports.map((entry: any) => asNumber(entry.payload?.auto?.shoot ?? entry.payload?.auto_fuel) + asNumber(entry.payload?.auto?.ferry) + asNumber(entry.payload?.teleop?.shoot ?? entry.payload?.teleop_fuel) + asNumber(entry.payload?.teleop?.ferry)); const officialFuel = officialFuelAverages(officialMatches ?? [], link.team_id); return { team: link.teams, teamId: link.team_id, tba, opr: asNumber(oprs[`frc${link.teams?.team_number}`]), stats: calculateScoutStats(reports), maxFuel: Math.max(0, ...matchFuel), ...officialClimb(officialMatches ?? [], link.team_id), tbaTotalFuel: officialFuel?.totalFuel ?? tbaMetric(tba, sortInfo, /total.*fuel|avg.*match/i), tbaAutoFuel: officialFuel?.autoFuel ?? tbaMetric(tba, sortInfo, /auto.*fuel/i), tbaTransitionFuel: tbaMetric(tba, sortInfo, /transition.*fuel/i), tbaTeleopFuel: officialFuel?.teleopFuel ?? tbaMetric(tba, sortInfo, /teleop.*fuel/i), tbaEndgameFuel: tbaMetric(tba, sortInfo, /endgame.*fuel/i) }; });
  const metric = (row: any, key: string) => key === "team" ? row.team?.team_number : key === "rank" ? asNumber(row.tba?.rank || 99999) : key in row.stats ? asNumber(row.stats[key]) : asNumber(row[key]); const sort = query.sort ?? "opr"; const dir = query.dir === "asc" ? "asc" : "desc"; rows.sort((a: any, b: any) => { const diff = metric(a, sort) - metric(b, sort); return diff * (dir === "asc" ? 1 : -1); });
  const latestPreScout = new Map((preScoutEntries ?? []).filter((entry: any) => !preScoutEntries?.some((other: any) => other.team_id === entry.team_id && other.created_at > entry.created_at)).map((entry: any) => [entry.team_id, entry.payload]));
  return <AppShell active="Summary"><LiveRefresh tables={["scouting_entries", "matches"]} eventId={event.id}/><PageHeader eyebrow={event.name} title="Scouting summary."/><section className="card summary-card"><div className="card-head"><h2>Live team data</h2><div className="row-actions"><Link className="button secondary" href={`/events/${eventKey}/compare`}>Compare teams</Link><Link className="button secondary" href={`/events/${eventKey}/teams`}>Team directory</Link></div></div>{apiError && <p className="error">{apiError}</p>}<SummaryTable eventKey={eventKey} rows={rows as any} sort={sort} dir={dir}/></section><section className="card summary-card section"><div className="card-head"><div><h2>Pre-scout sheet</h2><p className="muted">Every team’s latest pre-scout report in one spreadsheet-style view.</p></div></div><div className="table-scroll"><table className="pre-scout-table"><thead><tr><th>Team</th><th>Auto</th><th>Active HUB</th><th>Inactive HUB</th><th>Traversal</th><th>Average fuel</th><th>With them</th><th>Against them</th></tr></thead><tbody>{(eventTeams ?? []).sort((a: any,b: any) => a.teams?.team_number - b.teams?.team_number).map((link: any) => { const report: any = latestPreScout.get(link.team_id) ?? {}; return <tr key={link.team_id}><td>{link.teams?.team_number} · {link.teams?.name}</td><td>{report.autos ?? "—"}</td><td>{report.active_shift ?? "—"}</td><td>{report.inactive_shift ?? "—"}</td><td>{report.traversal ?? "—"}</td><td>{report.average_pieces ?? "—"}</td><td>{report.with_them ?? "—"}</td><td>{report.against_them ?? "—"}</td></tr>; })}</tbody></table></div></section></AppShell>;
}
