"use client";

import { useState, type CSSProperties } from "react";
import { AppSelect } from "@/components/app-select";
import { AutoPathDrawer } from "@/components/auto-path-drawer";
import { SearchableTeamSelect } from "@/components/searchable-team-select";
import { createClient } from "@/lib/supabase/client";

type EntryType = "pre_scout" | "pit";
type Team = { id: string; number: number; name: string };
type Payload = Record<string, string>;

const preScoutFields: [string, string, string][] = [
  ["autos", "Autos: position, estimated fuel, path", "e.g. Position 3 → HUB, 20 fuel"],
  ["active_shift", "Active HUB strategy", "e.g. Scores from depot, then ferries"],
  ["inactive_shift", "Inactive HUB strategy", "e.g. Collects from floor and stages fuel"],
  ["traversal", "Bump / trench preference", "e.g. Uses trench both directions"],
  ["with_them", "Strategy with them", "e.g. Leave depot lane open"],
  ["against_them", "Strategy against them", "e.g. Block their preferred lane"],
  ["notes", "Notes", "Useful scouting observations"],
];
const title: Record<EntryType, string> = { pre_scout: "Pre scouting", pit: "Pit scouting" };
const experienceOptions = [0, 1, 2, 3].map((years) => ({ value: String(years), label: `${years} ${years === 1 ? "year" : "years"}` })).concat({ value: "4+", label: "4+ years" });

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, Number.isFinite(value) ? value : minimum));
}

function Field({ id, label, value, placeholder, onChange, helper }: { id: string; label: string; value: string; placeholder: string; onChange: (value: string) => void; helper?: string }) {
  return <div className="field"><label htmlFor={id}>{label}</label>{helper && <p className="field-hint">{helper}</p>}<textarea id={id} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder}/></div>;
}

function PitFields({ payload, setPayload }: { payload: Payload; setPayload: (next: (current: Payload) => Payload) => void }) {
  const length = clamp(Number(payload.drivetrain_length ?? 0), 0, 55);
  const width = clamp(Number(payload.drivetrain_width ?? 0), 0, 55 - length);
  const hopper = clamp(Number(payload.hopper_capacity ?? 0), 0, 500);
  const traversal = new Set((payload.traversal ?? "none").split(",").filter(Boolean));
  const perimeter = 2 * (length + width);

  function set(id: string, value: string) {
    setPayload((current) => ({ ...current, [id]: value }));
  }

  function setDimensions(nextLength: number, nextWidth: number) {
    const safeLength = clamp(Math.round(nextLength), 0, 55);
    const safeWidth = clamp(Math.round(nextWidth), 0, 55 - safeLength);
    setPayload((current) => ({ ...current, drivetrain_length: String(safeLength), drivetrain_width: String(safeWidth), dimensions: `${safeLength} in × ${safeWidth} in (${2 * (safeLength + safeWidth)} in perimeter)` }));
  }

  function setTraversal(value: "bump" | "trench" | "none") {
    if (value === "none") return set("traversal", "none");
    const next = new Set(traversal);
    next.delete("none");
    if (next.has(value)) next.delete(value);
    else next.add(value);
    set("traversal", next.size ? [...next].join(",") : "none");
  }

  return <>
    <div className="field"><label htmlFor="driver-experience">Driver experience</label><AppSelect id="driver-experience" ariaLabel="Driver experience" value={payload.driver_experience ?? ""} onValueChange={(value) => set("driver_experience", value)} options={[{ value: "", label: "Choose experience…" }, ...experienceOptions]}/></div>
    <div className="field"><label htmlFor="operator-experience">Operator experience</label><AppSelect id="operator-experience" ariaLabel="Operator experience" value={payload.operator_experience ?? ""} onValueChange={(value) => set("operator_experience", value)} options={[{ value: "", label: "Choose experience…" }, { value: "none", label: "No operator" }, ...experienceOptions]}/></div>
    <Field id="contact-info" label="Team contact info" value={payload.contact_info ?? ""} onChange={(value) => set("contact_info", value)} placeholder="e.g. Avery Chen — student drive coach — achen@example.com" helper="Include the person’s role: student, mentor, coach, or another contact."/>
    <div className="field scouting-range-field"><label>Drivetrain dimensions without bumpers</label><p className="field-hint">Perimeter: <strong>{perimeter} in / 110 in max</strong>.</p><div className="scouting-range-pair"><RangeInput id="drivetrain-length" label="Length" value={length} maximum={55 - width} onChange={(value) => setDimensions(value, width)}/><RangeInput id="drivetrain-width" label="Width" value={width} maximum={55 - length} onChange={(value) => setDimensions(length, value)}/></div></div>
    <div className="field scouting-range-field"><label htmlFor="hopper-capacity">Maximum hopper capacity</label><p className="field-hint">Fuel pieces. The slider moves in 10-piece steps; type a precise estimate if needed.</p><div className="scouting-range-with-input"><input id="hopper-capacity" className="scouting-slider" style={{ "--range-progress": `${(hopper / 500) * 100}%` } as CSSProperties} type="range" min="0" max="500" step="10" value={hopper} onChange={(event) => set("hopper_capacity", event.target.value)}/><input aria-label="Maximum hopper capacity" type="number" min="0" max="500" value={payload.hopper_capacity ?? "0"} onChange={(event) => set("hopper_capacity", event.target.value.replace(/\D/g, "").slice(0, 3))} onBlur={() => set("hopper_capacity", String(clamp(Math.round(Number(payload.hopper_capacity ?? 0) / 10) * 10, 0, 500)))} inputMode="numeric"/><span>fuel</span></div></div>
    <Field id="teleop-active-hub" label="Teleop strategy — active HUB" value={payload.teleop_active_hub ?? ""} onChange={(value) => set("teleop_active_hub", value)} placeholder="e.g. Cycles DEPOT → active HUB"/>
    <Field id="teleop-inactive-hub" label="Teleop strategy — inactive HUB" value={payload.teleop_inactive_hub ?? ""} onChange={(value) => set("teleop_inactive_hub", value)} placeholder="e.g. Collects and stages fuel while inactive"/>
    <Field id="offseason" label="Offseason drive-team plans" value={payload.offseason ?? ""} onChange={(value) => set("offseason", value)} placeholder="e.g. Two events planned before build season"/>
    <Field id="scoring-area" label="Preferred scoring area" value={payload.scoring_area ?? ""} onChange={(value) => set("scoring_area", value)} placeholder="e.g. Near-side HUB"/>
    <fieldset className="field pit-traversal"><legend>Traversal</legend><p className="field-hint">Select every route the robot can use, or mark neither.</p><div className="traversal-options"><button type="button" aria-pressed={traversal.has("bump")} className={traversal.has("bump") ? "active" : ""} onClick={() => setTraversal("bump")}><strong>Bump</strong><small>Can cross the bump</small></button><button type="button" aria-pressed={traversal.has("trench")} className={traversal.has("trench") ? "active" : ""} onClick={() => setTraversal("trench")}><strong>Trench</strong><small>Can use the trench</small></button><button type="button" aria-pressed={traversal.has("none")} className={traversal.has("none") ? "active" : ""} onClick={() => setTraversal("none")}><strong>Neither</strong><small>Uses neither route</small></button></div></fieldset>
    <Field id="comments" label="Additional comments" value={payload.comments ?? ""} onChange={(value) => set("comments", value)} placeholder="Anything a strategist should know"/>
    <div className="field auto-path-field"><label>Autonomous routines / paths</label><AutoPathDrawer value={payload.auto_routines_drawing ?? ""} onChange={(value) => set("auto_routines_drawing", value)}/><label className="auto-notes-label" htmlFor="auto-routines-notes">Auton notes</label><p className="field-hint">Use the drawing color at the start of each note so routes and observations stay matched.</p><textarea id="auto-routines-notes" value={payload.auto_routines_notes ?? ""} onChange={(event) => set("auto_routines_notes", event.target.value)} placeholder={"Red — scores preload, then returns through the trench\nBlue — collects from DEPOT before shooting\nGreen — alternate routine"}/></div>
  </>;
}

function RangeInput({ id, label, value, maximum, onChange }: { id: string; label: string; value: number; maximum: number; onChange: (value: number) => void }) {
  return <label htmlFor={id}><span>{label} <strong>{value} in</strong></span><input id={id} className="scouting-slider" style={{ "--range-progress": `${(value / 55) * 100}%` } as CSSProperties} type="range" min="0" max="55" step="1" value={value} onChange={(event) => onChange(Math.min(Number(event.target.value), maximum))}/></label>;
}

export function ManualScouting({ eventId, teams, type = "pre_scout", restricted = false }: { eventId: string; teams: Team[]; type?: EntryType; restricted?: boolean }) {
  const [teamId, setTeamId] = useState("");
  const [payload, setPayload] = useState<Payload>({});
  const [message, setMessage] = useState("");
  const sorted = [...teams].sort((a, b) => a.number - b.number);
  const set = (id: string, value: string) => setPayload((current) => ({ ...current, [id]: value }));

  async function submit() {
    if (!teamId) return setMessage("Choose a team.");
    const supabase: any = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const { data: member } = await supabase.from("organization_members").select("organization_id").eq("user_id", user?.id).limit(1).maybeSingle();
    if (!user || !member) return setMessage("Sign in again before submitting.");
    const { error } = await supabase.from("scouting_entries").insert({ organization_id: member.organization_id, event_id: eventId, team_id: teamId, scout_user_id: user.id, entry_type: type, form_version: 2, payload, status: "submitted", submitted_at: new Date().toISOString() });
    setMessage(error ? "Could not save. Check your connection and try again." : `${title[type]} saved to this team’s record.`);
  }

  return <section className="scouting-card"><div className="form-intro"><div className="form-kicker">{title[type]}</div><h2>Record what you observed.</h2><p>{restricted ? "Your team queue is assigned by an admin. Select one of your teams to begin." : "Choose a team from the active event. Example responses make the expected level of detail clear; climb is sourced from FIRST data and is not collected here."}</p></div>{restricted && !sorted.length ? <p className="muted">You do not have any prescout teams assigned yet.</p> : <><div className="form-grid"><div className="field"><label htmlFor="team">Team</label><SearchableTeamSelect id="team" value={teamId} onValueChange={setTeamId} teams={sorted}/></div></div><div className="form-grid">{type === "pre_scout" && <><div className="field"><label htmlFor="average-pieces">Average game pieces scored</label><input id="average-pieces" value={payload.average_pieces ?? ""} onChange={(event) => set("average_pieces", event.target.value.replace(/\D/g, "").slice(0, 3))} inputMode="numeric" pattern="[0-9]*" maxLength={3} placeholder="e.g. 35"/></div>{preScoutFields.map(([id, label, placeholder]) => <Field key={id} id={id} label={label} value={payload[id] ?? ""} onChange={(value) => set(id, value)} placeholder={placeholder}/>)}</>}{type === "pit" && <PitFields payload={payload} setPayload={setPayload}/>}</div><div className="form-actions"><button type="button" className="button" onClick={submit}>Submit {title[type]}</button></div>{message && <p aria-live="polite" className={message.startsWith("Could") ? "error" : "trend"}>{message}</p>}</>}</section>;
}
