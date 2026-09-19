import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell, PageHeader } from "@/components/app-shell";
import { LiveRefresh } from "@/components/live-refresh";
import { createClient } from "@/lib/supabase/server";
import { calculateScoutStats, competitiveMatchEntries, formatStat } from "@/lib/scouting-stats";
import { LocalDateTime } from "@/components/local-date-time";
import { PayloadGrid } from "@/components/scouting-payload";
import { TeamMatchTimeline, type TimelineMatch } from "./team-match-timeline";
import { TeamPhotoCarousel } from "./team-photo-carousel";
import { TeamRobotProfile } from "./team-robot-profile";
import { compactManualMatchLabel, compactMatchLabel, manualMatchLabel, matchLabel, matchRoundOrder } from "@/lib/match-label";

type TbaMatch = { key: string; match_number: number; comp_level?: string; actual_time?: number; alliances?: { red?: { team_keys?: string[]; score?: number }; blue?: { team_keys?: string[]; score?: number } } };
type LocalMatch = { id: string; tba_match_key: string; match_number: number; match_type: string; scheduled_at: string | null; red_teams: string[]; blue_teams: string[]; red_score: number | null; blue_score: number | null };

function entryBreakdown(payload: Record<string, any> | null | undefined) {
  const autoScored = Number(payload?.auto?.shoot ?? payload?.auto_fuel ?? 0);
  const autoFerried = Number(payload?.auto?.ferry ?? 0);
  const teleopScored = Number(payload?.teleop?.shoot ?? payload?.teleop_fuel ?? 0);
  const teleopFerried = Number(payload?.teleop?.ferry ?? 0);
  const auto = autoScored + autoFerried || Number(payload?.auto_fuel ?? 0);
  const teleop = teleopScored + teleopFerried || Number(payload?.teleop_fuel ?? 0);
  return { auto, teleop, total: auto + teleop, scored: autoScored + teleopScored, ferried: autoFerried + teleopFerried, fouls: Number(payload?.fouls ?? 0), defense: Number(payload?.defense_level ?? 0), broken: payload?.robot_broke ? 1 : 0 };
}
function averageEntryBreakdown(entries: { payload: Record<string, any> | null | undefined }[]) {
  if (!entries.length) return null;
  const totals = entries.reduce((result, entry) => {
    const values = entryBreakdown(entry.payload);
    return { auto: result.auto + values.auto, teleop: result.teleop + values.teleop, total: result.total + values.total, scored: result.scored + values.scored, ferried: result.ferried + values.ferried, fouls: result.fouls + values.fouls, defense: result.defense + values.defense, broken: Math.max(result.broken, values.broken) };
  }, { auto: 0, teleop: 0, total: 0, scored: 0, ferried: 0, fouls: 0, defense: 0, broken: 0 });
  return { auto: totals.auto / entries.length, teleop: totals.teleop / entries.length, total: totals.total / entries.length, scored: totals.scored / entries.length, ferried: totals.ferried / entries.length, fouls: totals.fouls / entries.length, defense: totals.defense / entries.length, broken: totals.broken };
}
const tbaMatchType = (match: TbaMatch) => match.comp_level === "qm" ? "qualification" : match.comp_level === "pm" ? "practice" : "playoff";
const localMatchLabel = (match: LocalMatch) => matchLabel({ match_number: match.match_number, match_type: match.match_type, tba_match_key: match.tba_match_key });

export default async function TeamDetail({ params }: { params: Promise<{ eventId: string; teamNumber: string }> }) {
  const { eventId: eventKey, teamNumber } = await params;
  const number = Number(teamNumber);
  if (!Number.isSafeInteger(number) || number < 1) notFound();

  const supabase = await createClient();
  const { data: event } = await supabase.from("events").select("id,event_key,name,is_manual").eq("event_key", eventKey).maybeSingle();
  if (!event) notFound();

  const { data: eventTeams } = await supabase.from("event_teams").select("team_id,drivetrain_type,shooter_type,teams(id,team_number,name)").eq("event_id", event.id);
  const teamLink = (eventTeams ?? []).find((row: any) => row.teams?.team_number === number) as any;
  const team = (teamLink?.teams ?? null) as { id: string; team_number: number; name: string } | null;
  if (!team) notFound();

  const [{ data: entries }, { data: photos }, { data: localMatches }] = await Promise.all([
    (supabase as any).from("scouting_entries").select("id,match_id,entry_type,payload,status,submitted_at,created_at,matches(id,match_number,match_type,tba_match_key),author:profiles!scouting_entries_scout_user_id_fkey(display_name)").eq("event_id", event.id).eq("team_id", team.id).order("created_at", { ascending: false }),
    (supabase as any).from("pit_photos").select("storage_path").eq("event_id", event.id).eq("team_id", team.id).order("created_at", { ascending: false }),
    (supabase as any).from("matches").select("id,tba_match_key,match_number,match_type,scheduled_at,red_teams,blue_teams,red_score,blue_score").eq("event_id", event.id).order("scheduled_at"),
  ]);

  const photoUrls = (await Promise.all((photos ?? []).map(async (photo: any) => {
    const { data } = await supabase.storage.from("pit-photos").createSignedUrl(photo.storage_path, 3600);
    return data?.signedUrl;
  }))).filter(Boolean) as string[];
  const matchEntries = (entries ?? []).filter((entry: any) => entry.entry_type === "match");
  const submittedEntries = matchEntries.filter((entry: any) => entry.status === "submitted");
  const byType = (type: string) => (entries ?? []).filter((entry: any) => entry.entry_type === type);
  const stats = calculateScoutStats(competitiveMatchEntries(matchEntries));
  const teamMatches = ((localMatches ?? []) as LocalMatch[]).filter((match) => [...(match.red_teams ?? []), ...(match.blue_teams ?? [])].includes(team.id));
  const localByTbaKey = new Map(teamMatches.map((match) => [match.tba_match_key, match]));
  const reportsByMatchId = new Map<string, any[]>();
  for (const entry of submittedEntries) if (entry.matches?.id) reportsByMatchId.set(entry.matches.id, [...(reportsByMatchId.get(entry.matches.id) ?? []), entry]);

  let tbaMatches: TbaMatch[] = [];
  let tba: any = null;
  let opr = 0;
  if (!event.is_manual && process.env.TBA_AUTH_KEY) try {
    const headers = { "X-TBA-Auth-Key": process.env.TBA_AUTH_KEY };
    const [matchesResponse, rankingsResponse, oprsResponse] = await Promise.all([
      fetch(`https://www.thebluealliance.com/api/v3/event/${event.event_key}/matches`, { headers, cache: "no-store" }),
      fetch(`https://www.thebluealliance.com/api/v3/event/${event.event_key}/rankings`, { headers, cache: "no-store" }),
      fetch(`https://www.thebluealliance.com/api/v3/event/${event.event_key}/oprs`, { headers, cache: "no-store" }),
    ]);
    const [matchesJson, rankingsJson, oprsJson] = await Promise.all([matchesResponse.json(), rankingsResponse.json(), oprsResponse.json()]);
    if (matchesResponse.ok && Array.isArray(matchesJson)) tbaMatches = matchesJson.filter((match: TbaMatch) => [
      ...(match.alliances?.red?.team_keys ?? []),
      ...(match.alliances?.blue?.team_keys ?? []),
    ].includes(`frc${team.team_number}`)).sort((a: TbaMatch, b: TbaMatch) => matchRoundOrder({ match_type: tbaMatchType(a), tba_match_key: a.key }) - matchRoundOrder({ match_type: tbaMatchType(b), tba_match_key: b.key }) || a.key.localeCompare(b.key, undefined, { numeric: true }));
    if (rankingsResponse.ok && Array.isArray(rankingsJson?.rankings)) tba = rankingsJson.rankings.find((ranking: any) => ranking.team_key === `frc${team.team_number}`);
    opr = Number(oprsJson?.oprs?.[`frc${team.team_number}`] ?? 0);
  } catch {}

  const toTimeline = (match: LocalMatch, official?: TbaMatch): TimelineMatch => {
    const red = official ? official.alliances?.red?.team_keys?.includes(`frc${team.team_number}`) : match.red_teams.includes(team.id);
    const ours = official ? (red ? official.alliances?.red?.score : official.alliances?.blue?.score) : (red ? match.red_score : match.blue_score);
    const theirs = official ? (red ? official.alliances?.blue?.score : official.alliances?.red?.score) : (red ? match.blue_score : match.red_score);
    const outcome = typeof ours === "number" && typeof theirs === "number" ? ours > theirs ? "win" : ours < theirs ? "loss" : "tie" : "pending";
    const reports = reportsByMatchId.get(match.id) ?? []; const values = averageEntryBreakdown(reports);
    const matchType: TimelineMatch["matchType"] = official ? tbaMatchType(official) : match.match_type as TimelineMatch["matchType"];
    const tbaMatchKey = official?.key ?? match.tba_match_key;
    return { id: official?.key ?? match.id, label: official ? matchLabel({ match_number: official.match_number, match_type: matchType, tba_match_key: official.key }) : localMatchLabel(match), axisLabel: official ? compactMatchLabel({ match_number: official.match_number, match_type: matchType, tba_match_key: official.key }) : compactMatchLabel({ match_number: match.match_number, match_type: match.match_type, tba_match_key: match.tba_match_key }), matchType, roundOrder: matchRoundOrder({ match_type: matchType, tba_match_key: tbaMatchKey }), alliance: red ? "red" : "blue", outcome, score: typeof ours === "number" && typeof theirs === "number" ? `${ours} – ${theirs}` : "Not played", tbaUrl: official ? `https://www.thebluealliance.com/match/${official.key}` : undefined, reports: reports.map((report) => ({ id: report.id, payload: report.payload ?? {}, scout: report.author?.display_name ?? "Scout" })), hasScout: reports.length > 0, totalFuel: values?.total ?? null, autoFuel: values?.auto ?? null, teleopFuel: values?.teleop ?? null, scored: values?.scored ?? null, ferried: values?.ferried ?? null, fouls: values?.fouls ?? null, defense: values?.defense ?? null, broken: values?.broken ?? null };
  };
  const officialTimeline = tbaMatches.map((match) => { const local = localByTbaKey.get(match.key); return local ? { local, timeline: toTimeline(local, match) } : null; }).filter(Boolean) as { local: LocalMatch; timeline: TimelineMatch }[];
  const manualTimeline = submittedEntries.filter((entry: any) => !entry.match_id).map((entry: any): TimelineMatch | null => {
    const details = entry.payload?.manual_match;
    if (!details || typeof details !== "object" || Array.isArray(details)) return null;
    const stage = typeof details.stage === "string" ? details.stage.trim().toLowerCase() : "other";
    const matchType: TimelineMatch["matchType"] = stage === "qualification" ? "qualification" : stage === "practice" ? "practice" : ["quarterfinal", "semifinal", "final", "playoff"].includes(stage) ? "playoff" : "other";
    const values = entryBreakdown(entry.payload);
    return { id: entry.id, label: manualMatchLabel(details), axisLabel: compactManualMatchLabel(details), matchType, roundOrder: matchType === "other" ? 6 : matchRoundOrder({ match_type: matchType, tba_match_key: null }), alliance: details.alliance === "blue" ? "blue" : "red", outcome: "pending", score: "Manual report", reports: [{ id: entry.id, payload: entry.payload ?? {}, scout: entry.author?.display_name ?? "Scout" }], hasScout: true, totalFuel: values.total, autoFuel: values.auto, teleopFuel: values.teleop, scored: values.scored, ferried: values.ferried, fouls: values.fouls, defense: values.defense, broken: values.broken };
  }).filter(Boolean) as TimelineMatch[];
  const timeline = [...officialTimeline.map(({ timeline }) => timeline), ...teamMatches.filter((match) => !officialTimeline.some(({ local }) => local.id === match.id)).map((match) => toTimeline(match)), ...manualTimeline].sort((first, second) => first.roundOrder - second.roundOrder || first.label.localeCompare(second.label, undefined, { numeric: true }));
  const preScoutEntries = byType("pre_scout");
  const preScoutCount = preScoutEntries.length;
  const pitEntries = byType("pit");
  const pitCount = pitEntries.length;
  const teamNames = Object.fromEntries((eventTeams ?? []).map((row: any) => [row.team_id, `${row.teams?.team_number ?? "Unknown"} · ${row.teams?.name ?? "team"}`]));
  const overview = [
    { label: "Scout reports", value: String(stats.entries), detail: stats.entries ? "match reports recorded" : "no match data yet" },
    { label: "Auto scouting", value: `Scored ${formatStat(stats.autoAvgScored)}`, detail: `Ferried ${formatStat(stats.autoAvgFerried)}` },
    { label: "Teleop scouting", value: `Scored ${formatStat(stats.teleopAvgScored)}`, detail: `Ferried ${formatStat(stats.teleopAvgFerried)}` },
    { label: "TBA rank", value: tba?.rank ? `#${tba.rank}` : "—", detail: tba?.record ? `${tba.record.wins}-${tba.record.losses}-${tba.record.ties} record` : "not published" },
    { label: "OPR", value: opr ? formatStat(opr) : "—", detail: "official TBA metric" },
  ];

  return <AppShell active="Teams">
    <LiveRefresh tables={["scouting_entries", "pit_photos", "matches", "event_teams"]} eventId={event.id} />
    <PageHeader eyebrow={event.name} title={`${team.team_number} · ${team.name}`} />

    <section className="card team-hero">
      <div className="team-hero-photo"><TeamPhotoCarousel photos={photoUrls} teamNumber={team.team_number}/></div>
      <div className="team-hero-summary">
        <div className="team-hero-head"><h2>Team snapshot</h2>{!event.is_manual && <Link className="link" href={`https://www.thebluealliance.com/team/${team.team_number}`} target="_blank">Open TBA →</Link>}</div>
        <div className="team-overview-metrics">{overview.map((item) => <div key={item.label}><span>{item.label}</span><strong>{item.value}</strong><small>{item.detail}</small></div>)}</div>
      </div>
    </section>

    <TeamRobotProfile eventId={event.id} eventKey={event.event_key} teamId={team.id} teamNumber={team.team_number} drivetrainType={teamLink?.drivetrain_type ?? null} shooterType={teamLink?.shooter_type ?? null}/>

    <div className="section"><TeamMatchTimeline matches={timeline} teamNames={teamNames}/></div>
    <section className="card section team-research"><div className="team-research-head"><div><h2>Scouting research</h2><p className="muted">Open a category to review its submitted reports.</p></div><Link className="link" href="/scout/manual">Open scouting forms →</Link></div><div className="coverage-list">{pitEntries.length ? <details className="team-research-details"><summary><span className="team-research-category"><strong>Pit scouting</strong><small>{pitCount} report{pitCount === 1 ? "" : "s"} available</small></span><span className="team-research-action">View reports</span></summary><div className="team-pit-reports">{pitEntries.map((entry: any) => <section key={entry.id} className="team-pit-report"><div className="team-pit-report-head"><span>{entry.author?.display_name ?? "Scout"} · {entry.submitted_at ? <LocalDateTime value={entry.submitted_at}/> : "Draft"}</span><Link className="link" href={`/submissions/${entry.id}`}>Open report →</Link></div><PayloadGrid payload={entry.payload ?? {}} compact teamNames={teamNames}/></section>)}</div></details> : <div className="team-research-empty"><span className="team-research-category"><strong>Pit scouting</strong><small>No reports available</small></span><span>Not scouted yet</span></div>}{preScoutEntries.length ? <details className="team-research-details"><summary><span className="team-research-category"><strong>Pre-scouting</strong><small>{preScoutCount} report{preScoutCount === 1 ? "" : "s"} available</small></span><span className="team-research-action">View reports</span></summary><div className="team-pit-reports">{preScoutEntries.map((entry: any) => <section key={entry.id} className="team-pit-report"><div className="team-pit-report-head"><span>{entry.author?.display_name ?? "Scout"} · {entry.submitted_at ? <LocalDateTime value={entry.submitted_at}/> : "Draft"}</span><Link className="link" href={`/submissions/${entry.id}`}>Open report →</Link></div><PayloadGrid payload={entry.payload ?? {}} compact teamNames={teamNames}/></section>)}</div></details> : <div className="team-research-empty"><span className="team-research-category"><strong>Pre-scouting</strong><small>No reports available</small></span><span>Not scouted yet</span></div>}</div></section>

  </AppShell>;
}
