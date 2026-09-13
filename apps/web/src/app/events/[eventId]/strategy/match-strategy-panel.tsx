"use client";

import { useMemo, useState, type FormEvent } from "react";
import type { ScoutStats } from "@/lib/scouting-stats";

type Team = { id: string; number: number; name: string; stats: ScoutStats };
type Match = { id: string; number: number; type: string; scheduledAt: string | null; red: string[]; blue: string[] };
type Slot = { id: string; alliance: "red" | "blue"; position: number };
const slots: Slot[] = [
  { id: "red-1", alliance: "red", position: 1 }, { id: "red-2", alliance: "red", position: 2 }, { id: "red-3", alliance: "red", position: 3 },
  { id: "blue-1", alliance: "blue", position: 1 }, { id: "blue-2", alliance: "blue", position: 2 }, { id: "blue-3", alliance: "blue", position: 3 },
];
const round = (value: number) => value.toFixed(2);
const matchLabel = (match: Match) => `${match.type === "qualification" ? "Q" : match.type === "playoff" ? "Playoff" : "Practice"} ${match.number}`;

function SlotCard({ slot, team, teams, unavailable, onChange }: { slot: Slot; team?: Team; teams: Team[]; unavailable: Set<string>; onChange: (teamId: string) => void }) {
  return <article className={`strategy-slot ${slot.alliance} strategy-slot-${slot.position}`}>
    <div className="strategy-slot-head"><span>{slot.alliance} {slot.position}</span><strong>{team ? team.number : "Open"}</strong></div>
    <select aria-label={`${slot.alliance} alliance position ${slot.position} team`} value={team?.id ?? ""} onChange={(event) => onChange(event.target.value)}>
      <option value="">Open slot</option>
      {teams.map((option) => <option key={option.id} value={option.id} disabled={option.id !== team?.id && unavailable.has(option.id)}>{option.number} · {option.name}</option>)}
    </select>
    {team ? <><div className="strategy-team-name">{team.name}</div><div className="strategy-metrics"><div><span>Peak fuel</span><strong>{round(team.stats.peakFuel)}</strong></div><div><span>Avg fuel</span><strong>{round(team.stats.totalFuel)}</strong></div><div><span>Auto</span><strong>{round(team.stats.autoFuel)}</strong></div><div><span>Teleop</span><strong>{round(team.stats.teleopFuel)}</strong></div></div><div className="strategy-tendencies"><span>{team.stats.entries} reports</span>{team.stats.defense > 0 && <span>Defense {round(team.stats.defense)}</span>}{team.stats.brokenPercent > 0 && <span>{round(team.stats.brokenPercent)}% broken</span>}</div></> : <p className="muted">Choose an event team.</p>}
  </article>;
}

export function MatchStrategyPanel({ matches, teams }: { matches: Match[]; teams: Team[] }) {
  const [matchId, setMatchId] = useState(matches[0]?.id ?? "");
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [manualLineup, setManualLineup] = useState("");
  const [manualError, setManualError] = useState("");
  const selectedMatch = matches.find((match) => match.id === matchId);
  const teamById = useMemo(() => new Map(teams.map((team) => [team.id, team])), [teams]);
  const teamByNumber = useMemo(() => new Map(teams.map((team) => [team.number, team])), [teams]);
  const teamIdFor = (slot: Slot) => overrides[slot.id] ?? (slot.alliance === "red" ? selectedMatch?.red[slot.position - 1] : selectedMatch?.blue[slot.position - 1]) ?? "";
  const occupied = new Set(slots.map(teamIdFor).filter(Boolean));

  function applyManualLineup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const sides = manualLineup.trim().split(/\bvs\.?\b/i);
    const parseSide = (value: string) => value.match(/\d+/g)?.map(Number) ?? [];
    const redNumbers = parseSide(sides[0] ?? "");
    const blueNumbers = sides.length === 2 ? parseSide(sides[1]) : redNumbers.splice(3);
    if (sides.length > 2 || redNumbers.length !== 3 || blueNumbers.length !== 3) { setManualError("Enter three red teams and three blue teams, separated by “vs”."); return; }
    if (new Set([...redNumbers, ...blueNumbers]).size !== 6) { setManualError("Each of the six team numbers must be different."); return; }
    const requestedNumbers = [...redNumbers, ...blueNumbers];
    const missing = requestedNumbers.filter((teamNumber) => !teamByNumber.has(teamNumber));
    if (missing.length) { setManualError(`Team ${missing.join(", ")} is not in this event.`); return; }
    setOverrides(Object.fromEntries(slots.map((slot, index) => [slot.id, teamByNumber.get(requestedNumbers[index])!.id])));
    setManualError("");
  }

  return <section className="strategy-panel">
    <div className="strategy-controls"><label><span>Scheduled match</span><select value={matchId} disabled={!matches.length} onChange={(event) => { setMatchId(event.target.value); setOverrides({}); setManualError(""); }}>{matches.length ? matches.map((match) => <option key={match.id} value={match.id}>{matchLabel(match)}{match.scheduledAt ? ` · ${new Date(match.scheduledAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : ""}</option>) : <option value="">No scheduled matches</option>}</select></label><form className="strategy-manual-lineup" onSubmit={applyManualLineup}><label htmlFor="manual-strategy-lineup"><span>Manual lineup</span><input id="manual-strategy-lineup" value={manualLineup} onChange={(event) => { setManualLineup(event.target.value); setManualError(""); }} placeholder="2601 301 23 vs 694 1796 098" /></label><button type="submit" className="button secondary">Use lineup</button>{Object.keys(overrides).length > 0 && <button type="button" className="strategy-clear-lineup" onClick={() => { setOverrides({}); setManualLineup(""); setManualError(""); }}>Use scheduled</button>}{manualError && <span className="strategy-lineup-error" role="alert">{manualError}</span>}</form></div>
    <div className="strategy-field" aria-label={`${selectedMatch ? matchLabel(selectedMatch) : "Selected"} strategy field`}>
      <div className="strategy-field-art" aria-hidden="true"/>
      {slots.map((slot) => { const teamId = teamIdFor(slot); const unavailable = new Set(occupied); unavailable.delete(teamId); return <SlotCard key={slot.id} slot={slot} team={teamById.get(teamId)} teams={teams} unavailable={unavailable} onChange={(nextTeamId) => setOverrides((current) => ({ ...current, [slot.id]: nextTeamId }))}/>; })}
    </div>
  </section>;
}
