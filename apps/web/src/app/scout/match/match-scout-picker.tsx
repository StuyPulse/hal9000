"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AppSelect } from "@/components/app-select";
import { matchLabel } from "@/lib/match-label";

type Match = { id: string; key: string; number: number; type: string; status: string; updatedAt: string | null; red: string[]; blue: string[] };
type Team = { id: string; number: number; name: string };

const playedMatchDelayMs = 5 * 60 * 1_000;
const label = (match: Match) => matchLabel({ match_number: match.number, match_type: match.type, tba_match_key: match.key });

function hasPlayedDelayElapsed(match: Match, now: number) {
  if (match.status !== "played" || !match.updatedAt) return false;
  const playedAt = Date.parse(match.updatedAt);
  return Number.isFinite(playedAt) && now >= playedAt + playedMatchDelayMs;
}

export function MatchScoutPicker({ matches, teams, initialMatchId = "" }: { matches: Match[]; teams: Team[]; initialMatchId?: string }) {
  const [matchId, setMatchId] = useState(initialMatchId);
  const [teamId, setTeamId] = useState("");
  const [search, setSearch] = useState("");
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(interval);
  }, []);
  const match = useMemo(() => matches.find((item) => item.id === matchId), [matches, matchId]);
  const orderedMatches = useMemo(() => [...matches].sort((left, right) => {
    const leftPlayed = hasPlayedDelayElapsed(left, now);
    const rightPlayed = hasPlayedDelayElapsed(right, now);
    if (leftPlayed !== rightPlayed) return leftPlayed ? 1 : -1;
    return left.number - right.number || label(left).localeCompare(label(right));
  }), [matches, now]);
  const normalizedSearch = search.trim().toLowerCase();
  const visibleMatches = useMemo(() => orderedMatches.filter((item) => {
    if (!normalizedSearch) return true;
    const participatingTeams = teams.filter((team) => [...item.red, ...item.blue].includes(team.id));
    const searchable = [label(item), item.number, ...participatingTeams.flatMap((team) => [team.number, team.name])].join(" ").toLowerCase();
    return searchable.includes(normalizedSearch);
  }), [normalizedSearch, orderedMatches, teams]);
  const activeMatches = visibleMatches.filter((item) => !hasPlayedDelayElapsed(item, now));
  const playedMatches = visibleMatches.filter((item) => hasPlayedDelayElapsed(item, now));
  const matchOptions = [
    { value: "", label: "Choose a scheduled match…" },
    ...activeMatches.map((item) => ({ value: item.id, label: label(item) })),
    ...(activeMatches.length && playedMatches.length ? [{ value: "played-matches", label: "Played matches", disabled: true }] : []),
    ...playedMatches.map((item) => ({ value: item.id, label: `${label(item)} · played` })),
  ];
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
        <label htmlFor="scheduled-match-search">Search scheduled matches</label>
        <input id="scheduled-match-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Match number or team…" />
      </div>
      <div className="field">
        <label htmlFor="scheduled-match">Match</label>
        <AppSelect id="scheduled-match" ariaLabel="Scheduled match" value={matchId} onValueChange={(value) => { setMatchId(value); setTeamId(""); }} options={matchOptions}/>
        {normalizedSearch && !visibleMatches.length && <p className="muted">No scheduled matches match that search.</p>}
        {playedMatches.length > 0 && <p className="muted">Played matches move to the end after five minutes.</p>}
      </div>
      <div className="field"><label>Robot</label>{match ? <div className="robot-picker" aria-label="Choose a robot"><div className="robot-alliance red"><span className="robot-alliance-label">Red alliance</span>{redTeams.map((team) => robotButton(team, "red"))}</div><div className="robot-alliance blue"><span className="robot-alliance-label">Blue alliance</span>{blueTeams.map((team) => robotButton(team, "blue"))}</div></div> : <p className="muted">Choose a scheduled match first.</p>}</div>
    </div>
    {match && <div className="match-roster"><span className="red">Red: {teams.filter((team) => match.red.includes(team.id)).map((team) => team.number).join(" · ")}</span><span className="blue">Blue: {teams.filter((team) => match.blue.includes(team.id)).map((team) => team.number).join(" · ")}</span></div>}
    <div className="form-actions">
      {teamId ? <Link className="button" href={`/scout/match/${matchId}?team=${teamId}`}>Open scheduled match form</Link> : <button className="button" disabled>Choose a match and robot</button>}
    </div>
  </section>;
}
