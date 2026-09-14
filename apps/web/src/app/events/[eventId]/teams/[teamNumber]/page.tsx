import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell, PageHeader } from "@/components/app-shell";
import { LiveRefresh } from "@/components/live-refresh";
import { createClient } from "@/lib/supabase/server";
import { calculateScoutStats, formatStat } from "@/lib/scouting-stats";
import { LocalDateTime } from "@/components/local-date-time";
import { PayloadGrid } from "@/components/scouting-payload";
import { TeamMatchTimeline, type TimelineMatch } from "./team-match-timeline";
import { TeamRobotProfile } from "./team-robot-profile";

type TbaMatch = { key: string; match_number: number; comp_level?: string; actual_time?: number; alliances?: { red?: { team_keys?: string[]; score?: number }; blue?: { team_keys?: string[]; score?: number } } };
type LocalMatch = { id: string; match_number: number; match_type: string; scheduled_at: string | null; red_teams: string[]; blue_teams: string[]; red_score: number | null; blue_score: number | null };

function entryBreakdown(payload: Record<string, any> | null | undefined) {
  const auto = Number(payload?.auto?.shoot ?? 0) + Number(payload?.auto?.ferry ?? 0) || Number(payload?.auto_fuel ?? 0);
  const teleop = Number(payload?.teleop?.shoot ?? payload?.teleop_fuel ?? 0) + Number(payload?.teleop?.ferry ?? 0) || Number(payload?.teleop_fuel ?? 0);
  return { auto, teleop, total: auto + teleop, fouls: Number(payload?.fouls ?? 0), defense: Number(payload?.defense_level ?? 0), broken: payload?.robot_broke ? 1 : 0 };
}
const localMatchKey = (type: string, matchNumber: number) => `${type}:${matchNumber}`;
const tbaMatchType = (match: TbaMatch) => match.comp_level === "qm" ? "qualification" : "playoff";
const localMatchLabel = (match: LocalMatch) => match.match_type === "qualification" ? `Q${match.match_number}` : match.match_type === "practice" ? `Practice ${match.match_number}` : `Playoff ${match.match_number}`;

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
    (supabase as any).from("scouting_entries").select("id,entry_type,payload,status,submitted_at,created_at,matches(id,match_number,match_type),profiles(display_name)").eq("event_id", event.id).eq("team_id", team.id).order("created_at", { ascending: false }),
    (supabase as any).from("pit_photos").select("storage_path").eq("event_id", event.id).eq("team_id", team.id).order("created_at", { ascending: false }),
    (supabase as any).from("matches").select("id,match_number,match_type,scheduled_at,red_teams,blue_teams,red_score,blue_score").eq("event_id", event.id).order("scheduled_at"),
  ]);

  const photoUrls = (await Promise.all((photos ?? []).map(async (photo: any) => {
    const { data } = await supabase.storage.from("pit-photos").createSignedUrl(photo.storage_path, 3600);
    return data?.signedUrl;
  }))).filter(Boolean) as string[];
  const matchEntries = (entries ?? []).filter((entry: any) => entry.entry_type === "match");
  const submittedEntries = matchEntries.filter((entry: any) => entry.status === "submitted");
  const byType = (type: string) => (entries ?? []).filter((entry: any) => entry.entry_type === type);
  const stats = calculateScoutStats(matchEntries);
  const teamMatches = ((localMatches ?? []) as LocalMatch[]).filter((match) => [...(match.red_teams ?? []), ...(match.blue_teams ?? [])].includes(team.id));
  const localByKey = new Map(teamMatches.map((match) => [localMatchKey(match.match_type, match.match_number), match]));
  const reportByMatchId = new Map<string, any>();
  for (const entry of submittedEntries) if (entry.matches?.id && !reportByMatchId.has(entry.matches.id)) reportByMatchId.set(entry.matches.id, entry);

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
    ].includes(`frc${team.team_number}`)).sort((a: TbaMatch, b: TbaMatch) => a.match_number - b.match_number);
    if (rankingsResponse.ok && Array.isArray(rankingsJson?.rankings)) tba = rankingsJson.rankings.find((ranking: any) => ranking.team_key === `frc${team.team_number}`);
    opr = Number(oprsJson?.oprs?.[`frc${team.team_number}`] ?? 0);
  } catch {}

  const toTimeline = (match: LocalMatch, official?: TbaMatch): TimelineMatch => {
    const red = official ? official.alliances?.red?.team_keys?.includes(`frc${team.team_number}`) : match.red_teams.includes(team.id);
    const ours = official ? (red ? official.alliances?.red?.score : official.alliances?.blue?.score) : (red ? match.red_score : match.blue_score);
    const theirs = official ? (red ? official.alliances?.blue?.score : official.alliances?.red?.score) : (red ? match.blue_score : match.red_score);
    const outcome = typeof ours === "number" && typeof theirs === "number" ? ours > theirs ? "win" : ours < theirs ? "loss" : "tie" : "pending";
    const report = reportByMatchId.get(match.id); const values = report ? entryBreakdown(report.payload) : null;
    return { id: official?.key ?? match.id, label: official ? (official.comp_level === "qm" ? `Q${official.match_number}` : `Playoff ${official.match_number}`) : localMatchLabel(match), alliance: red ? "red" : "blue", outcome, score: typeof ours === "number" && typeof theirs === "number" ? `${ours} – ${theirs}` : "Not played", tbaUrl: official ? `https://www.thebluealliance.com/match/${official.key}` : undefined, report: report ? { id: report.id, payload: report.payload ?? {}, scout: report.profiles?.display_name ?? "Scout" } : undefined, hasScout: Boolean(report), totalFuel: values?.total ?? null, autoFuel: values?.auto ?? null, teleopFuel: values?.teleop ?? null, fouls: values?.fouls ?? null, defense: values?.defense ?? null, broken: values?.broken ?? null };
  };
  const officialTimeline = tbaMatches.map((match) => { const local = localByKey.get(localMatchKey(tbaMatchType(match), match.match_number)); return local ? toTimeline(local, match) : null; }).filter(Boolean) as TimelineMatch[];
  const timeline = officialTimeline.length ? officialTimeline : teamMatches.map((match) => toTimeline(match));
  const preScoutCount = byType("pre_scout").length;
  const pitEntries = byType("pit");
  const pitCount = pitEntries.length;
  const teamNames = Object.fromEntries((eventTeams ?? []).map((row: any) => [row.team_id, `${row.teams?.team_number ?? "Unknown"} · ${row.teams?.name ?? "team"}`]));
  const overview = [
    { label: "Scout reports", value: String(stats.entries), detail: stats.entries ? "match reports recorded" : "no match data yet" },
    { label: "Avg fuel / match", value: formatStat(stats.totalFuel), detail: `${formatStat(stats.autoFuel)} auto · ${formatStat(stats.teleopFuel)} teleop` },
    { label: "TBA rank", value: tba?.rank ? `#${tba.rank}` : "—", detail: tba?.record ? `${tba.record.wins}-${tba.record.losses}-${tba.record.ties} record` : "not published" },
    { label: "OPR", value: opr ? formatStat(opr) : "—", detail: "official TBA metric" },
  ];

  return <AppShell active="Teams">
    <LiveRefresh tables={["scouting_entries", "pit_photos", "matches", "event_teams"]} eventId={event.id} />
    <PageHeader eyebrow={event.name} title={`${team.team_number} · ${team.name}`} />

    {photoUrls.length > 0 && <section className="card section"><h2>Pit photos</h2><div className="pit-photo-grid">{photoUrls.map((url, index) => <img key={url} src={url} alt={`${team.team_number} pit photo ${index + 1}`} />)}</div></section>}

    <section className="card team-overview">
      {!event.is_manual && <div className="team-overview-link"><Link className="link" href={`https://www.thebluealliance.com/team/${team.team_number}`} target="_blank">Open TBA →</Link></div>}
      <div className="team-overview-metrics">{overview.map((item) => <div key={item.label}><span>{item.label}</span><strong>{item.value}</strong><small>{item.detail}</small></div>)}</div>
    </section>

    <TeamRobotProfile eventId={event.id} eventKey={event.event_key} teamId={team.id} teamNumber={team.team_number} drivetrainType={teamLink?.drivetrain_type ?? null} shooterType={teamLink?.shooter_type ?? null}/>

    <div className="section"><TeamMatchTimeline matches={timeline} teamNames={teamNames}/></div>
    <section className="card section"><div><h2>Research coverage</h2><div className="coverage-list">{pitEntries.length ? <details className="team-pit-details"><summary><strong>Pit scouting</strong><span>{pitCount} report{pitCount === 1 ? "" : "s"} available</span></summary><div className="team-pit-reports">{pitEntries.map((entry: any) => <section key={entry.id} className="team-pit-report"><div className="team-pit-report-head"><span>{entry.profiles?.display_name ?? "Scout"} · {entry.submitted_at ? <LocalDateTime value={entry.submitted_at}/> : "Draft"}</span><Link className="link" href={`/submissions/${entry.id}`}>Open report →</Link></div><PayloadGrid payload={entry.payload ?? {}} compact teamNames={teamNames}/></section>)}</div></details> : <div><strong>Pit scouting</strong><span>Not scouted yet</span></div>}<div><strong>Pre-scouting</strong><span>{preScoutCount ? `${preScoutCount} report${preScoutCount === 1 ? "" : "s"} available` : "Not scouted yet"}</span></div><div><strong>Pit photos</strong><span>{photoUrls.length ? `${photoUrls.length} photo${photoUrls.length === 1 ? "" : "s"} available` : "No photos yet"}</span></div></div><Link className="link" href="/scout/manual">Open scouting forms →</Link></div></section>

  </AppShell>;
}
