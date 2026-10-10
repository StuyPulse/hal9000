"use client";

import { useActionState } from "react";
import { addEventTeam } from "@/lib/admin/events-matches";
import { type ActionState } from "@/lib/admin/shared";

export function AddEventTeamForm({ eventId }: { eventId: string }) {
  const [state, action, pending] = useActionState(addEventTeam, {} as ActionState);
  return <>
    <form action={action} className="manual-team-form">
      <input type="hidden" name="eventId" value={eventId}/>
      <label><span>Team #</span><input name="teamNumber" type="text" pattern="[0-9]+[A-Za-z]*" required placeholder="694" disabled={pending}/></label>
      <label><span>Name (optional)</span><input name="name" maxLength={160} placeholder="Stuy Fission" disabled={pending}/></label>
      <button className="button secondary" disabled={pending}>{pending ? "Adding…" : "Add team"}</button>
    </form>
    {state.error && <p className="error" role="alert">{state.error}</p>}
    {state.success && <p className="trend" role="status">{state.success}</p>}
  </>;
}
