"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { matchLabel, matchRoundOrder } from "@/lib/match-label";

type Match = { id: string; key: string; number: number; type: string; status: string; red: string[]; blue: string[] };
type Team = { id: string; number: number; name: string };

const playedMatchDelayMs = 5 * 60 * 1_000;
const label = (match: Match) => matchLabel({ match_number: match.number, match_type: match.type, tba_match_key: match.key });

function SearchableMatchSelect({ value, onValueChange, matches, teams }: { value: string; onValueChange: (value: string) => void; matches: Match[]; teams: Team[] }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const listId = useId();
  const selected = matches.find((match) => match.id === value);
  const selectedLabel = selected ? label(selected) : "";
  const normalizedQuery = query.trim().toLowerCase();
  const results = matches.filter((match) => {
    const participants = teams.filter((team) => [...match.red, ...match.blue].includes(team.id));
    return [label(match), match.number, ...participants.flatMap((team) => [team.number, team.name])].join(" ").toLowerCase().includes(normalizedQuery);
  });
  const openMenu = () => { setQuery(""); setOpen(true); };
  const closeMenu = () => { setOpen(false); setQuery(""); };
  const choose = (match?: Match) => { onValueChange(match?.id ?? ""); closeMenu(); };

  return <div className="searchable-team-select" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) closeMenu(); }}>
    <div className="searchable-team-input">
      <input id="scheduled-match" value={open ? query : selectedLabel} role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={listId} placeholder="Search scheduled matches…" autoComplete="off" onFocus={openMenu} onChange={(event) => { setQuery(event.target.value); setOpen(true); if (value) onValueChange(""); }} onKeyDown={(event) => { if (event.key === "Escape") closeMenu(); if (event.key === "ArrowDown") openMenu(); if (event.key === "Enter" && results[0]) { event.preventDefault(); choose(results[0]); } }} />
      <button type="button" aria-label={open ? "Close match choices" : "Show match choices"} aria-expanded={open} onMouseDown={(event) => event.preventDefault()} onClick={() => open ? closeMenu() : openMenu()}>⌄</button>
    </div>
    {open && <div className="searchable-team-results" id={listId} role="listbox">
      <button type="button" role="option" aria-selected={!value} onMouseDown={(event) => event.preventDefault()} onClick={() => choose()}>Choose a scheduled match…</button>
      {results.length ? results.map((match) => <button key={match.id} type="button" role="option" aria-selected={match.id === value} className={match.id === value ? "selected" : ""} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(match)}><strong>{label(match)}</strong></button>) : <p className="muted">No scheduled matches match that search.</p>}
    </div>}
  </div>;
}

export function MatchScoutPicker({ matches, teams, initialMatchId = "" }: { matches: Match[]; teams: Team[]; initialMatchId?: string }) {
  const [matchId, setMatchId] = useState(initialMatchId);
  const [teamId, setTeamId] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [playedObservedAt, setPlayedObservedAt] = useState<Record<string, number>>({});
  const previousStatuses = useRef(new Map(matches.map((match) => [match.id, match.status])));
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(interval);
  }, []);
  useEffect(() => {
    const currentStatuses = new Map(matches.map((match) => [match.id, match.status]));
    const newlyPlayed = matches.filter((match) => match.status === "played" && previousStatuses.current.get(match.id) !== "played");
    if (newlyPlayed.length) setPlayedObservedAt((current) => ({ ...current, ...Object.fromEntries(newlyPlayed.map((match) => [match.id, Date.now()])) }));
    previousStatuses.current = currentStatuses;
  }, [matches]);
  const match = useMemo(() => matches.find((item) => item.id === matchId), [matches, matchId]);
  const hasPlayedDelayElapsed = (item: Match) => {
    if (item.status !== "played") return false;
    const observedAt = playedObservedAt[item.id];
    if (!observedAt) return previousStatuses.current.get(item.id) === "played";
    return now >= observedAt + playedMatchDelayMs;
  };
  const orderedMatches = useMemo(() => [...matches].sort((left, right) => {
    const leftPlayed = hasPlayedDelayElapsed(left);
    const rightPlayed = hasPlayedDelayElapsed(right);
    if (leftPlayed !== rightPlayed) return leftPlayed ? 1 : -1;
    const roundDifference = matchRoundOrder({ match_type: left.type, tba_match_key: left.key }) - matchRoundOrder({ match_type: right.type, tba_match_key: right.key });
    if (roundDifference) return roundDifference;
    return left.number - right.number || label(left).localeCompare(label(right));
  }), [matches, now, playedObservedAt]);
  const allowedTeams = match ? teams.filter((team) => [...match.red, ...match.blue].includes(team.id)).sort((a, b) => a.number - b.number) : [];
  const redTeams = match ? allowedTeams.filter((team) => match.red.includes(team.id)) : [];
  const blueTeams = match ? allowedTeams.filter((team) => match.blue.includes(team.id)) : [];
  const robotButton = (team: Team, alliance: "red" | "blue") => <button type="button" key={team.id} aria-pressed={team.id === teamId} className={`robot-pick ${alliance}${team.id === teamId ? " selected" : ""}`} onClick={() => setTeamId(team.id)}>{team.number} · {team.name}</button>;

  return <section className="scouting-card">
    <div className="form-intro">
      <div className="form-kicker">Scheduled match</div>
      <h2>Scout a robot from the imported schedule.</h2>
    </div>
    <div className="scheduled-scout-fields">
      <div className="field">
        <label htmlFor="scheduled-match">Match</label>
        <SearchableMatchSelect value={matchId} onValueChange={(value) => { setMatchId(value); setTeamId(""); }} matches={orderedMatches} teams={teams}/>
      </div>
      <div className="field"><label>Robot</label>{match ? <div className="robot-picker" aria-label="Choose a robot"><div className="robot-alliance red"><span className="robot-alliance-label">Red alliance</span>{redTeams.map((team) => robotButton(team, "red"))}</div><div className="robot-alliance blue"><span className="robot-alliance-label">Blue alliance</span>{blueTeams.map((team) => robotButton(team, "blue"))}</div></div> : <p className="muted">Choose a scheduled match first.</p>}</div>
    </div>
    {match && <div className="match-roster"><span className="red">Red: {teams.filter((team) => match.red.includes(team.id)).map((team) => team.number).join(" · ")}</span><span className="blue">Blue: {teams.filter((team) => match.blue.includes(team.id)).map((team) => team.number).join(" · ")}</span></div>}
    <div className="form-actions">
      {teamId ? <Link className="button" href={`/scout/match/${matchId}?team=${teamId}`}>Open scheduled match form</Link> : <button className="button" disabled>Choose a match and robot</button>}
    </div>
  </section>;
}
