"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AppSelect } from "@/components/app-select";
import { matchLabel } from "@/lib/match-label";

type Match = { id: string; key: string; number: number; type: string; red: string[]; blue: string[] };
type Team = { id: string; number: number; name: string };

const label = (match: Match) => matchLabel({ match_number: match.number, match_type: match.type, tba_match_key: match.key });

export function MatchScoutPicker({ matches, teams, initialMatchId = "" }: { matches: Match[]; teams: Team[]; initialMatchId?: string }) {
  const [matchId, setMatchId] = useState(initialMatchId);
  const [teamId, setTeamId] = useState("");
  const match = useMemo(() => matches.find((item) => item.id === matchId), [matches, matchId]);
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
        <AppSelect id="scheduled-match" ariaLabel="Scheduled match" value={matchId} onValueChange={(value) => { setMatchId(value); setTeamId(""); }} options={[{value:"",label:"Choose a scheduled match…"}, ...matches.map((item) => ({value:item.id,label:label(item)}))]}/>
      </div>
      <div className="field"><label>Robot</label>{match ? <div className="robot-picker" aria-label="Choose a robot"><div className="robot-alliance red"><span className="robot-alliance-label">Red alliance</span>{redTeams.map((team) => robotButton(team, "red"))}</div><div className="robot-alliance blue"><span className="robot-alliance-label">Blue alliance</span>{blueTeams.map((team) => robotButton(team, "blue"))}</div></div> : <p className="muted">Choose a scheduled match first.</p>}</div>
    </div>
    {match && <div className="match-roster"><span className="red">Red: {teams.filter((team) => match.red.includes(team.id)).map((team) => team.number).join(" · ")}</span><span className="blue">Blue: {teams.filter((team) => match.blue.includes(team.id)).map((team) => team.number).join(" · ")}</span></div>}
    <div className="form-actions">
      {teamId ? <Link className="button" href={`/scout/match/${matchId}?team=${teamId}`}>Open scheduled match form</Link> : <button className="button" disabled>Choose a match and robot</button>}
    </div>
  </section>;
}
