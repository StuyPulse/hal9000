"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type Team = { id: string; number: number; name: string };

const stages = [
  ["qualification", "Qualification"],
  ["practice", "Practice"],
  ["quarterfinal", "Quarterfinal"],
  ["semifinal", "Semifinal"],
  ["final", "Final"],
  ["other", "Other / exception"],
] as const;

export function ManualMatchPicker({ teams }: { teams: Team[] }) {
  const [stage, setStage] = useState<(typeof stages)[number][0]>("qualification");
  const [matchLabel, setMatchLabel] = useState("");
  const [query, setQuery] = useState("");
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const selectedTeam = teams.find((team) => team.id === selectedTeamId);
  const results = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return teams.filter((team) => !normalized || String(team.number).includes(normalized) || team.name.toLowerCase().includes(normalized)).slice(0, 8);
  }, [query, teams]);
  const params = new URLSearchParams({ team: selectedTeamId, stage });
  if (matchLabel.trim()) params.set("match", matchLabel.trim());

  return <section id="manual" className="scouting-card manual-match-card">
    <div className="form-intro">
      <div className="form-kicker">Manual match report</div>
      <h2>Record an exception without a scheduled match.</h2>
    </div>
    <div className="form-grid">
      <div className="field">
        <label htmlFor="manual-stage">Competition stage</label>
        <select id="manual-stage" value={stage} onChange={(event) => setStage(event.target.value as (typeof stages)[number][0])}>
          {stages.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor="manual-match-label">Match / set (optional)</label>
        <input id="manual-match-label" value={matchLabel} onChange={(event) => setMatchLabel(event.target.value)} placeholder="e.g. 18 or 2–1" />
      </div>
    </div>
    <div className="field manual-team-search">
      <label htmlFor="manual-team-search">Team number or name</label>
      <input id="manual-team-search" value={query} onChange={(event) => { setQuery(event.target.value); setSelectedTeamId(""); }} placeholder="Search 694, 1678, robot name…" autoComplete="off" />
      <div className="manual-team-results" role="listbox" aria-label="Matching active-event teams">
        {results.length ? results.map((team) => <button key={team.id} type="button" role="option" aria-selected={team.id === selectedTeamId} className={team.id === selectedTeamId ? "selected" : ""} onClick={() => { setSelectedTeamId(team.id); setQuery(`${team.number} · ${team.name}`); }}>{team.number} <span>{team.name}</span></button>) : <p className="muted">No active-event teams match that search.</p>}
      </div>
      {selectedTeam && <p className="manual-selection">Selected: <strong>{selectedTeam.number} · {selectedTeam.name}</strong></p>}
    </div>
    <div className="form-actions">
      {selectedTeamId ? <Link className="button" href={`/scout/match/manual?${params.toString()}`}>Open manual match form</Link> : <button className="button" disabled>Choose a team to continue</button>}
    </div>
  </section>;
}
