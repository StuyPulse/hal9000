import Link from "next/link";
import { AppShell, PageHeader } from "@/components/app-shell";
import { createClient } from "@/lib/supabase/server";
import { getViewerContext, viewerCanManage } from "@/lib/viewer-context";
import { DeleteEventForm, EventCreateForm, SetActiveEventForm, TbaImportForm } from "@/components/admin-forms";
import { LocalDateTime } from "@/components/local-date-time";
import { redirect } from "next/navigation";

export default async function EventsPage() {
  const [viewer, supabase] = await Promise.all([getViewerContext(), createClient()]);
  if (!viewerCanManage(viewer)) redirect("/dashboard");
  const { data: events } = await supabase.from("events").select("id,name,event_key,starts_at,ends_at,status,is_manual,tba_last_synced_at").order("starts_at", { ascending: false });
  return <AppShell active="Events"><PageHeader eyebrow="Administration" title="Events & imports."/>
    <section id="import-tba-event" className="card" style={{ marginBottom: 18 }}><div className="card-head"><div><h2>Import from TBA</h2><p className="muted" style={{ margin: "6px 0 0" }}>Paste an event key to add or refresh its teams and schedule, then mark it active.</p></div></div><div style={{ maxWidth: 540 }}><TbaImportForm/></div></section>
    <EventCreateForm/>
    <section id="event-list" className="card"><div className="card-head"><h2>Events</h2></div>{events?.length ? events.map((event) => <div id={`event-${event.event_key}`} className="list-row" key={event.id}><div><strong>{event.name} {event.status === "active" && <span className="tag live">ACTIVE</span>} {event.is_manual && <span className="tag pending">MANUAL</span>}</strong><div className="muted">{event.is_manual ? "Managed locally" : event.event_key} · {event.starts_at ? <LocalDateTime value={event.starts_at} format="date"/> : "Dates pending"}{!event.is_manual && (event.tba_last_synced_at ? <> · Synced <LocalDateTime value={event.tba_last_synced_at}/></> : " · Not yet synced")}</div></div><div className="row-actions"><Link className="button secondary" href={`/events/${event.event_key}/matches`}>Open event</Link><SetActiveEventForm eventId={event.id} active={event.status === "active"}/><DeleteEventForm eventId={event.id} eventName={event.name}/></div></div>) : <p className="muted">No events yet. Import an event from TBA or create one manually.</p>}</section>
  </AppShell>;
}
