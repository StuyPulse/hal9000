"use client";

import { useId, useMemo, useState, type FormEvent } from "react";
import type { ScoutStats } from "@/lib/scouting-stats";

type Team = { id: string; number: number; name: string; stats: ScoutStats };
type Match = { id: string; number: number; type: string; scheduledAt: string | null; status: string; red: string[]; blue: string[] };
type Slot = { id: string; alliance: "red" | "blue"; position: number };
const slots: Slot[] = [
  { id: "red-1", alliance: "red", position: 1 }, { id: "red-2", alliance: "red", position: 2 }, { id: "red-3", alliance: "red", position: 3 },
  { id: "blue-1", alliance: "blue", position: 1 }, { id: "blue-2", alliance: "blue", position: 2 }, { id: "blue-3", alliance: "blue", position: 3 },
];
const round = (value: number) => value.toFixed(2);
const matchLabel = (match: Match) => `${match.type === "qualification" ? "Q" : match.type === "playoff" ? "Playoff" : "Practice"} ${match.number}`;
const matchLineupLabel = (match: Match, teamById: Map<string, Team>) => `${match.red.map((teamId) => teamById.get(teamId)?.number ?? "—").join(" ")} vs ${match.blue.map((teamId) => teamById.get(teamId)?.number ?? "—").join(" ")}`;
const matchSearchLabel = (match: Match, teamById: Map<string, Team>) => `${matchLabel(match)} · ${matchLineupLabel(match, teamById)}${match.scheduledAt ? ` · ${new Date(match.scheduledAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : ""}`;

function SearchableMatchSelect({ matches, teams, value, onValueChange }: { matches: Match[]; teams: Team[]; value: string; onValueChange: (value: string) => void }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const listId = useId();
  const teamById = useMemo(() => new Map(teams.map((team) => [team.id, team])), [teams]);
  const selected = matches.find((match) => match.id === value);
  const results = matches.filter((match) => matchSearchLabel(match, teamById).toLowerCase().includes(query.trim().toLowerCase()));
  const close = () => { setOpen(false); setQuery(""); };
  const choose = (match: Match) => { onValueChange(match.id); close(); };

  return <div className="searchable-team-select strategy-match-select" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) close(); }}>
    <div className="searchable-team-input">
      <input id="strategy-match" value={open ? query : selected ? matchSearchLabel(selected, teamById) : ""} disabled={!matches.length} role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={listId} placeholder={matches.length ? "Search matches or teams…" : "No matches in this event"} autoComplete="off" onFocus={() => { setQuery(""); setOpen(true); }} onChange={(event) => { setQuery(event.target.value); setOpen(true); }} onKeyDown={(event) => { if (event.key === "Escape") close(); if (event.key === "ArrowDown") setOpen(true); if (event.key === "Enter" && results[0]) { event.preventDefault(); choose(results[0]); } }}/>
      <button type="button" disabled={!matches.length} aria-label={open ? "Close match choices" : "Show all matches"} aria-expanded={open} onMouseDown={(event) => event.preventDefault()} onClick={() => open ? close() : (setQuery(""), setOpen(true))}>⌄</button>
    </div>
    {open && <div id={listId} className="searchable-team-results" role="listbox" aria-label="Matches">{results.length ? results.map((match) => <button key={match.id} type="button" role="option" aria-selected={match.id === value} className={match.id === value ? "selected" : ""} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(match)}><strong>{matchLabel(match)}</strong><span>{matchLineupLabel(match, teamById)}{match.scheduledAt ? ` · ${new Date(match.scheduledAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : ""}</span></button>) : <p className="muted">No matches match that search.</p>}</div>}
  </div>;
}

function AllianceOverview({ alliance, teams }: { alliance: "red" | "blue"; teams: (Team | undefined)[] }) {
  const filledTeams = teams.filter((team): team is Team => Boolean(team));
  const totalFuel = filledTeams.reduce((total, team) => total + team.stats.totalFuel, 0);
  const peakFuel = filledTeams.reduce((total, team) => total + team.stats.peakFuel, 0);
  return <section className={`strategy-alliance-overview ${alliance}`}><div className="strategy-alliance-overview-head"><span>{alliance} alliance</span><strong>{filledTeams.length}/3 teams</strong></div><div className="strategy-alliance-teams">{teams.map((team, index) => <div key={team?.id ?? `${alliance}-${index}`}><strong>{team?.number ?? "—"}</strong><span>{team ? team.name : "Open slot"}</span><small>{team ? `Avg ${round(team.stats.totalFuel)} · Peak ${round(team.stats.peakFuel)}` : "No scouting data"}</small></div>)}</div><div className="strategy-alliance-totals"><span>Combined avg fuel <strong>{round(totalFuel)}</strong></span><span>Combined peak <strong>{round(peakFuel)}</strong></span></div></section>;
}

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
  const [manualNumbers, setManualNumbers] = useState<Record<string, string>>({});
  const [manualError, setManualError] = useState("");
  const selectedMatch = matches.find((match) => match.id === matchId);
  const teamById = useMemo(() => new Map(teams.map((team) => [team.id, team])), [teams]);
  const teamByNumber = useMemo(() => new Map(teams.map((team) => [team.number, team])), [teams]);
  const teamIdFor = (slot: Slot) => overrides[slot.id] ?? (slot.alliance === "red" ? selectedMatch?.red[slot.position - 1] : selectedMatch?.blue[slot.position - 1]) ?? "";
  const occupied = new Set(slots.map(teamIdFor).filter(Boolean));
  const redAlliance = slots.filter((slot) => slot.alliance === "red").map((slot) => teamById.get(teamIdFor(slot)));
  const blueAlliance = slots.filter((slot) => slot.alliance === "blue").map((slot) => teamById.get(teamIdFor(slot)));

  function applyManualLineup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const redNumbers = slots.filter((slot) => slot.alliance === "red").map((slot) => Number(manualNumbers[slot.id]));
    const blueNumbers = slots.filter((slot) => slot.alliance === "blue").map((slot) => Number(manualNumbers[slot.id]));
    if ([...redNumbers, ...blueNumbers].some((teamNumber) => !Number.isInteger(teamNumber) || teamNumber < 1)) { setManualError("Enter a team number in all six alliance slots."); return; }
    if (new Set([...redNumbers, ...blueNumbers]).size !== 6) { setManualError("Each of the six team numbers must be different."); return; }
    const requestedNumbers = [...redNumbers, ...blueNumbers];
    const missing = requestedNumbers.filter((teamNumber) => !teamByNumber.has(teamNumber));
    if (missing.length) { setManualError(`Team ${missing.join(", ")} is not in this event.`); return; }
    setOverrides(Object.fromEntries(slots.map((slot, index) => [slot.id, teamByNumber.get(requestedNumbers[index])!.id])));
    setManualError("");
  }

  return <section className="strategy-panel">
    <div className="strategy-controls"><label><span>Choose match</span><SearchableMatchSelect matches={matches} teams={teams} value={matchId} onValueChange={(nextMatchId) => { setMatchId(nextMatchId); setOverrides({}); setManualNumbers({}); setManualError(""); }}/></label><form className="strategy-manual-lineup" onSubmit={applyManualLineup}><span className="strategy-manual-label">Manual event lineup</span><div className="strategy-manual-alliance red"><span>Red</span>{slots.filter((slot) => slot.alliance === "red").map((slot) => <input key={slot.id} aria-label={`Red alliance team ${slot.position}`} value={manualNumbers[slot.id] ?? ""} inputMode="numeric" pattern="[0-9]*" maxLength={5} placeholder={`R${slot.position}`} onChange={(event) => { setManualNumbers((current) => ({ ...current, [slot.id]: event.target.value.replace(/\D/g, "") })); setManualError(""); }}/>)}</div><span className="strategy-manual-versus">vs</span><div className="strategy-manual-alliance blue"><span>Blue</span>{slots.filter((slot) => slot.alliance === "blue").map((slot) => <input key={slot.id} aria-label={`Blue alliance team ${slot.position}`} value={manualNumbers[slot.id] ?? ""} inputMode="numeric" pattern="[0-9]*" maxLength={5} placeholder={`B${slot.position}`} onChange={(event) => { setManualNumbers((current) => ({ ...current, [slot.id]: event.target.value.replace(/\D/g, "") })); setManualError(""); }}/>)}</div><button type="submit" className="button secondary">Use lineup</button>{Object.keys(overrides).length > 0 && <button type="button" className="strategy-clear-lineup" onClick={() => { setOverrides({}); setManualNumbers({}); setManualError(""); }}>Use scheduled</button>}{manualError && <span className="strategy-lineup-error" role="alert">{manualError}</span>}</form></div>
    <div className="strategy-alliance-overviews" aria-label="Alliance scouting comparison"><AllianceOverview alliance="red" teams={redAlliance}/><span aria-hidden="true">vs</span><AllianceOverview alliance="blue" teams={blueAlliance}/></div>
    <div className="strategy-field" aria-label={`${selectedMatch ? matchLabel(selectedMatch) : "Selected"} strategy field`}>
      <div className="strategy-field-art" aria-hidden="true"/>
      {slots.map((slot) => { const teamId = teamIdFor(slot); const unavailable = new Set(occupied); unavailable.delete(teamId); return <SlotCard key={slot.id} slot={slot} team={teamById.get(teamId)} teams={teams} unavailable={unavailable} onChange={(nextTeamId) => setOverrides((current) => ({ ...current, [slot.id]: nextTeamId }))}/>; })}
    </div>
  </section>;
}
