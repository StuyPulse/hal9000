"use client";

import { FlipHorizontal2, Plus, Trash2 } from "lucide-react";
import { useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { AppSelect } from "@/components/app-select";
import { queueScoutingEntry, removeQueuedScoutingEntry, tryUpsertScoutingEntry } from "@/lib/offline-scouting-queue";
import { updateMatchScoutingEntry } from "./actions";

type Props = {
  eventId: string;
  organizationId: string;
  scoutUserId: string;
  matchId?: string;
  teamId: string;
  assignmentId?: string;
  alliance?: "red" | "blue" | "manual";
  otherTeams: { id: string; number: number; alliance: "red" | "blue" | "manual" }[];
  manualMatch?: { stage: string; label?: string; alliance?: "red" | "blue" };
  editingEntryId?: string;
  initialPayload?: Record<string, unknown>;
  returnTo?: string;
};
type Score = { shoot: number; ferry: number };
type BreakageIssue = { id: string; timestamp: string; tag: string; otherIssue: string };

const spots = [
  { id: "depot", label: "Depot", allianceLayout: { x: "14.6%", y: "8.5%" }, mirrorLayout: { x: "85.3%", y: "8.5%" } },
  { id: "depot-bump", label: "Depot Bump", allianceLayout: { x: "14.6%", y: "29.2%" }, mirrorLayout: { x: "85.3%", y: "29.6%" } },
  { id: "hub", label: "Hub", allianceLayout: { x: "14.6%", y: "49.8%" }, mirrorLayout: { x: "85.3%", y: "50.7%" } },
  { id: "outpost-bump", label: "Outpost Bump", allianceLayout: { x: "14.6%", y: "70.5%" }, mirrorLayout: { x: "85.3%", y: "71.7%" } },
  { id: "outpost", label: "Outpost", allianceLayout: { x: "14.6%", y: "91.1%" }, mirrorLayout: { x: "85.3%", y: "92.8%" } },
  { id: "depot-trench", label: "Depot Trench", allianceLayout: { x: "28%", y: "7.3%" }, mirrorLayout: { x: "72.6%", y: "7.6%" } },
  { id: "outpost-trench", label: "Outpost Trench", allianceLayout: { x: "28%", y: "92.7%" }, mirrorLayout: { x: "72.6%", y: "92.6%" } },
];
const tags = ["Intake broke", "Shooter broke", "Drive issue", "Electrical", "Other"];
const manualStageOptions = [
  { value: "qualification", label: "Qualification" },
  { value: "practice", label: "Practice" },
  { value: "quarterfinal", label: "Quarterfinal" },
  { value: "semifinal", label: "Semifinal" },
  { value: "final", label: "Final" },
  { value: "other", label: "Other / exception" },
];
const empty = (): Score => ({ shoot: 0, ferry: 0 });
const emptyBreakageIssue = (): BreakageIssue => ({ id: crypto.randomUUID(), timestamp: "", tag: "", otherIssue: "" });

const asNumber = (value: unknown, fallback = 0) => typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : fallback;
const asRecord = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const manualStageValue = (stage: string | undefined) => {
  const value = stage?.trim().toLowerCase() ?? "";
  return manualStageOptions.some((option) => option.value === value) ? value : "other";
};
const manualStageLabel = (stage: string) => manualStageOptions.find((option) => option.value === stage)?.label ?? "Other / exception";

function initialIssues(payload: Record<string, unknown>) {
  const saved = Array.isArray(payload.breakage_issues) ? payload.breakage_issues : [];
  const issues = saved.map((value) => {
    const issue = asRecord(value);
    const issueText = typeof issue.issue === "string" ? issue.issue : "";
    const tag = tags.includes(issueText) ? issueText : issueText ? "Other" : "";
    return { id: crypto.randomUUID(), timestamp: typeof issue.timestamp === "string" ? normalizeMatchTimestamp(issue.timestamp) : "", tag, otherIssue: tag === "Other" ? issueText : "" };
  });
  if (issues.length) return issues;
  const legacyIssue = typeof payload.break_tag === "string" ? payload.break_tag : "";
  const legacyTimestamp = typeof payload.break_timestamp === "string" ? normalizeMatchTimestamp(payload.break_timestamp) : "";
  if (!legacyIssue && !legacyTimestamp) return [];
  const tag = tags.includes(legacyIssue) ? legacyIssue : legacyIssue ? "Other" : "";
  return [{ id: crypto.randomUUID(), timestamp: legacyTimestamp, tag, otherIssue: tag === "Other" ? legacyIssue : "" }];
}

function normalizeMatchTimestamp(value: string) {
  const [rawMinutes = "", rawSeconds = ""] = value.split(":");
  const minutes = rawMinutes.replace(/\D/g, "").slice(0, 1);
  const seconds = rawSeconds.replace(/\D/g, "").slice(0, 2);
  if (!minutes && !seconds) return "";
  return `${minutes || "0"}:${String(Math.min(59, Number(seconds || 0))).padStart(2, "0")}`;
}

export function RebuiltMatchForm({ eventId, organizationId, scoutUserId, matchId, teamId, assignmentId, alliance = "red", otherTeams, manualMatch, editingEntryId, initialPayload = {}, returnTo }: Props) {
  const router = useRouter();
  const [noShow, setNoShow] = useState(() => Boolean(initialPayload.no_show));
  const [spot, setSpot] = useState<string | undefined>(() => typeof initialPayload.starting_spot === "string" ? initialPayload.starting_spot : undefined);
  const [auto, setAuto] = useState(() => { const score = asRecord(initialPayload.auto); return { shoot: asNumber(score.shoot), ferry: asNumber(score.ferry) }; });
  const [teleop, setTeleop] = useState(() => { const score = asRecord(initialPayload.teleop); return { shoot: asNumber(score.shoot), ferry: asNumber(score.ferry) }; });
  const [fouls, setFouls] = useState(() => asNumber(initialPayload.fouls));
  const [defense, setDefense] = useState(() => Boolean(initialPayload.defense));
  const [level, setLevel] = useState(() => Math.min(10, Math.max(1, asNumber(initialPayload.defense_level, 5))));
  const [defended, setDefended] = useState<string[]>(() => Array.isArray(initialPayload.defended_teams) ? initialPayload.defended_teams.filter((value): value is string => typeof value === "string") : []);
  const [broke, setBroke] = useState(() => Boolean(initialPayload.robot_broke));
  const [breakageIssues, setBreakageIssues] = useState<BreakageIssue[]>(() => initialIssues(initialPayload));
  const [comments, setComments] = useState(() => typeof initialPayload.comments === "string" ? initialPayload.comments : "");
  const [manualStage, setManualStage] = useState<string>(() => manualStageValue(manualMatch?.stage));
  const [manualMatchNumber, setManualMatchNumber] = useState<string>(() => manualMatch?.label ?? "");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [mirrored, setMirrored] = useState(false);
  const [entryId] = useState(() => {
    if (typeof window === "undefined") return "";
    if (editingEntryId) return editingEntryId;
    const reportKey = assignmentId ?? (matchId ? `${matchId}:${teamId}` : `manual:${manualMatch?.stage ?? "other"}:${manualMatch?.label ?? ""}:${teamId}`);
    const key = `wildcard-pulse:scouting-entry:${reportKey}`;
    const existing = window.localStorage.getItem(key);
    const id = existing ?? crypto.randomUUID();
    window.localStorage.setItem(key, id);
    return id;
  });

  const disabled = noShow || saving || submitted;
  const total = (score: Score) => score.shoot + score.ferry;
  // Blue rotates only the field art; each layout keeps its chosen control positions.
  const mapRotated = alliance === "blue";
  const mapMirrored = mirrored;
  const positionFor = (item: (typeof spots)[number]) => mapMirrored ? item.mirrorLayout : item.allianceLayout;

  async function save(finalize: boolean) {
    if (saving || !entryId) return;
    setSaving(true);
    setMessage("");
    if (!organizationId || !scoutUserId) {
      setMessage("Sign in again before saving.");
      setSaving(false);
      return;
    }
    if (manualMatch && manualStage !== "other" && !manualMatchNumber.trim()) {
      setMessage("Enter a match # for this manual report.");
      setSaving(false);
      return;
    }
    const savedBreakageIssues = broke ? breakageIssues.map(({ timestamp, tag, otherIssue }) => ({ timestamp: normalizeMatchTimestamp(timestamp), issue: tag === "Other" ? otherIssue.trim() || "Other" : tag || null })).filter((issue) => issue.timestamp || issue.issue) : [];
    const payload = {
      no_show: noShow, starting_spot: noShow ? null : spot, starting_spot_confirmed: Boolean(!noShow && spot),
      auto: { shoot: auto.shoot, ferry: auto.ferry }, teleop: { shoot: teleop.shoot, ferry: teleop.ferry },
      no_show_reason: noShow ? "No show" : null, auto_fuel: noShow ? 0 : total(auto), teleop_fuel: noShow ? 0 : total(teleop),
      fouls: noShow ? 0 : fouls, defense: noShow ? false : defense, defense_level: defense ? level : null,
      defended_teams: defense ? defended : [], robot_broke: noShow ? false : broke, breakage_issues: noShow ? [] : savedBreakageIssues,
      break_timestamp: noShow ? null : savedBreakageIssues[0]?.timestamp ?? null, break_tag: noShow ? null : savedBreakageIssues[0]?.issue ?? null, comments,
      report_source: manualMatch ? "manual" : "scheduled",
      manual_match: manualMatch ? { stage: manualStageLabel(manualStage), label: manualMatchNumber.trim() || null, alliance: manualMatch.alliance ?? alliance } : null,
    };
    const submittedAt = finalize ? new Date().toISOString() : null;
    const entry = {
      id: entryId, organization_id: organizationId, event_id: eventId, team_id: teamId, match_id: matchId ?? null,
      assignment_id: assignmentId ?? null, scout_user_id: scoutUserId, entry_type: "match" as const, form_version: 4, payload,
      status: finalize ? "submitted" as const : "draft" as const, submitted_at: submittedAt,
    };
    const result = editingEntryId
      ? { error: (await updateMatchScoutingEntry({ entryId: editingEntryId, payload })).error ?? null, shouldQueue: false }
      : await tryUpsertScoutingEntry(entry);
    const { error, shouldQueue } = result;
    if (shouldQueue) {
      await queueScoutingEntry(entry);
      setMessage(finalize ? "Report saved on this device. It will submit automatically when you reconnect." : "Draft saved on this device. It will sync automatically when you reconnect.");
      setSaving(false);
      return;
    }
    // The database completes the matching assignment on submitted match reports.
    // That also covers reports opened from the scheduled-match picker.
    if (!error) await removeQueuedScoutingEntry(entryId);
    if (!error && finalize) setSubmitted(true);
    setMessage(error ?? (editingEntryId ? "Changes saved." : finalize ? "Scout report submitted and visible in team history." : "Draft saved."));
    setSaving(false);
    if (!error && (editingEntryId || finalize)) {
      if (returnTo) router.replace(returnTo);
      else if (window.history.length > 1) router.back();
      else router.replace("/scout/match");
    }
  }

  return <section className="scouting-card match-form">
      {manualMatch && <div className="form-section manual-match-details"><div className="section-title">Manual match details</div><div className="form-grid"><div className="field"><label>Match type</label><AppSelect ariaLabel="Manual match type" value={manualStage} onValueChange={setManualStage} disabled={saving || submitted} options={manualStageOptions}/></div><div className="field"><label htmlFor="manual-match-number">Match # {manualStage === "other" ? "(optional)" : ""}</label><input id="manual-match-number" disabled={saving || submitted} value={manualMatchNumber} onChange={(event) => setManualMatchNumber(event.target.value)} placeholder={manualStage === "other" ? "Optional label" : "e.g. 18"}/></div></div></div>}
      <div className="form-section"><div className="section-title">Auton starting position</div><div className="form-field-actions"><button type="button" className="button secondary mobile-full" disabled={saving || submitted} aria-pressed={noShow} onClick={() => setNoShow(!noShow)}>{noShow ? "Undo no show" : "Mark no show"}</button><button type="button" className="button secondary mobile-full" disabled={saving || submitted} aria-pressed={mirrored} onClick={() => setMirrored((current) => !current)}><FlipHorizontal2 size={16} aria-hidden="true"/>{mirrored ? "Use alliance view" : "Mirror field"}</button></div><fieldset disabled={disabled}><legend className="sr-only">Autonomous starting position</legend><div className={`field-map ${mapRotated ? "rotated" : ""} ${mapMirrored ? "mirrored" : ""}`}><div className="field-map-art" aria-hidden="true"/>{spots.map((item) => <button type="button" key={item.id} aria-label={`Start at ${item.label}`} aria-pressed={spot === item.id} style={{"--spot-x":positionFor(item).x,"--spot-y":positionFor(item).y} as CSSProperties} className={spot === item.id ? `spot ${alliance}` : "spot"} onClick={() => setSpot((current) => current === item.id ? undefined : item.id)}><span>{item.label}</span></button>)}</div></fieldset>{spot && <div className="spot-choice" aria-live="polite">Starting position: {spots.find((item)=>item.id===spot)?.label}</div>}</div>
    <fieldset disabled={disabled}><legend className="sr-only">Match scouting details</legend>
      <div className="form-section"><div className="section-title">Scoring</div><div className="scoring-table"><div className="scoring-head"><span>Period</span><span>Scored</span><span>Ferried</span></div><ScoreRow label="Autonomous" value={auto} update={(key, value) => setAuto((score) => ({ ...score, [key]: Math.max(0, value) }))} autoRow /><ScoreRow label="Teleop" value={teleop} update={(key, value) => setTeleop((score) => ({ ...score, [key]: Math.max(0, value) }))} /></div></div>
      <div className="form-section"><div className="section-title">Fouls</div><Counter label="Fouls" value={fouls} by={1} setValue={setFouls} showLabel={false} /></div>
      <div className="form-section"><div className="section-title">Defense</div><label className="option-toggle"><input type="checkbox" checked={defense} onChange={(event) => setDefense(event.target.checked)} /> Played defense</label>{defense && <><div className="field"><label htmlFor="defense-level">Defense level: {level} / 10</label><input id="defense-level" type="range" min="1" max="10" value={level} onChange={(event) => setLevel(Number(event.target.value))} /></div><p className="muted">{manualMatch ? "Select up to three event teams this robot defended." : "Select the opposing robots this team defended."}</p><div className="team-picker" aria-label={manualMatch ? "Event teams defended against" : "Opposing teams defended against"}>{otherTeams.map((team) => <button type="button" aria-pressed={defended.includes(team.id)} key={team.id} className={defended.includes(team.id) ? `team-pick ${team.alliance}` : "team-pick"} onClick={() => setDefended((current) => current.includes(team.id) ? current.filter((id) => id !== team.id) : current.length < 3 ? [...current, team.id] : current)}>{team.number}</button>)}</div></>}</div>
      <div className="form-section"><div className="section-title">Breakage · PulseCrew</div><label className="option-toggle"><input type="checkbox" checked={broke} onChange={(event) => { const next = event.target.checked; setBroke(next); if (next && !breakageIssues.length) setBreakageIssues([emptyBreakageIssue()]); }} /> Robot broke / disabled</label>{broke && <div className="breakage-issues">{breakageIssues.map((issue, index) => <div className="breakage-issue" key={issue.id}><div className="breakage-issue-head"><strong>Issue {index + 1}</strong>{breakageIssues.length > 1 && <button type="button" className="icon-button" aria-label={`Remove issue ${index + 1}`} onClick={() => setBreakageIssues((current) => current.filter((item) => item.id !== issue.id))}><Trash2 size={16}/></button>}</div><div className="form-grid"><div className="field"><label>Timestamp (optional)</label><MatchTimestampInput value={issue.timestamp} onChange={(timestamp) => setBreakageIssues((current) => current.map((item) => item.id === issue.id ? { ...item, timestamp } : item))}/></div><div className="field"><label htmlFor={`break-issue-${issue.id}`}>Issue</label><AppSelect id={`break-issue-${issue.id}`} ariaLabel="Breakage issue" value={issue.tag} onValueChange={(value) => setBreakageIssues((current) => current.map((item) => item.id === issue.id ? { ...item, tag: value } : item))} options={[{value:"",label:"Choose an issue…"}, ...tags.map((item) => ({value:item,label:item}))]}/></div>{issue.tag === "Other" && <div className="field"><label htmlFor={`break-other-${issue.id}`}>Describe the issue</label><input id={`break-other-${issue.id}`} value={issue.otherIssue} onChange={(event) => setBreakageIssues((current) => current.map((item) => item.id === issue.id ? { ...item, otherIssue: event.target.value } : item))} placeholder="e.g. chain came off" /></div>}</div></div>)}<button type="button" className="button secondary breakage-add" onClick={() => setBreakageIssues((current) => [...current, emptyBreakageIssue()])}><Plus size={16} aria-hidden="true"/>Add another issue</button></div>}</div>
    </fieldset>
    <div className="form-section"><div className="section-title">Comments</div><div className="field"><textarea id="match-comments" aria-label="Comments" disabled={saving || submitted} value={comments} onChange={(event) => setComments(event.target.value)} placeholder="Be succinct and include what the data won't show" /></div></div>
    {noShow && <p className="trend">No show records all scoring as zero; comments remain available.</p>}
    <div className="form-actions">{!editingEntryId && <button type="button" className="button secondary" disabled={saving || submitted} onClick={() => save(false)}>Save draft</button>}<button type="button" className="button" disabled={saving || submitted} onClick={() => save(true)}>{saving ? "Saving…" : submitted ? "Submitted" : editingEntryId ? "Save changes" : "Submit scout report"}</button></div>
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

function MatchTimestampInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [minutes = "", seconds = ""] = value.split(":");
  const update = (nextMinutes: string, nextSeconds: string) => onChange(nextMinutes || nextSeconds ? `${nextMinutes}:${nextSeconds}` : "");
  const finish = () => onChange(normalizeMatchTimestamp(value));
  return <div className="match-timestamp" aria-label="Breakage timestamp"><input aria-label="Breakage minute" value={minutes} inputMode="numeric" pattern="[0-9]*" maxLength={1} onChange={(event) => update(event.currentTarget.value.replace(/\D/g, "").slice(0, 1), seconds)} onBlur={finish} placeholder="0"/><span aria-hidden="true">:</span><input aria-label="Breakage seconds" value={seconds} inputMode="numeric" pattern="[0-9]*" maxLength={2} onChange={(event) => update(minutes, event.currentTarget.value.replace(/\D/g, "").slice(0, 2))} onBlur={finish} placeholder="00"/></div>;
}
