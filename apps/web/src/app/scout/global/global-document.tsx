"use client";

import { useActionState, useState } from "react";
import { saveGlobalDocument, type GlobalDocumentActionState } from "./actions";

const initialState: GlobalDocumentActionState = {};

function previewUrl(value: string) {
  try {
    const url = new URL(value);
    url.pathname = url.pathname.replace(/\/(edit|view|preview)\/?$/, "/preview");
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return value;
  }
}

export function GlobalDocument({ eventId, initialUrl, canEdit }: { eventId: string; initialUrl?: string | null; canEdit: boolean }) {
  const [url, setUrl] = useState(initialUrl ?? "");
  const [state, formAction, pending] = useActionState(saveGlobalDocument, initialState);
  const documentUrl = state.documentUrl ?? initialUrl ?? "";

  return <section className="card global-document"><div className="card-head"><div><h2>Event global scouting</h2><p className="muted">One shared Google document for this event.</p></div>{documentUrl && <a className="button secondary" href={documentUrl} target="_blank" rel="noreferrer">Open shared document ↗</a>}</div>{canEdit && <form action={formAction} className="global-document-editor"><input type="hidden" name="eventId" value={eventId}/><div className="field"><label htmlFor="global-document-url">Google document link</label><input id="global-document-url" name="documentUrl" type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://docs.google.com/document/d/.../edit"/></div><button className="button" disabled={pending}>{pending ? "Saving…" : "Save link"}</button></form>}{documentUrl ? <iframe className="global-document-frame" title="Event global scouting document" src={previewUrl(documentUrl)} /> : <p className="muted">An admin or strategist has not linked the event document yet.</p>}{(state.error || state.success) && <p aria-live="polite" className={state.error ? "error" : "trend"}>{state.error ?? state.success}</p>}</section>;
}
