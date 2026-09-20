"use client";

import { useMemo, useState } from "react";

export type LeaderboardEntry = {
  id: string;
  type: "match" | "pit" | "pre_scout";
  scoutUserId: string;
  scoutName: string;
  submittedAt: string;
  teamId: string | null;
  matchId: string | null;
  matchType: string | null;
  manualStage: string | null;
  manualMatchKey: string | null;
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
  return ["playoff", "quarterfinal", "semifinal", "final"].includes(stage ?? "") ? "playoff" : null;
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
  const excludedUnclassified = section === "match" ? entries.filter((entry) => entry.type === "match" && matchRound(entry) === null).length : 0;

  const rows = useMemo(() => {
    const byScout = new Map<string, { id: string; name: string; reports: number; teams: Set<string>; matches: Set<string> }>();
    for (const entry of filteredEntries) {
      const current = byScout.get(entry.scoutUserId) ?? { id: entry.scoutUserId, name: entry.scoutName, reports: 0, teams: new Set<string>(), matches: new Set<string>() };
      current.reports += 1;
      if (entry.type === "match") {
        if (entry.teamId) current.teams.add(entry.teamId);
        current.matches.add(entry.matchId ?? entry.manualMatchKey ?? entry.id);
      }
      byScout.set(entry.scoutUserId, current);
    }
    return [...byScout.values()].sort((a, b) => b.reports - a.reports || a.name.localeCompare(b.name));
  }, [filteredEntries]);

  function toggleRound(round: MatchRound) {
    setSelectedRounds((current) => current.includes(round) ? current.filter((value) => value !== round) : [...current, round]);
  }

  return <section className="leaderboard-card" aria-label={`${eventName} scouting leaderboard`}>
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
        <strong className="leaderboard-scout">{row.name}</strong>
        <div className="leaderboard-breakdown">
          {section === "match" ? <><span>Teams <b>{row.teams.size}</b></span><span>Matches <b>{row.matches.size}</b></span><span>Reports <b>{row.reports}</b></span></> : <span>Reports <b>{row.reports}</b></span>}
        </div>
      </li>)}
    </ol> : <div className="leaderboard-empty"><h2>No reports yet</h2><p className="muted">Submitted scouting reports for this selection will appear here.</p></div>}
  </section>;
}
