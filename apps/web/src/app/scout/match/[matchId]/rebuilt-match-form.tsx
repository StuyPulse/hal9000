"use client";

import { FlipHorizontal2, Plus, Trash2 } from "lucide-react";
import { useState, type CSSProperties } from "react";
import { createClient } from "@/lib/supabase/client";

type Props = {
  eventId: string;
  matchId?: string;
  teamId: string;
  assignmentId?: string;
  alliance?: "red" | "blue" | "manual";
  otherTeams: { id: string; number: number; alliance: "red" | "blue" | "manual" }[];
  manualMatch?: { stage: string; label?: string };
};
type Score = { shoot: number; ferry: number };
type BreakageIssue = { id: string; timestamp: string; tag: string; otherIssue: string };

const spots = [
  { id: "outpost", label: "Outpost", x: "8%", y: "10%" },
  { id: "outpost-bump", label: "Outpost Bump", x: "8%", y: "30%" },
  { id: "hub", label: "Hub", x: "8%", y: "50%" },
  { id: "depot-bump", label: "Depot Bump", x: "8%", y: "70%" },
  { id: "depot", label: "Depot", x: "8%", y: "90%" },
  { id: "outpost-trench", label: "Outpost Trench", x: "26%", y: "10%" },
  { id: "depot-trench", label: "Depot Trench", x: "26%", y: "93%" },
];
const tags = ["Intake broke", "Shooter broke", "Drive issue", "Electrical", "Other"];
const empty = (): Score => ({ shoot: 0, ferry: 0 });
const emptyBreakageIssue = (): BreakageIssue => ({ id: crypto.randomUUID(), timestamp: "", tag: "", otherIssue: "" });

export function RebuiltMatchForm({ eventId, matchId, teamId, assignmentId, alliance = "red", otherTeams, manualMatch }: Props) {
  const [noShow, setNoShow] = useState(false);
  const [spot, setSpot] = useState<string>();
  const [auto, setAuto] = useState(empty);
  const [teleop, setTeleop] = useState(empty);
  const [fouls, setFouls] = useState(0);
  const [defense, setDefense] = useState(false);
  const [level, setLevel] = useState(5);
  const [defended, setDefended] = useState<string[]>([]);
  const [broke, setBroke] = useState(false);
  const [breakageIssues, setBreakageIssues] = useState<BreakageIssue[]>([]);
  const [comments, setComments] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [mirrored, setMirrored] = useState(false);
  const [entryId] = useState(() => {
    if (typeof window === "undefined") return "";
    const reportKey = assignmentId ?? (matchId ? `${matchId}:${teamId}` : `manual:${manualMatch?.stage ?? "other"}:${manualMatch?.label ?? ""}:${teamId}`);
    const key = `wildcard-pulse:scouting-entry:${reportKey}`;
    const existing = window.localStorage.getItem(key);
    const id = existing ?? crypto.randomUUID();
    window.localStorage.setItem(key, id);
    return id;
  });

  const disabled = noShow || saving || submitted;
  const total = (score: Score) => score.shoot + score.ferry;
  const mapRotated = alliance === "red";
  const mapMirrored = mirrored;
  const mapPosition = (value: string, axis: "x" | "y") => {
    const position = Number.parseFloat(value);
    const shouldInvert = axis === "x" ? mapRotated !== mapMirrored : mapRotated;
    return `${shouldInvert ? 100 - position : position}%`;
  };

  async function save(finalize: boolean) {
    if (saving || !entryId) return;
    setSaving(true);
    setMessage("");
    const supabase: any = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const { data: member } = await supabase.from("organization_members").select("organization_id").eq("user_id", user?.id).limit(1).maybeSingle();
    if (!user || !member) {
      setMessage("Sign in again before saving.");
      setSaving(false);
      return;
    }
    const savedBreakageIssues = broke ? breakageIssues.map(({ timestamp, tag, otherIssue }) => ({ timestamp, issue: tag === "Other" ? otherIssue.trim() || "Other" : tag || null })).filter((issue) => issue.timestamp || issue.issue) : [];
    const payload = {
      no_show: noShow, starting_spot: noShow ? null : spot, starting_spot_confirmed: Boolean(!noShow && spot),
      auto: { shoot: auto.shoot, ferry: auto.ferry }, teleop: { shoot: teleop.shoot, ferry: teleop.ferry },
      no_show_reason: noShow ? "No show" : null, auto_fuel: noShow ? 0 : total(auto), teleop_fuel: noShow ? 0 : total(teleop),
      fouls: noShow ? 0 : fouls, defense: noShow ? false : defense, defense_level: defense ? level : null,
      defended_teams: defense ? defended : [], robot_broke: noShow ? false : broke, breakage_issues: noShow ? [] : savedBreakageIssues,
      break_timestamp: noShow ? null : savedBreakageIssues[0]?.timestamp ?? null, break_tag: noShow ? null : savedBreakageIssues[0]?.issue ?? null, comments,
      report_source: manualMatch ? "manual" : "scheduled",
      manual_match: manualMatch ? { stage: manualMatch.stage, label: manualMatch.label || null } : null,
    };
    const submittedAt = finalize ? new Date().toISOString() : null;
    const { error } = await supabase.from("scouting_entries").upsert({
      id: entryId, organization_id: member.organization_id, event_id: eventId, team_id: teamId, match_id: matchId ?? null,
      assignment_id: assignmentId ?? null, scout_user_id: user.id, entry_type: "match", form_version: 4, payload,
      status: finalize ? "submitted" : "draft", submitted_at: submittedAt,
    }, { onConflict: "id" });
    if (!error && finalize && assignmentId) await supabase.from("scouting_assignments").update({ status: "complete", completed_at: submittedAt }).eq("id", assignmentId);
    if (!error && finalize) setSubmitted(true);
    setMessage(error ? "Could not save. Check your connection and try again." : finalize ? "Scout report submitted and visible in team history." : "Draft saved.");
    setSaving(false);
  }

  return <section className="scouting-card match-form">
      <div className="form-section"><div className="section-title">Auton starting position</div><div className="form-field-actions"><button type="button" className="button secondary mobile-full" disabled={saving || submitted} aria-pressed={noShow} onClick={() => setNoShow(!noShow)}>{noShow ? "Undo no show" : "Mark no show"}</button><button type="button" className="button secondary mobile-full" disabled={saving || submitted} aria-pressed={mirrored} onClick={() => setMirrored((current) => !current)}><FlipHorizontal2 size={16} aria-hidden="true"/>{mirrored ? "Use alliance view" : "Mirror field"}</button></div><fieldset disabled={disabled}><legend className="sr-only">Autonomous starting position</legend><div className={`field-map ${mapRotated ? "rotated" : ""} ${mapMirrored ? "mirrored" : ""}`}><div className="field-map-art" aria-hidden="true"/>{spots.map((item) => <button type="button" key={item.id} aria-label={`Start at ${item.label}`} aria-pressed={spot === item.id} style={{"--spot-x":mapPosition(item.x, "x"),"--spot-y":mapPosition(item.y, "y")} as CSSProperties} className={spot === item.id ? `spot ${alliance}` : "spot"} onClick={() => setSpot((current) => current === item.id ? undefined : item.id)}><span>{item.label}</span></button>)}</div></fieldset>{spot && <div className="spot-choice" aria-live="polite">Starting position: {spots.find((item)=>item.id===spot)?.label}</div>}</div>
    <fieldset disabled={disabled}><legend className="sr-only">Match scouting details</legend>
      <div className="form-section"><div className="section-title">Scoring</div><div className="scoring-table"><div className="scoring-head"><span>Period</span><span>Scored</span><span>Ferried</span></div><ScoreRow label="Autonomous" value={auto} update={(key, value) => setAuto((score) => ({ ...score, [key]: Math.max(0, value) }))} autoRow /><ScoreRow label="Teleop" value={teleop} update={(key, value) => setTeleop((score) => ({ ...score, [key]: Math.max(0, value) }))} /></div></div>
      <div className="form-section"><div className="section-title">Fouls</div><Counter label="Fouls" value={fouls} by={1} setValue={setFouls} showLabel={false} /></div>
      <div className="form-section"><div className="section-title">Defense</div><label className="option-toggle"><input type="checkbox" checked={defense} onChange={(event) => setDefense(event.target.checked)} /> Played defense</label>{defense && <><div className="field"><label htmlFor="defense-level">Defense level: {level} / 10</label><input id="defense-level" type="range" min="1" max="10" value={level} onChange={(event) => setLevel(Number(event.target.value))} /></div><p className="muted">Select the opposing robots this team defended.</p><div className="team-picker" aria-label="Opposing teams defended against">{otherTeams.map((team) => <button type="button" aria-pressed={defended.includes(team.id)} key={team.id} className={defended.includes(team.id) ? `team-pick ${team.alliance}` : "team-pick"} onClick={() => setDefended((current) => current.includes(team.id) ? current.filter((id) => id !== team.id) : current.length < 3 ? [...current, team.id] : current)}>{team.number}</button>)}</div></>}</div>
      <div className="form-section"><div className="section-title">Breakage · PulseCrew</div><label className="option-toggle"><input type="checkbox" checked={broke} onChange={(event) => { const next = event.target.checked; setBroke(next); if (next && !breakageIssues.length) setBreakageIssues([emptyBreakageIssue()]); }} /> Robot broke / disabled</label>{broke && <div className="breakage-issues">{breakageIssues.map((issue, index) => <div className="breakage-issue" key={issue.id}><div className="breakage-issue-head"><strong>Issue {index + 1}</strong>{breakageIssues.length > 1 && <button type="button" className="icon-button" aria-label={`Remove issue ${index + 1}`} onClick={() => setBreakageIssues((current) => current.filter((item) => item.id !== issue.id))}><Trash2 size={16}/></button>}</div><div className="form-grid"><div className="field"><label htmlFor={`break-timestamp-${issue.id}`}>Timestamp (optional)</label><input id={`break-timestamp-${issue.id}`} value={issue.timestamp} onChange={(event) => setBreakageIssues((current) => current.map((item) => item.id === issue.id ? { ...item, timestamp: event.target.value } : item))} placeholder="1:42" inputMode="numeric" /></div><div className="field"><label htmlFor={`break-issue-${issue.id}`}>Issue</label><select id={`break-issue-${issue.id}`} value={issue.tag} onChange={(event) => setBreakageIssues((current) => current.map((item) => item.id === issue.id ? { ...item, tag: event.target.value } : item))}><option value="">Choose an issue…</option>{tags.map((item) => <option key={item}>{item}</option>)}</select></div>{issue.tag === "Other" && <div className="field"><label htmlFor={`break-other-${issue.id}`}>Describe the issue</label><input id={`break-other-${issue.id}`} value={issue.otherIssue} onChange={(event) => setBreakageIssues((current) => current.map((item) => item.id === issue.id ? { ...item, otherIssue: event.target.value } : item))} placeholder="e.g. chain came off" /></div>}</div></div>)}<button type="button" className="button secondary breakage-add" onClick={() => setBreakageIssues((current) => [...current, emptyBreakageIssue()])}><Plus size={16} aria-hidden="true"/>Add another issue</button></div>}</div>
    </fieldset>
    <div className="form-section"><div className="section-title">Comments</div><div className="field"><textarea id="match-comments" aria-label="Comments" disabled={saving || submitted} value={comments} onChange={(event) => setComments(event.target.value)} placeholder="Be succinct and include what the data won't show" /></div></div>
    {noShow && <p className="trend">No show records all scoring as zero; comments remain available.</p>}
    <div className="form-actions"><button type="button" className="button secondary" disabled={saving || submitted} onClick={() => save(false)}>Save draft</button><button type="button" className="button" disabled={saving || submitted} onClick={() => save(true)}>{saving ? "Saving…" : submitted ? "Submitted" : "Submit scout report"}</button></div>
    {message && <p aria-live="polite" className={message.startsWith("Could") ? "error" : "trend"}>{message}</p>}
  </section>;
}

function ScoreRow({ label, value, update, autoRow }: { label: string; value: Score; update: (key: keyof Score, value: number) => void; autoRow?: boolean }) {
  return <div className={`scoring-row ${autoRow ? "auto-row" : ""}`}><strong>{label}</strong><MiniCounter label="Scored" value={value.shoot} setValue={(next) => update("shoot", next)} /><MiniCounter label="Ferried" value={value.ferry} setValue={(next) => update("ferry", next)} /></div>;
}

function WholeNumberInput({ label, value, setValue }: { label: string; value: number; setValue: (value: number) => void }) {
  return <input aria-label={label} type="text" inputMode="numeric" pattern="[0-9]*" value={value} onChange={(event) => { const next = event.currentTarget.value; if (next === "" || /^\d+$/.test(next)) setValue(next === "" ? 0 : Number(next)); }} />;
}

function MiniCounter({ label, value, setValue }: { label: string; value: number; setValue: (value: number) => void }) {
  return <div className="counter" data-label={label}><button type="button" aria-label={`Subtract 10 ${label.toLowerCase()}`} onClick={() => setValue(Math.max(0, value - 10))}>−</button><WholeNumberInput label={`${label} count`} value={value} setValue={setValue}/><button type="button" aria-label={`Add 10 ${label.toLowerCase()}`} onClick={() => setValue(value + 10)}>+</button></div>;
}

function Counter({ label, value, by, setValue, showLabel = true }: { label: string; value: number; by: number; setValue: (value: number) => void; showLabel?: boolean }) {
  return <div className="field">{showLabel && <label>{label}</label>}<div className="counter"><button type="button" aria-label={`Subtract ${by} foul`} onClick={() => setValue(Math.max(0, value - by))}>−</button><WholeNumberInput label={label} value={value} setValue={setValue}/><button type="button" aria-label={`Add ${by} foul`} onClick={() => setValue(value + by)}>+</button></div></div>;
}
