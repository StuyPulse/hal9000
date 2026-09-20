"use client";

import { useMemo, useState } from "react";

export type LeaderboardEntry = {
  id: string;
  type: "match" | "pit" | "pre_scout";
  scoutUserId: string;
  scoutName: string;
  submittedAt: string;
  matchType: string | null;
  manualStage: string | null;
};

type Section = "all" | "match" | "pit" | "pre_scout";
type MatchRound = "practice" | "qualification" | "playoff";

const sections: { id: Section; label: string }[] = [
  { id: "all", label: "All" },
  { id: "match", label: "Match scouting" },
  { id: "pit", label: "Pit scouting" },
  { id: "pre_scout", label: "Pre scouting" },
];

const rounds: { id: MatchRound; label: string }[] = [
  { id: "practice", label: "Practice" },
  { id: "qualification", label: "Qualification" },
  { id: "playoff", label: "Playoffs" },
];

function matchRound(entry: LeaderboardEntry): MatchRound | null {
  const type = entry.matchType?.trim().toLowerCase();
  if (type === "practice" || type === "qualification") return type;
  if (type === "playoff" || type === "quarterfinal" || type === "semifinal" || type === "final") return "playoff";

  const stage = entry.manualStage?.trim().toLowerCase();
  if (stage === "practice" || stage === "qualification") return stage;
  if (["playoff", "quarterfinal", "semifinal", "final"].includes(stage ?? "")) return "playoff";
  return null;
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}

export function LeaderboardBoard({ entries, eventName }: { entries: LeaderboardEntry[]; eventName: string }) {
  const [section, setSection] = useState<Section>("all");
  const [selectedRounds, setSelectedRounds] = useState<MatchRound[]>(["practice", "qualification", "playoff"]);

  const filteredEntries = useMemo(() => entries.filter((entry) => {
    if (section === "all") return true;
    if (entry.type !== section) return false;
    const round = matchRound(entry);
    return section !== "match" || (round !== null && selectedRounds.includes(round));
  }), [entries, section, selectedRounds]);

  const excludedUnclassified = section === "match"
    ? entries.filter((entry) => entry.type === "match" && matchRound(entry) === null).length
    : 0;

  const rows = useMemo(() => {
    const byScout = new Map<string, { id: string; name: string; total: number; match: number; pit: number; preScout: number; practice: number; qualification: number; playoff: number; latest: string }>();
    for (const entry of filteredEntries) {
      const current = byScout.get(entry.scoutUserId) ?? { id: entry.scoutUserId, name: entry.scoutName, total: 0, match: 0, pit: 0, preScout: 0, practice: 0, qualification: 0, playoff: 0, latest: entry.submittedAt };
      current.total += 1;
      current.latest = new Date(entry.submittedAt) > new Date(current.latest) ? entry.submittedAt : current.latest;
      if (entry.type === "match") {
        current.match += 1;
        const round = matchRound(entry);
        if (round) current[round] += 1;
      }
      if (entry.type === "pit") current.pit += 1;
      if (entry.type === "pre_scout") current.preScout += 1;
      byScout.set(entry.scoutUserId, current);
    }
    return [...byScout.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  }, [filteredEntries]);

  const title = sections.find((item) => item.id === section)?.label ?? "All";

  function toggleRound(round: MatchRound) {
    setSelectedRounds((current) => current.includes(round) ? current.filter((value) => value !== round) : [...current, round]);
  }

  return <section className="leaderboard-card" aria-label={`${eventName} scouting leaderboard`}>
    <div className="leaderboard-heading">
      <div>
        <span className="eyebrow">Active event</span>
        <h2>{title}</h2>
      </div>
      <p className="muted">{filteredEntries.length} submitted report{filteredEntries.length === 1 ? "" : "s"}</p>
    </div>

    <div className="leaderboard-tabs" role="tablist" aria-label="Leaderboard category">
      {sections.map((item) => <button key={item.id} type="button" role="tab" aria-selected={section === item.id} className="leaderboard-tab" onClick={() => setSection(item.id)}>{item.label}</button>)}
    </div>

    {section === "match" && <div className="leaderboard-rounds" aria-label="Match scouting rounds">
      <span>Include rounds</span>
      {rounds.map((round) => <button key={round.id} type="button" className="leaderboard-round" aria-pressed={selectedRounds.includes(round.id)} onClick={() => toggleRound(round.id)}>{round.label}</button>)}
      {excludedUnclassified > 0 && <small>{excludedUnclassified} report{excludedUnclassified === 1 ? "" : "s"} without a round label excluded</small>}
    </div>}

    {rows.length ? <ol className="leaderboard-list">
      {rows.map((row, index) => <li className="leaderboard-row" key={row.id}>
        <span className="leaderboard-rank">{index + 1}</span>
        <div className="leaderboard-scout"><strong>{row.name}</strong><span>{row.total} report{row.total === 1 ? "" : "s"}</span></div>
        <div className="leaderboard-breakdown">
          {section === "all" && <><span>Match <b>{row.match}</b></span><span>Pit <b>{row.pit}</b></span><span>Pre <b>{row.preScout}</b></span></>}
          {section === "match" && <><span>Practice <b>{row.practice}</b></span><span>Qual <b>{row.qualification}</b></span><span>Playoffs <b>{row.playoff}</b></span></>}
          {section === "pit" && <span>Pit reports <b>{row.pit}</b></span>}
          {section === "pre_scout" && <span>Pre-scout reports <b>{row.preScout}</b></span>}
        </div>
        <time className="leaderboard-latest" dateTime={row.latest}>Last submitted {formatDate(row.latest)}</time>
      </li>)}
    </ol> : <div className="leaderboard-empty"><h2>No reports yet</h2><p className="muted">Submitted scouting reports for this selection will appear here.</p></div>}
  </section>;
}
