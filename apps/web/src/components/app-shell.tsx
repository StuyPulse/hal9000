import { getViewerContext, viewerCanManage } from "@/lib/viewer-context";
import Link from "next/link";
import { Sidebar } from "./sidebar";
import { LiveEventSync } from "./live-event-sync";
import { BackButton } from "./back-button";

export async function AppShell({ children, active = "Dashboard" }: { children: React.ReactNode; active?: string }) {
  const viewer = await getViewerContext();
  const activeEvent = viewer?.activeEvent;
  const canManage = viewerCanManage(viewer);
  const eventHref = activeEvent ? `/events/${activeEvent.event_key}` : "/events";
  return <div className="shell"><LiveEventSync active={Boolean(activeEvent)}/><Sidebar active={active} canManage={canManage} eventHref={eventHref}/><main className="main">{children}</main></div>;
}

export async function PageHeader({ eyebrow, title, children }: { eyebrow: string; title: string; children?: React.ReactNode }) {
  const viewer = await getViewerContext();
  const activeEvent = viewer?.activeEvent;
  const eventChip = <><span className={activeEvent ? "online" : "offline"}/><span>Active event:</span><strong>{activeEvent?.name ?? "None selected"}</strong></>;
  return <div className="topbar"><div className="topbar-title"><BackButton/><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1></div></div><div className="topbar-actions">{children}{viewerCanManage(viewer) ? <Link className="event-chip" href="/events" aria-label="Choose the active event">{eventChip}</Link> : <div className="event-chip">{eventChip}</div>}</div></div>;
}
