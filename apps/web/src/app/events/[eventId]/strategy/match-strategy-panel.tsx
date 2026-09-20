"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent } from "react";
import type { ScoutStats } from "@/lib/scouting-stats";
import { matchLabel as formatMatchLabel } from "@/lib/match-label";
import { createClient } from "@/lib/supabase/client";

type Team = { id: string; number: number; name: string; stats: ScoutStats };
type Match = { id: string; key: string; number: number; type: string; scheduledAt: string | null; status: string; red: string[]; blue: string[] };
type Slot = { id: string; alliance: "red" | "blue"; position: number };
type Point = { x: number; y: number };
type Stroke = { color: string; points: Point[] };

const slots: Slot[] = [
  { id: "red-1", alliance: "red", position: 1 }, { id: "red-2", alliance: "red", position: 2 }, { id: "red-3", alliance: "red", position: 3 },
  { id: "blue-1", alliance: "blue", position: 1 }, { id: "blue-2", alliance: "blue", position: 2 }, { id: "blue-3", alliance: "blue", position: 3 },
];
const drawingColors = ["#ef4444", "#38bdf8", "#facc15", "#34d399", "#a78bfa", "#fb923c"];
const playedMatchDelayMs = 5 * 60 * 1_000;
const round = (value: number) => value.toFixed(2);
const matchLabel = (match: Match) => formatMatchLabel({ match_number: match.number, match_type: match.type, tba_match_key: match.key });
const matchLineupLabel = (match: Match, teamById: Map<string, Team>) => `${match.red.map((teamId) => teamById.get(teamId)?.number ?? "—").join(" ")} vs ${match.blue.map((teamId) => teamById.get(teamId)?.number ?? "—").join(" ")}`;
const matchSearchLabel = (match: Match, teamById: Map<string, Team>) => `${matchLabel(match)} · ${matchLineupLabel(match, teamById)}${match.scheduledAt ? ` · ${new Date(match.scheduledAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : ""}`;
const lineupNumbersFor = (match: Match | undefined, teams: Map<string, Team>) => Object.fromEntries(slots.map((slot) => {
  const id = slot.alliance === "red" ? match?.red[slot.position - 1] : match?.blue[slot.position - 1];
  return [slot.id, id ? String(teams.get(id)?.number ?? "") : ""];
}));

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

function AllianceOverview({ alliance, teams, eventKey }: { alliance: "red" | "blue"; teams: (Team | undefined)[]; eventKey: string }) {
  const filledTeams = teams.filter((team): team is Team => Boolean(team));
  const autoAverage = filledTeams.reduce((total, team) => total + team.stats.autoFuel, 0);
  const autoPeak = filledTeams.reduce((total, team) => total + team.stats.autoPeakFuel, 0);
  const teleopAverage = filledTeams.reduce((total, team) => total + team.stats.teleopFuel, 0);
  const teleopPeak = filledTeams.reduce((total, team) => total + team.stats.teleopPeakFuel, 0);
  return <section className={`strategy-alliance-overview ${alliance}`}>
    <div className="strategy-alliance-overview-head"><span>{alliance} alliance</span><strong>{filledTeams.length}/3 teams</strong></div>
    <div className="strategy-alliance-teams">{teams.map((team, index) => team
      ? <Link key={team.id} href={`/events/${eventKey}/teams/${team.number}`}><strong>{team.number}</strong><span>{team.name}</span><small>Auto avg {round(team.stats.autoFuel)} · peak {round(team.stats.autoPeakFuel)}</small><small>Teleop avg {round(team.stats.teleopFuel)} · peak {round(team.stats.teleopPeakFuel)}</small></Link>
      : <div key={`${alliance}-${index}`}><strong>—</strong><span>Open slot</span><small>Use the lineup above</small></div>)}</div>
    <div className="strategy-alliance-totals"><span>Auto <strong>avg {round(autoAverage)} · peak {round(autoPeak)}</strong></span><span>Teleop <strong>avg {round(teleopAverage)} · peak {round(teleopPeak)}</strong></span></div>
  </section>;
}

function StrategyDrawing({ strokes, onChange, color, flipped }: { strokes: Stroke[]; onChange: (strokes: Stroke[]) => void; color: string; flipped: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);

  const repaint = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const scale = window.devicePixelRatio || 1;
    canvas.width = Math.round(rect.width * scale);
    canvas.height = Math.round(rect.height * scale);
    const context = canvas.getContext("2d");
    if (!context) return;
    context.setTransform(scale, 0, 0, scale, 0, 0);
    context.clearRect(0, 0, rect.width, rect.height);
    context.lineCap = "round";
    context.lineJoin = "round";
    for (const stroke of strokes) {
      if (!stroke.points.length) continue;
      context.beginPath();
      context.strokeStyle = stroke.color;
      context.lineWidth = 4;
      const first = stroke.points[0];
      context.moveTo(first.x * rect.width, first.y * rect.height);
      for (const point of stroke.points.slice(1)) context.lineTo(point.x * rect.width, point.y * rect.height);
      if (stroke.points.length === 1) context.lineTo(first.x * rect.width + 0.1, first.y * rect.height + 0.1);
      context.stroke();
    }
  }, [strokes]);

  useEffect(() => {
    repaint();
    const canvas = canvasRef.current;
    if (!canvas || !window.ResizeObserver) return;
    const observer = new ResizeObserver(repaint);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [repaint]);

  const pointFromEvent = (event: ReactPointerEvent<HTMLCanvasElement>): Point => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
    return flipped ? { x: 1 - x, y: 1 - y } : { x, y };
  };
  const start = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    drawingRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    onChange([...strokes, { color, points: [pointFromEvent(event)] }]);
  };
  const move = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    const point = pointFromEvent(event);
    onChange(strokes.map((stroke, index) => index === strokes.length - 1 ? { ...stroke, points: [...stroke.points, point] } : stroke));
  };
  const stop = () => { drawingRef.current = false; };

  return <canvas ref={canvasRef} className="strategy-drawing-canvas" aria-label="Draw a strategy path on the field" onPointerDown={start} onPointerMove={move} onPointerUp={stop} onPointerCancel={stop}/>;
}

export function MatchStrategyPanel({ matches, teams, eventId, eventKey, organizationId, userId, initialStrokes }: { matches: Match[]; teams: Team[]; eventId: string; eventKey: string; organizationId: string; userId: string | null; initialStrokes: Stroke[] }) {
  const teamById = useMemo(() => new Map(teams.map((team) => [team.id, team])), [teams]);
  const teamByNumber = useMemo(() => new Map(teams.map((team) => [team.number, team])), [teams]);
  const [matchId, setMatchId] = useState(matches[0]?.id ?? "");
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [manualNumbers, setManualNumbers] = useState<Record<string, string>>(() => lineupNumbersFor(matches[0], teamById));
  const [manualError, setManualError] = useState("");
  const [flipped, setFlipped] = useState(false);
  const [strokes, setStrokes] = useState<Stroke[]>(initialStrokes);
  const [saving, setSaving] = useState(false);
  const [saveState, setSaveState] = useState("");
  const [color, setColor] = useState(drawingColors[0]);
  const [now, setNow] = useState(() => Date.now());
  const [playedObservedAt, setPlayedObservedAt] = useState<Record<string, number>>({});
  const previousStatuses = useRef(new Map(matches.map((match) => [match.id, match.status])));
  const selectedMatch = matches.find((match) => match.id === matchId);
  const teamIdFor = (slot: Slot) => overrides[slot.id] ?? (slot.alliance === "red" ? selectedMatch?.red[slot.position - 1] : selectedMatch?.blue[slot.position - 1]) ?? "";
  const redAlliance = slots.filter((slot) => slot.alliance === "red").map((slot) => teamById.get(teamIdFor(slot)));
  const blueAlliance = slots.filter((slot) => slot.alliance === "blue").map((slot) => teamById.get(teamIdFor(slot)));

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

  const hasPlayedDelayElapsed = (match: Match) => {
    if (match.status !== "played") return false;
    const observedAt = playedObservedAt[match.id];
    if (!observedAt) return previousStatuses.current.get(match.id) === "played";
    return now >= observedAt + playedMatchDelayMs;
  };

  const orderedMatches = useMemo(() => [...matches].sort((left, right) => {
    const leftPlayed = hasPlayedDelayElapsed(left);
    const rightPlayed = hasPlayedDelayElapsed(right);
    if (leftPlayed !== rightPlayed) return leftPlayed ? 1 : -1;
    return left.number - right.number || matchLabel(left).localeCompare(matchLabel(right));
  }), [matches, now, playedObservedAt]);

  function chooseMatch(nextMatchId: string) {
    const next = matches.find((match) => match.id === nextMatchId);
    setMatchId(nextMatchId);
    setOverrides({});
    setManualNumbers(lineupNumbersFor(next, teamById));
    setManualError("");
  }

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

  async function saveDrawing() {
    if (!userId) { setSaveState("Sign in to save your drawing."); return; }
    setSaving(true);
    setSaveState("");
    const supabase = createClient();
    const { error } = await (supabase as any).from("strategy_drawings").upsert({ organization_id: organizationId, event_id: eventId, user_id: userId, strokes }, { onConflict: "event_id,user_id" });
    setSaving(false);
    setSaveState(error ? "Could not save the drawing." : "Drawing saved.");
  }

  return <section className="strategy-panel">
    <div className="strategy-controls"><label><span>Choose match</span><SearchableMatchSelect matches={orderedMatches} teams={teams} value={matchId} onValueChange={chooseMatch}/></label><form className="strategy-manual-lineup" onSubmit={applyManualLineup}><span className="strategy-manual-label">Manual event lineup</span><div className="strategy-manual-alliance red"><span>Red</span>{slots.filter((slot) => slot.alliance === "red").map((slot) => <input key={slot.id} aria-label={`Red alliance team ${slot.position}`} value={manualNumbers[slot.id] ?? ""} inputMode="numeric" pattern="[0-9]*" maxLength={5} placeholder={`R${slot.position}`} onChange={(event) => { setManualNumbers((current) => ({ ...current, [slot.id]: event.target.value.replace(/\D/g, "") })); setManualError(""); }}/>)}</div><span className="strategy-manual-versus">vs</span><div className="strategy-manual-alliance blue"><span>Blue</span>{slots.filter((slot) => slot.alliance === "blue").map((slot) => <input key={slot.id} aria-label={`Blue alliance team ${slot.position}`} value={manualNumbers[slot.id] ?? ""} inputMode="numeric" pattern="[0-9]*" maxLength={5} placeholder={`B${slot.position}`} onChange={(event) => { setManualNumbers((current) => ({ ...current, [slot.id]: event.target.value.replace(/\D/g, "") })); setManualError(""); }}/>)}</div><button type="submit" className="button secondary">Use lineup</button>{Object.keys(overrides).length > 0 && <button type="button" className="strategy-clear-lineup" onClick={() => { setOverrides({}); setManualNumbers(lineupNumbersFor(selectedMatch, teamById)); setManualError(""); }}>Use scheduled</button>}{manualError && <span className="strategy-lineup-error" role="alert">{manualError}</span>}</form></div>
    <div className="strategy-alliance-overviews" aria-label="Alliance scouting comparison"><AllianceOverview alliance="red" teams={redAlliance} eventKey={eventKey}/><span aria-hidden="true">vs</span><AllianceOverview alliance="blue" teams={blueAlliance} eventKey={eventKey}/></div>
    <div className="strategy-drawing-toolbar"><div className="strategy-color-picker" aria-label="Drawing color">{drawingColors.map((value) => <button key={value} type="button" className={color === value ? "selected" : ""} style={{ backgroundColor: value }} aria-label={`Use ${value} drawing color`} onClick={() => setColor(value)}/>)}</div><button type="button" className="button secondary strategy-tool-button" disabled={!strokes.length} onClick={() => { setStrokes((current) => current.slice(0, -1)); setSaveState(""); }}>Undo</button><button type="button" className="button secondary strategy-tool-button" disabled={!strokes.length} onClick={() => { setStrokes([]); setSaveState(""); }}>Clear</button><button type="button" className="button strategy-tool-button" disabled={!userId || saving} onClick={saveDrawing}>{saving ? "Saving…" : "Save drawing"}</button>{saveState && <span className="strategy-save-state" role="status">{saveState}</span>}<button type="button" className="button secondary strategy-flip-button" aria-pressed={flipped} onClick={() => setFlipped((current) => !current)}>Flip alliance view</button></div>
    <div className={`strategy-field${flipped ? " flip-alliance-view" : ""}`} aria-label={`${selectedMatch ? matchLabel(selectedMatch) : "Selected"} strategy field`}>
      <div className="strategy-field-art" aria-hidden="true"/>
      <StrategyDrawing strokes={strokes} onChange={(next) => { setStrokes(next); setSaveState(""); }} color={color} flipped={flipped}/>
    </div>
  </section>;
}
