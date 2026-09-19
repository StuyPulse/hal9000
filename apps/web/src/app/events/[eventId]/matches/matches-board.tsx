"use client";

import Link from "next/link";
import { type FormEvent, useActionState, useMemo, useState } from "react";
import { addManualEventTeam, createLocalMatch, deleteLocalMatch, deleteManualMatch, removeManualEventTeam, saveManualMatch, updateLocalMatch, type ActionState } from "@/lib/admin-actions";
import { formatLocalDateTime } from "@/components/local-date-time";
import { SearchableTeamSelect } from "@/components/searchable-team-select";
import { AppSelect } from "@/components/app-select";
import { matchLabel } from "@/lib/match-label";

type Match = { id: string; key: string; number: number; type: string; red: string[]; blue: string[]; scheduledAt: string | null; status: string; redScore: number | null; blueScore: number | null };
type Team = { id: string; number: number; name: string };
const initialActionState: ActionState = {};
const label = (match: Match) => matchLabel({ match_number: match.number, match_type: match.type, tba_match_key: match.key });
const teamNumbers = (ids: string[], teams: Team[]) => ids.map((id) => teams.find((team) => team.id === id)?.number ?? "—").join(", ");
const localInputValue = (value: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};
function Message({ state }: { state: ActionState }) { return state.error ? <p className="error">{state.error}</p> : state.success ? <p className="trend">{state.success}</p> : null; }

function LocalScheduledAtInput({ value }: { value: string | null }) {
  const [localValue, setLocalValue] = useState(() => localInputValue(value));
  return <input name="scheduledAt" type="datetime-local" suppressHydrationWarning value={localValue} onChange={(event) => setLocalValue(event.target.value)}/>;
}

function captureScheduledAtInstant(event: FormEvent<HTMLFormElement>) {
  const form = event.currentTarget;
  const localInput = form.elements.namedItem("scheduledAt") as HTMLInputElement | null;
  const instantInput = form.elements.namedItem("scheduledAtIso") as HTMLInputElement | null;
  if (instantInput) instantInput.value = localInput?.value ? new Date(localInput.value).toISOString() : "";
}

function LocalMatchSetup({ eventId, teams, matches }: { eventId: string; teams: Team[]; matches: Match[] }) {
  const [editing, setEditing] = useState<Match | null>(null);
  const [matchType, setMatchType] = useState<"qualification" | "playoff" | "practice">("qualification");
  const [createState, createAction, creating] = useActionState(createLocalMatch, initialActionState);
  const [updateState, updateAction, updating] = useActionState(updateLocalMatch, initialActionState);
  const [deleteState, deleteAction, deleting] = useActionState(deleteLocalMatch, initialActionState);
  const localMatches = matches.filter((match) => match.key.startsWith("manual_"));
  const activeType = editing?.type === "playoff" || editing?.type === "practice" ? editing.type : editing ? "qualification" : matchType;
  const nextNumber = nextManualMatchNumber(localMatches, activeType);
  const pending = creating || updating;
  return <details className="practice-setup" open={Boolean(editing)}><summary>{editing ? `Edit ${label(editing)}` : "Add or manage local manual matches"}</summary><p className="muted">These local matches never overwrite TBA. You can edit team numbers before reports are submitted.</p><form key={editing?.id ?? `new-${matchType}`} action={editing ? updateAction : createAction} className="practice-match-form"><input type="hidden" name="eventId" value={eventId}/><input type="hidden" name="matchId" value={editing?.id ?? ""}/><div className="field"><label>Round</label><AppSelect name="matchType" ariaLabel="Manual match round" value={activeType} onValueChange={(value) => !editing && setMatchType(value as "qualification" | "playoff" | "practice")} options={[{ value: "qualification", label: "Qualification" }, { value: "playoff", label: "Playoff" }, { value: "practice", label: "Practice" }]}/></div><div className="field"><label>Match #</label><input name="matchNumber" type="text" inputMode="numeric" pattern="[0-9]*" required defaultValue={editing?.number ?? nextNumber}/></div><div className="field"><label>Red team numbers</label><input name="redTeams" required defaultValue={editing ? teamNumbers(editing.red, teams) : ""} placeholder="694, 1678, 254"/></div><div className="field"><label>Blue team numbers</label><input name="blueTeams" required defaultValue={editing ? teamNumbers(editing.blue, teams) : ""} placeholder="118, 6328, 971"/></div><button className="button" disabled={pending}>{pending ? "Saving…" : editing ? "Save manual match" : "Add manual match"}</button>{editing && <button type="button" className="button secondary" disabled={pending} onClick={() => setEditing(null)}>Cancel</button>}</form><Message state={editing ? updateState : createState}/>{editing && <form action={deleteAction} onSubmit={(event) => { if (!window.confirm(`Delete ${label(editing)}? Submitted reports protect a manual match from deletion.`)) event.preventDefault(); }} className="practice-delete"><input type="hidden" name="eventId" value={eventId}/><input type="hidden" name="matchId" value={editing.id}/><button className="button danger" disabled={deleting}>{deleting ? "Deleting…" : "Delete manual match"}</button><Message state={deleteState}/></form>}{localMatches.length ? <div className="practice-match-list">{localMatches.map((match) => <button type="button" key={match.id} className={editing?.id === match.id ? "active" : ""} onClick={() => { setEditing(match); if (match.type === "qualification" || match.type === "playoff" || match.type === "practice") setMatchType(match.type); }}><strong>{label(match)}</strong><span>{teamNumbers(match.red, teams)} vs {teamNumbers(match.blue, teams)}</span></button>)}</div> : <p className="muted">No local manual matches yet.</p>}</details>;
}

function ManualTeamRow({ eventId, team }: { eventId: string; team: Team }) { const [state, action, pending] = useActionState(removeManualEventTeam, initialActionState); return <div className="manual-team-row"><span><strong>{team.number}</strong> · {team.name}</span><form action={action}><input type="hidden" name="eventId" value={eventId}/><input type="hidden" name="teamId" value={team.id}/><button type="submit" className="button secondary" disabled={pending}>Remove</button></form>{state.error && <span className="error">{state.error}</span>}</div>; }

function ManualRoster({ eventId, teams }: { eventId: string; teams: Team[] }) { const [state, action, pending] = useActionState(addManualEventTeam, initialActionState); return <section className="manual-event-section"><div><h3>Event teams</h3><p className="muted">Add a team to this event, or enter an existing team number to update its name.</p></div><form action={action} className="manual-team-form"><input type="hidden" name="eventId" value={eventId}/><label><span>Team #</span><input name="teamNumber" type="text" inputMode="numeric" pattern="[0-9]*" required placeholder="694"/></label><label><span>Name</span><input name="name" required maxLength={160} placeholder="Stuy Fission"/></label><button className="button secondary" disabled={pending}>{pending ? "Saving…" : "Save team"}</button></form><Message state={state}/><div className="manual-team-list">{teams.length ? teams.map((team) => <ManualTeamRow key={team.id} eventId={eventId} team={team}/>) : <p className="muted">No teams added yet.</p>}</div></section>; }

function nextManualMatchNumber(matches: Match[], matchType: string) {
  return Math.max(0, ...matches.filter((match) => match.type === matchType).map((match) => match.number)) + 1;
}

function ManualMatchSetup({ eventId, teams, matches }: { eventId: string; teams: Team[]; matches: Match[] }) {
  const [editing, setEditing] = useState<Match | null>(null);
  const [state, action, pending] = useActionState(saveManualMatch, initialActionState);
  const [deleteState, deleteAction, deleting] = useActionState(deleteManualMatch, initialActionState);
  const suggestedNumber = nextManualMatchNumber(matches, editing?.type ?? "qualification");

  return <section className="manual-event-section">
    <div className="card-head"><div><h3>{editing ? `Edit ${label(editing)}` : "Add a match"}</h3><p className="muted">Teams are saved to the event automatically. Enter one to three teams per alliance.</p></div>{editing && <button type="button" className="button secondary" onClick={() => setEditing(null)}>New match</button>}</div>
    <form key={editing?.id ?? "new"} action={action} onSubmit={captureScheduledAtInstant} className="manual-match-form">
      <input type="hidden" name="eventId" value={eventId}/><input type="hidden" name="matchId" value={editing?.id ?? ""}/><input type="hidden" name="scheduledAtIso"/>
      <label><span>Match #</span><input name="matchNumber" type="text" inputMode="numeric" pattern="[0-9]*" required defaultValue={editing?.number ?? suggestedNumber}/></label>
      <label><span>Round</span><AppSelect name="matchType" ariaLabel="Match round" defaultValue={editing?.type ?? "qualification"} onValueChange={(value) => { if (!editing) { const numberInput = document.querySelector<HTMLInputElement>(".manual-match-form [name='matchNumber']"); if (numberInput) numberInput.value = String(nextManualMatchNumber(matches, value)); } }} options={[{value:"qualification",label:"Qualification"},{value:"playoff",label:"Playoff"},{value:"practice",label:"Practice"}]}/></label>
      <label><span>Scheduled time</span><LocalScheduledAtInput value={editing?.scheduledAt ?? null}/></label>
      <label><span>Red teams</span><input name="redTeams" required defaultValue={editing ? teamNumbers(editing.red, teams) : ""} placeholder="694, 1678, 254"/></label>
      <label><span>Blue teams</span><input name="blueTeams" required defaultValue={editing ? teamNumbers(editing.blue, teams) : ""} placeholder="118, 6328, 971"/></label>
      <button className="button" disabled={pending}>{pending ? "Saving…" : editing ? "Save match" : "Add match"}</button>
    </form>
    <Message state={state}/>{editing && <form action={deleteAction} onSubmit={(event) => { if (!window.confirm(`Delete ${label(editing)}?`)) event.preventDefault(); }}><input type="hidden" name="eventId" value={eventId}/><input type="hidden" name="matchId" value={editing.id}/><button className="button danger" disabled={deleting}>{deleting ? "Deleting…" : "Delete match"}</button><Message state={deleteState}/></form>}
    <div className="manual-match-list">{matches.map((match) => <button type="button" key={match.id} className={editing?.id === match.id ? "active" : ""} onClick={() => setEditing(match)}><strong>{label(match)}</strong><span>{teamNumbers(match.red, teams)} vs {teamNumbers(match.blue, teams)}</span></button>)}</div>
  </section>;
}

function ManualEventSetup({ eventId, teams, matches }: { eventId: string; teams: Team[]; matches: Match[] }) { return <section className="card manual-event-setup"><div className="card-head"><div><h2>Manual event setup</h2><p className="muted">This event stays fully local to HAL9000. It will not sync with The Blue Alliance.</p></div></div><ManualRoster eventId={eventId} teams={teams}/><ManualMatchSetup eventId={eventId} teams={teams} matches={matches}/></section>; }

const manualMatchTypeOrder: Record<string, number> = { qualification: 0, playoff: 1, practice: 2 };
const compareManualMatches = (left: Match, right: Match) => manualMatchTypeOrder[left.type] - manualMatchTypeOrder[right.type] || left.number - right.number;

export function MatchesBoard({ matches, teams, eventId, isManual, canManage }: { matches: Match[]; teams: Team[]; eventId: string; isManual: boolean; canManage: boolean }) {
  const [type, setType] = useState("all"), [teamId, setTeamId] = useState(""), [status, setStatus] = useState("all");
  const orderedMatches = useMemo(() => isManual ? [...matches].sort(compareManualMatches) : matches, [isManual, matches]);
  const number = new Map(teams.map((team) => [team.id, team.number]));
  const shown = useMemo(() => orderedMatches.filter((match) => (type === "all" || match.type === type) && (!teamId || [...match.red, ...match.blue].includes(teamId)) && (status === "all" || match.status === status)), [orderedMatches, type, teamId, status]);
  const completed = matches.filter((match) => match.status === "played").length;
  const upcoming = matches.filter((match) => match.status !== "played" && match.status !== "cancelled").length;
  return <>
    {canManage && isManual && <ManualEventSetup eventId={eventId} teams={teams} matches={orderedMatches}/>}
    <section className="card">
      <div className="card-head"><div><h2>Match schedule</h2><p className="muted">{isManual ? "Locally managed schedule and scores." : "Official schedule and final scores refresh automatically while the active event is open."}</p></div><span className="muted">{upcoming} left · {completed} complete</span></div>
      {canManage && !isManual && <LocalMatchSetup eventId={eventId} teams={teams} matches={matches}/>}
      <div className="schedule-filters">
        <AppSelect ariaLabel="Filter by round" value={type} onValueChange={setType} options={[{ value: "all", label: "All rounds" }, { value: "qualification", label: "Qualifications" }, { value: "playoff", label: "Playoffs" }, { value: "practice", label: "Practice" }]}/>
        <SearchableTeamSelect id="schedule-team-filter" value={teamId} onValueChange={setTeamId} teams={teams.map((team) => ({ ...team, name: team.name }))} emptyLabel="All teams" placeholder="Search team…"/>
        <AppSelect ariaLabel="Filter by status" value={status} onValueChange={setStatus} options={[{ value: "all", label: "All statuses" }, { value: "scheduled", label: "Upcoming" }, { value: "played", label: "Finished" }]}/>
      </div>
      {shown.map((match) => <div className="match-row" key={match.id}><span className="match-time">{match.scheduledAt ? formatLocalDateTime(match.scheduledAt, "time") : "—"}</span><span className="match-num">{label(match)}</span><div className="alliances"><div className="red">{match.red.map((id) => number.get(id) ?? "—").join(" · ")}</div><div className="blue">{match.blue.map((id) => number.get(id) ?? "—").join(" · ")}</div></div>{match.redScore !== null && match.blueScore !== null ? <span className="match-score" aria-label={`Final score: red ${match.redScore}, blue ${match.blueScore}`}><span className="red">{match.redScore}</span><span>–</span><span className="blue">{match.blueScore}</span></span> : <span className={`tag ${match.status === "played" ? "complete" : "pending"}`}>{match.status}</span>}<div className="row-actions"><Link className="button secondary" href={`/submissions?match=${match.id}`}>Reports</Link><Link className="button secondary" href={`/scout/match?match=${match.id}`}>Scout</Link></div></div>)}
      {!shown.length && <p className="muted">No matches match these filters.</p>}
    </section>
  </>;
}
