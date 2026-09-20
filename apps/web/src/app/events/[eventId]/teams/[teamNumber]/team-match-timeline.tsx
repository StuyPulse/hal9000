"use client";

import Link from "next/link";
import { ChevronDown, ExternalLink } from "lucide-react";
import { ResponsiveContainer, Line, LineChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { MatchReportSummary } from "@/components/scouting-payload";
import { AppSelect } from "@/components/app-select";
import { createClient } from "@/lib/supabase/client";

type MetricKey = "totalFuel" | "autoFuel" | "teleopFuel" | "fouls" | "defense" | "broken";
const metricOptions: { key: MetricKey; label: string; color: string }[] = [{ key: "totalFuel", label: "Avg fuel", color: "#f24444" }, { key: "autoFuel", label: "Auto fuel", color: "#f2bf44" }, { key: "teleopFuel", label: "Teleop fuel", color: "#60a5fa" }, { key: "fouls", label: "Fouls", color: "#c084fc" }, { key: "defense", label: "Defense", color: "#34d399" }, { key: "broken", label: "Broken", color: "#fb7185" }];
export type TimelineMatch = { id: string; sourceKey: string; selectedReportId: string | null; label: string; axisLabel: string; matchType: "qualification" | "playoff" | "practice" | "other"; roundOrder: number; alliance: "red" | "blue"; outcome: "win" | "loss" | "tie" | "pending"; score: string; tbaUrl?: string; reports: { id: string; payload: Record<string, unknown>; scout: string }[]; hasScout: boolean; totalFuel: number | null; autoFuel: number | null; teleopFuel: number | null; scored: number | null; ferried: number | null; fouls: number | null; defense: number | null; broken: number | null };
const label = (outcome: TimelineMatch["outcome"]) => outcome === "win" ? "Won" : outcome === "loss" ? "Lost" : outcome === "tie" ? "Tied" : "Pending";
const value = (number: number | null) => number === null ? "—" : number.toFixed(2);
const reportValue = (payload: Record<string, unknown>, phase: "auto" | "teleop", field: "shoot" | "ferry", fallback: "auto_fuel" | "teleop_fuel") => {
  const phasePayload = payload[phase];
  const phaseValue = phasePayload && typeof phasePayload === "object" ? (phasePayload as Record<string, unknown>)[field] : undefined;
  const raw = phaseValue ?? (field === "shoot" ? payload[fallback] : 0);
  return Number.isFinite(Number(raw)) ? Number(raw) : 0;
};
const reportBreakdown = (payload: Record<string, unknown>) => {
  const autoFuel = reportValue(payload, "auto", "shoot", "auto_fuel");
  const teleopFuel = reportValue(payload, "teleop", "shoot", "teleop_fuel");
  const autoFerried = reportValue(payload, "auto", "ferry", "auto_fuel");
  const teleopFerried = reportValue(payload, "teleop", "ferry", "teleop_fuel");
  return { totalFuel: autoFuel + teleopFuel, autoFuel, teleopFuel, scored: autoFuel + teleopFuel, ferried: autoFerried + teleopFerried, fouls: Number(payload.fouls ?? 0), defense: Number(payload.defense_level ?? 0), broken: payload.robot_broke ? 1 : 0 };
};
const firstName = (name: string) => name.trim().split(/\s+/)[0] || "Scout";
const startingPosition = (payload: Record<string, unknown>) => typeof payload.starting_spot === "string" && payload.starting_spot ? payload.starting_spot.split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ") : "Not recorded";
const defendedTeams = (payload: Record<string, unknown>, teamNames: Record<string, string>) => Array.isArray(payload.defended_teams) ? payload.defended_teams.map((team) => teamNames[String(team)] ?? String(team)).join(", ") : "";

export function TeamMatchTimeline({ matches, teamNames, organizationId, eventId, teamId, canChooseReportSource }: { matches: TimelineMatch[]; teamNames: Record<string, string>; organizationId: string; eventId: string; teamId: string; canChooseReportSource: boolean }) {
  const router = useRouter();
  const [metrics, setMetrics] = useState<MetricKey[]>(["totalFuel", "autoFuel", "teleopFuel"]);
  const [openReport, setOpenReport] = useState<string | null>(null);
  const [reportSourceByMatch, setReportSourceByMatch] = useState<Record<string, string>>(() => Object.fromEntries(matches.map((match) => [match.id, match.selectedReportId ?? "combined"])));
  const [savingSourceForMatch, setSavingSourceForMatch] = useState<string | null>(null);
  const [sourceError, setSourceError] = useState("");
  const [matchScope, setMatchScope] = useState<"all" | "competitive" | "practice">("competitive");
  const visibleMatches = matches.filter((match) => matchScope === "all" || (matchScope === "practice" ? match.matchType === "practice" : match.matchType === "qualification" || match.matchType === "playoff"));
  const hasData = visibleMatches.some((match) => match.hasScout);
  const selectedValues = (match: TimelineMatch) => {
    const selectedReport = match.reports.find((report) => report.id === reportSourceByMatch[match.id]);
    return selectedReport ? reportBreakdown(selectedReport.payload) : { totalFuel: match.totalFuel, autoFuel: match.autoFuel, teleopFuel: match.teleopFuel, scored: match.scored, ferried: match.ferried, fouls: match.fouls, defense: match.defense, broken: match.broken };
  };
  const chartData = visibleMatches.map((match) => ({ ...match, ...selectedValues(match), match: match.axisLabel, ...Object.fromEntries(metricOptions.map(({ key }) => [key, selectedValues(match)[key] ?? undefined])) }));
  const toggleMetric = (key: MetricKey) => setMetrics((current) => current.includes(key) ? current.length === 1 ? current : current.filter((item) => item !== key) : [...current, key].slice(-4));
  async function selectReportSource(match: TimelineMatch, reportId: string) {
    const previousReportId = reportSourceByMatch[match.id] ?? "combined";
    if (!canChooseReportSource || reportId === previousReportId) return;
    setSourceError(""); setReportSourceByMatch((current) => ({ ...current, [match.id]: reportId })); setSavingSourceForMatch(match.id);
    const { error } = await createClient().from("match_report_sources").upsert({ organization_id: organizationId, event_id: eventId, team_id: teamId, match_key: match.sourceKey, selected_entry_id: reportId === "combined" ? null : reportId }, { onConflict: "event_id,team_id,match_key" });
    setSavingSourceForMatch(null);
    if (error) { setReportSourceByMatch((current) => ({ ...current, [match.id]: previousReportId })); setSourceError("Could not save the selected report. Try again."); return; }
    router.refresh();
  }
  return <section className="card team-timeline-card"><div className="card-head"><div><h2>Match timeline</h2><p className="muted">Scheduled and manual results with scouting coverage.</p></div><div className="team-timeline-head-actions"><AppSelect value={matchScope} onValueChange={(value) => { setMatchScope(value as "all" | "competitive" | "practice"); setOpenReport(null); }} ariaLabel="Match timeline scope" options={[{ value: "all", label: "All matches" }, { value: "competitive", label: "Qualifications + playoffs" }, { value: "practice", label: "Practice matches" }]}/><span className="muted">{visibleMatches.filter((match) => match.hasScout).length} / {visibleMatches.length} scouted</span></div></div>{sourceError && <p className="error">{sourceError}</p>}{visibleMatches.length ? <>{hasData ? <><div className="team-timeline-metrics" role="group" aria-label="Chart metrics">{metricOptions.map((metric) => <button type="button" key={metric.key} className={metrics.includes(metric.key) ? "active" : ""} onClick={() => toggleMetric(metric.key)}>{metric.label}</button>)}</div><div className="team-timeline-chart"><ResponsiveContainer width="100%" height="100%"><LineChart data={chartData} margin={{ top: 8, right: 24, bottom: 0, left: 0 }}><CartesianGrid stroke="#303640" strokeDasharray="3 3" vertical={false}/><XAxis dataKey="match" interval={0} padding={{ left: 8, right: 16 }} tick={{ fill: "#969dab", fontSize: 10 }} tickMargin={8} tickLine={false} axisLine={false}/><YAxis tick={{ fill: "#969dab", fontSize: 10 }} tickLine={false} axisLine={false} width={40}/><Tooltip contentStyle={{ background: "#15181d", border: "1px solid #303640", borderRadius: 8, fontSize: 12 }} labelStyle={{ color: "#f3f4f6", fontWeight: 700 }} formatter={(item) => typeof item === "number" ? item.toFixed(2) : item ?? "—"}/>{metricOptions.filter((metric) => metrics.includes(metric.key)).map((metric) => <Line key={metric.key} type="monotone" dataKey={metric.key} name={metric.label} stroke={metric.color} strokeWidth={metric.key === "totalFuel" ? 3 : 2} connectNulls={false} dot={{ r: 3, fill: metric.color, strokeWidth: 0 }}/>)}</LineChart></ResponsiveContainer></div></> : <p className="muted team-timeline-empty">No submitted {matchScope === "practice" ? "practice" : matchScope === "competitive" ? "qualification or playoff" : "match"} reports yet. Scheduled results still appear below.</p>}<div className="team-timeline-list">{visibleMatches.map((match) => {
    const isOpen = openReport === match.id;
    const selectedReport = match.reports.find((report) => report.id === reportSourceByMatch[match.id]);
    const sourceOptions = [{ value: "combined", label: "Combined" }, ...match.reports.map((report) => ({ value: report.id, label: firstName(report.scout) }))];
    const sourceLabel = selectedReport ? firstName(selectedReport.scout) : "Combined";
    const values = selectedValues(match);
    const reportActionLabel = isOpen ? `Hide details for ${match.label}` : `Show details for ${match.label}`;
    return <article key={match.id} className={`team-timeline-row ${match.alliance} ${match.hasScout ? "scouted" : "missing"}`}><div className="team-timeline-match"><strong>{match.label}</strong><span className={match.alliance}>{match.alliance}</span></div><div className="team-timeline-result"><strong>{label(match.outcome)}</strong><span>{match.score}</span></div><div className="team-timeline-coverage"><div className="team-timeline-coverage-head"><strong>{match.hasScout ? <>Scouted {!canChooseReportSource && match.reports.length > 1 && <span className="team-timeline-source">· {sourceLabel}</span>}</> : "Missing"}</strong>{canChooseReportSource && match.reports.length > 1 && <AppSelect className="team-timeline-source-picker" value={selectedReport?.id ?? "combined"} onValueChange={(reportId) => void selectReportSource(match, reportId)} ariaLabel={`Data source for ${match.label}`} disabled={savingSourceForMatch === match.id} options={sourceOptions}/>}</div><span>{match.hasScout ? `Scored ${value(values.scored)} · Ferried ${value(values.ferried)}` : "No submitted report"}</span></div><div className="team-timeline-actions">{match.reports.length > 0 && <button type="button" className="timeline-action-button" aria-label={reportActionLabel} aria-expanded={isOpen} onClick={() => setOpenReport((current) => current === match.id ? null : match.id)}>Reports ({match.reports.length}) <ChevronDown size={16} aria-hidden="true"/></button>}{match.tbaUrl && <Link className="timeline-action-button" href={match.tbaUrl} target="_blank">TBA <ExternalLink size={14} aria-hidden="true"/></Link>}</div>{match.reports.length > 0 && <div className="team-timeline-compact-reports">{match.reports.map((report, index) => { const teamsDefended = defendedTeams(report.payload, teamNames); const defenseDetail = report.payload.defense === true ? `Level ${report.payload.defense_level ?? "—"} / 10${teamsDefended ? ` · ${teamsDefended}` : ""}` : "Not played"; return <div className="team-timeline-compact-report" key={report.id}>{match.reports.length > 1 && <div className="team-timeline-compact-report-head"><span>Report {index + 1} of {match.reports.length}</span></div>}<div className="team-timeline-quick-stats-scroll" role="region" aria-label={`${match.label} report ${index + 1} compact scouting stats; scroll horizontally for more`} tabIndex={0}><dl className="team-timeline-quick-stats"><div><dt>Auto</dt><dd className="team-timeline-starting-position">{startingPosition(report.payload)}</dd><dd><strong>Scored</strong>{reportValue(report.payload, "auto", "shoot", "auto_fuel")} <strong>Ferried</strong>{reportValue(report.payload, "auto", "ferry", "auto_fuel")}</dd></div><div><dt>Teleop</dt><dd><strong>Scored</strong>{reportValue(report.payload, "teleop", "shoot", "teleop_fuel")} <strong>Ferried</strong>{reportValue(report.payload, "teleop", "ferry", "teleop_fuel")}</dd></div><div><dt>Fouls</dt><dd>{Number(report.payload.fouls ?? 0)}</dd></div><div><dt>Defense</dt><dd>{defenseDetail}</dd></div><div><dt>Scouter</dt><dd>{report.scout}</dd></div></dl></div></div>; })}</div>}{isOpen && match.reports.length > 0 && <div className="team-timeline-reports">{match.reports.map((report, index) => <section key={report.id} className="team-timeline-report"><div className="team-timeline-report-head"><span>{`${report.scout}'s report`}</span><span>Report {index + 1} of {match.reports.length}</span><Link className="link" href={`/submissions/${report.id}`}>Open report →</Link></div><MatchReportSummary payload={report.payload} teamNames={teamNames} showScoreDetails={false} showStartingPosition={false}/></section>)}</div>}</article>;
  })}</div></> : <p className="muted">No {matchScope === "practice" ? "practice" : matchScope === "competitive" ? "qualification or playoff" : "scheduled or manual"} matches have been published for this team yet.</p>}</section>;
}
