import { AppShell, PageHeader } from "@/components/app-shell";
import { getActiveEvent } from "@/lib/active-event";
import { getViewerContext } from "@/lib/viewer-context";
import { createClient } from "@/lib/supabase/server";
import { GlobalDocument } from "./global-document";

export default async function GlobalPage() {
  const [event, viewer, supabase] = await Promise.all([getActiveEvent(), getViewerContext(), createClient()]);
  const { data: document } = event ? await (supabase as any).from("event_global_documents").select("document_url").eq("event_id", event.id).maybeSingle() : { data: null };
  const canEdit = viewer?.role === "admin" || viewer?.role === "strategist" || viewer?.role === "developer";
  return <AppShell active="Manual scouting"><PageHeader eyebrow={event?.name ?? "No active event"} title="Global scouting."/>{event && viewer?.organizationId ? <GlobalDocument eventId={event.id} initialUrl={document?.document_url} canEdit={canEdit}/> : <section className="card"><p className="muted">Set an active event first.</p></section>}</AppShell>;
}
