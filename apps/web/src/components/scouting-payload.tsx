"use client";

import type { ReactNode } from "react";

const labels: Record<string, string> = {
  auto: "Autonomous", auto_fuel: "Autonomous fuel", auto_routines_notes: "Auton notes", break_tag: "Breakage type", break_timestamp: "Time broken", comments: "Comments", defended_teams: "Teams defended", defense: "Played defense", defense_level: "Defense level", ferry: "Ferried", fouls: "Fouls", manual_match: "Manual match", no_show: "No show", no_show_reason: "No-show reason", robot_broke: "Robot broke or was disabled", shoot: "Scored", starting_spot: "Starting position", starting_spot_confirmed: "Starting position confirmed", teleop: "Teleop", teleop_fuel: "Teleop fuel",
};

function fieldLabel(key: string) { return labels[key] ?? key.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function scalar(value: unknown) { if (typeof value === "boolean") return value ? "Yes" : "No"; if (value === null || value === undefined || value === "") return "Not recorded"; return String(value); }
function readableSpot(value: unknown) { return String(value).split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" "); }

function ScoreSummary({ value }: { value: Record<string, unknown> }) {
  return <div className="payload-score"><span><small>Scored</small><strong>{scalar(value.shoot)}</strong></span><span><small>Ferried</small><strong>{scalar(value.ferry)}</strong></span></div>;
}

function PayloadValue({ value, fieldKey, teamNames }: { value: unknown; fieldKey?: string; teamNames: Record<string, string> }) {
  if ((fieldKey === "auto" || fieldKey === "teleop") && typeof value === "object" && value !== null && !Array.isArray(value)) return <ScoreSummary value={value as Record<string, unknown>} />;
  if (fieldKey === "starting_spot") return <span>{readableSpot(value)}</span>;
  if (Array.isArray(value)) return value.length ? <div className="submission-array">{value.map((item, index) => <div className="submission-array-item" key={index}>{fieldKey === "defended_teams" ? teamNames[String(item)] ?? "Unknown team" : typeof item === "object" && item !== null ? <PayloadGrid payload={item as Record<string, unknown>} compact teamNames={teamNames}/> : scalar(item)}</div>)}</div> : <span>Not recorded</span>;
  if (typeof value === "object" && value !== null) return <PayloadGrid payload={value as Record<string, unknown>} compact teamNames={teamNames}/>;
  return <span>{scalar(value)}</span>;
}

function AutoPathPreview({ svg }: { svg: string }) {
  if (!svg.includes("<svg") || !svg.includes("<path")) return <span>Not recorded</span>;
  return <div className="auto-path-preview"><img src={`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`} alt="Autonomous route drawn over the 2026 field"/></div>;
}

export function PayloadGrid({ payload, compact = false, teamNames }: { payload: Record<string, unknown>; compact?: boolean; teamNames: Record<string, string> }) {
  const hasPeriodBreakdown = "auto" in payload || "teleop" in payload;
  const robotBroke = payload.robot_broke === true;
  const playedDefense = payload.defense === true;
  const hasBreakageIssues = Array.isArray(payload.breakage_issues) && payload.breakage_issues.length > 0;
  const displayOrder: Record<string, number> = {
    starting_spot: 0,
    auto: 10,
    teleop: 11,
    robot_broke: 30,
    breakage_issues: 31,
    break_tag: 32,
    break_timestamp: 33,
    fouls: 40,
    defense: 50,
    defense_level: 51,
    defended_teams: 52,
    comments: 60,
  };
  const fields = Object.entries(payload)
    .filter(([key, value]) => ((value !== undefined && value !== null && value !== "") || key === "comments" || (key === "break_timestamp" && robotBroke))
      && !(hasPeriodBreakdown && ["auto_fuel", "teleop_fuel", "starting_spot_confirmed", "report_source"].includes(key))
      && !(key === "no_show" && value === false)
      && !(key === "robot_broke" && !robotBroke)
      && !(["breakage_issues", "break_tag", "break_timestamp"].includes(key) && !robotBroke)
      && !(hasBreakageIssues && key === "break_tag")
      && !(key === "defense" && !playedDefense)
      && !(["defense_level", "defended_teams"].includes(key) && !playedDefense))
    .sort(([firstKey], [secondKey]) => (displayOrder[firstKey] ?? 100) - (displayOrder[secondKey] ?? 100));
  if (!fields.length) return <p className="muted">No field values were saved for this entry.</p>;
  return <dl className={compact ? "submission-detail-grid submission-detail-grid-compact" : "submission-detail-grid"}>{fields.map(([key, value]) => <div className={[key === "auto_routines_drawing" ? "submission-drawing" : "", key === "starting_spot" ? "payload-starting-position" : "", key === "comments" ? "payload-comments" : "", key === "auto" || key === "teleop" ? "payload-period" : "", key === "robot_broke" || key === "breakage_issues" ? "payload-breakage" : ""].filter(Boolean).join(" ") || undefined} key={key}><dt>{fieldLabel(key)}</dt><dd>{key === "auto_routines_drawing" && typeof value === "string" ? <AutoPathPreview svg={value}/> : <PayloadValue value={value} fieldKey={key} teamNames={teamNames}/>}</dd></div>)}</dl>;
}

function MatchPeriod({ label, value }: { label: string; value: unknown }) {
  const score = typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
  return <div className="match-report-period"><strong>{label}</strong><div><span>Scored</span><b>{scalar(score.shoot)}</b></div><div><span>Ferried</span><b>{scalar(score.ferry)}</b></div></div>;
}

function FactLine({ label, children }: { label: string; children: ReactNode }) {
  return <div className="match-report-fact"><strong>{label}</strong><span>{children}</span></div>;
}

export function MatchReportSummary({ payload, teamNames, showScoreDetails = true }: { payload: Record<string, unknown>; teamNames: Record<string, string>; showScoreDetails?: boolean }) {
  const comments = typeof payload.comments === "string" ? payload.comments.trim() : "";
  const broke = payload.robot_broke === true;
  const defended = Array.isArray(payload.defended_teams) ? payload.defended_teams.map((team) => teamNames[String(team)] ?? String(team)).filter(Boolean) : [];
  const rawIssues = Array.isArray(payload.breakage_issues) ? payload.breakage_issues : [];
  const issues: Record<string, unknown>[] = rawIssues.map((item) => typeof item === "object" && item !== null ? item as Record<string, unknown> : { issue: item, timestamp: null }).filter((item) => item.issue || item.timestamp);
  const fallbackIssue: Record<string, unknown>[] = payload.break_tag ? [{ issue: payload.break_tag, timestamp: payload.break_timestamp }] : [];
  const breakage = issues.length ? issues : fallbackIssue;
  const hasFouls = payload.fouls !== undefined && payload.fouls !== null;
  const playedDefense = payload.defense === true;
  return <div className="match-report-summary">{typeof payload.starting_spot === "string" && payload.starting_spot && <div className="match-report-start"><span>Starting position</span><strong>{readableSpot(payload.starting_spot)}</strong></div>}{showScoreDetails && <div className="match-report-periods"><MatchPeriod label="Autonomous" value={payload.auto}/><MatchPeriod label="Teleop" value={payload.teleop}/></div>}<div className="match-report-facts">{showScoreDetails && hasFouls && <FactLine label="Fouls">{scalar(payload.fouls)}</FactLine>}{broke && <FactLine label="Broken"><b>Yes</b>{breakage.map((issue, index) => <span className="match-report-dot" key={index}>{scalar(issue.issue)}{issue.timestamp ? ` (${scalar(issue.timestamp)})` : ""}</span>)}</FactLine>}{showScoreDetails && playedDefense && <FactLine label="Defense"><b>Yes</b>{payload.defense_level !== undefined && payload.defense_level !== null && <span className="match-report-dot">Level {scalar(payload.defense_level)}</span>}{defended.map((team) => <span className="match-report-dot" key={team}>{team}</span>)}</FactLine>}{comments && <FactLine label="Comments">{comments}</FactLine>}</div></div>;
}
