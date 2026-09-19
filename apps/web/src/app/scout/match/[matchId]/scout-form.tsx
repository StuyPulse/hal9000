"use client";

import { useMemo, useState } from "react";
import { DEFAULT_2026_FORM, type FormDefinition } from "@wildcard/shared";
import { AppSelect } from "@/components/app-select";
import { createClient } from "@/lib/supabase/client";

type Submission = { id: string; payload: Record<string, unknown>; revision: number; status: "draft" | "submitted" | "corrected" | "invalid" };
type Props = { eventId: string; matchId: string; teamId: string; assignmentId: string; formVersion: number; form?: FormDefinition; submission?: Submission };

function payloadRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function ScoutForm({ eventId, matchId, teamId, assignmentId, formVersion, form = DEFAULT_2026_FORM, submission }: Props) {
  const [payload, setPayload] = useState<Record<string, unknown>>(() => payloadRecord(submission?.payload));
  const [submissionId] = useState(() => {
    if (submission?.id) return submission.id;
    if (typeof window === "undefined") return "";
    const storageKey = `wildcard-pulse:submission:${assignmentId}`;
    const id = window.localStorage.getItem(storageKey) ?? crypto.randomUUID();
    window.localStorage.setItem(storageKey, id);
    return id;
  });
  const [revision, setRevision] = useState(submission?.revision ?? 0);
  const [isLocked, setIsLocked] = useState(Boolean(submission && submission.status !== "draft"));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string>();
  const missing = useMemo(() => form.fields.filter((field) => field.required && (payload[field.id] === undefined || payload[field.id] === "")).map((field) => field.label), [form, payload]);
  const set = (id: string, value: unknown) => setPayload((current) => ({ ...current, [id]: value }));

  async function submit(status: "draft" | "submitted") {
    if (!submissionId || saving || isLocked) return;
    if (status === "submitted" && missing.length) return setMessage(`Complete: ${missing.join(", ")}.`);
    setSaving(true);
    setMessage(undefined);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setMessage("Your session expired. Please sign in again.");
      setSaving(false);
      return;
    }
    const submittedAt = status === "submitted" ? new Date().toISOString() : null;
    const { error } = await supabase.from("match_submissions").upsert({
      id: submissionId,
      event_id: eventId,
      match_id: matchId,
      team_id: teamId,
      scout_user_id: user.id,
      assignment_id: assignmentId,
      form_version: formVersion,
      payload,
      status,
      revision,
      submitted_at: submittedAt,
    }, { onConflict: "id" });
    if (error) {
      setMessage("Couldn’t save your entry. Check your connection and try again.");
      setSaving(false);
      return;
    }
    if (status === "submitted") {
      const { error: assignmentError } = await supabase.from("scouting_assignments").update({ status: "complete", completed_at: submittedAt }).eq("id", assignmentId);
      setIsLocked(true);
      setMessage(assignmentError ? "Submission received. Refresh your assignments if its status has not updated." : "Submission received — thank you.");
    } else {
      setRevision((current) => current + 1);
      setMessage("Draft saved.");
    }
    setSaving(false);
  }

  return <>
    <div className="card">
      <div className="card-head"><div><h2>{form.title}</h2><div className="muted">Version {formVersion} · fast entry is the priority</div></div><span className="tag live">{isLocked ? "SUBMITTED" : "LIVE FORM"}</span></div>
      {["auto", "teleop", "endgame", "notes"].map((section) => {
        const fields = form.fields.filter((field) => field.section === section);
        if (!fields.length) return null;
        return <div className="section" key={section}><div className="section-title">{section === "auto" ? "Autonomous" : section === "teleop" ? "Teleop" : section === "endgame" ? "Endgame" : "Scout notes"}</div><div className="form-grid">{fields.map((field) => <div className="field" key={field.id}><label>{field.label}{field.required && <span className="text-stuypulse-redHover"> *</span>}</label>{field.type === "counter" ? <div className="counter"><button type="button" disabled={isLocked} onClick={() => set(field.id, Math.max(0, Number(payload[field.id] ?? 0) - 1))}>−</button><output>{Number(payload[field.id] ?? 0)}</output><button type="button" disabled={isLocked} onClick={() => set(field.id, Number(payload[field.id] ?? 0) + 1)}>+</button></div> : field.type === "boolean" ? <AppSelect ariaLabel={field.label} disabled={isLocked} value={String(payload[field.id] ?? "")} onValueChange={(value) => set(field.id, value === "true")} options={[{value:"",label:"Select…"},{value:"true",label:"Yes"},{value:"false",label:"No"}]}/> : field.type === "select" ? <AppSelect ariaLabel={field.label} disabled={isLocked} value={String(payload[field.id] ?? "")} onValueChange={(value) => set(field.id, value)} options={[{value:"",label:"Select…"}, ...(field.options ?? []).map((option) => ({value:option,label:option}))]}/> : field.type === "rating" ? <AppSelect ariaLabel={field.label} disabled={isLocked} value={String(payload[field.id] ?? "")} onValueChange={(value) => set(field.id, value ? Number(value) : "")} options={[{value:"",label:"Not rated"}, ...[1, 2, 3, 4, 5].map((number) => ({value:String(number),label:`${number} / 5`}))]}/> : <textarea disabled={isLocked} value={String(payload[field.id] ?? "")} onChange={(event) => set(field.id, event.target.value)} placeholder="Useful observations only…" />}</div>)}</div></div>;
      })}
    </div>
    <div className="form-actions"><button className="button secondary" onClick={() => submit("draft")} disabled={saving || isLocked || !submissionId}>Save draft</button><button className="button" onClick={() => submit("submitted")} disabled={saving || isLocked || !submissionId}>{saving ? "Saving…" : isLocked ? "Submitted" : "Submit match"}</button></div>
    {message && <p aria-live="polite" className={message.includes("received") || message.includes("saved") ? "trend" : "error"}>{message}</p>}
  </>;
}
