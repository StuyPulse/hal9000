"use client";

import { useActionState } from "react";
import { addAuthorizedEmail } from "@/app/admin/email-access/actions";
import type { ActionState } from "@/lib/admin/shared";

export function EmailAccessForm() {
  const [state, action, pending] = useActionState(addAuthorizedEmail, {} as ActionState);
  return <form action={action} className="card admin-stack">
    <div><h2>Allow an external email</h2><p className="muted">StuyPulse addresses already have access. Add an exact email below to allow someone else to sign in.</p></div>
    <div className="field"><label htmlFor="authorized-email">Email address</label><input id="authorized-email" name="email" type="email" autoComplete="email" maxLength={254} placeholder="teammate@example.com" required disabled={pending}/></div>
    <div><button className="button" disabled={pending}>{pending ? "Adding…" : "Add email"}</button></div>
    <p className="muted">This does not send an invitation or grant admin privileges. New accounts start as Scouts.</p>
    {state.error && <p role="alert" className="error-text">{state.error}</p>}
    {state.success && <p role="status">{state.success}</p>}
  </form>;
}
