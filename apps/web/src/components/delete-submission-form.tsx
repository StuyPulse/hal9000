"use client";

import { useActionState } from "react";
import { Trash2 } from "lucide-react";
import { deleteScoutingEntry, type ActionState } from "@/lib/admin-actions";

const initial: ActionState = {};

export function DeleteSubmissionForm({ entryId, compact = false }: { entryId: string; compact?: boolean }) {
  const [state, action, pending] = useActionState(deleteScoutingEntry, initial);
  return (
    <form
      action={action}
      className={compact ? "submission-delete-form compact" : "submission-delete-form"}
      onSubmit={(event) => {
        if (!window.confirm("Delete this scouting submission? This cannot be undone. If it completed an assignment, that assignment will reopen.")) event.preventDefault();
      }}
    >
      <input type="hidden" name="entryId" value={entryId} />
      <button className="button danger" type="submit" disabled={pending} aria-label="Delete submission">
        <Trash2 size={15} aria-hidden="true" />
        <span>{pending ? "Deleting…" : "Delete"}</span>
      </button>
      {state.error && <p className="error" role="alert">{state.error}</p>}
      {state.success && <p className="trend" role="status">{state.success}</p>}
    </form>
  );
}
