import { getViewerContext, viewerCanManage } from "@/lib/viewer-context";
import Link from "next/link";
import { Sidebar } from "./sidebar";
import { LiveEventSync } from "./live-event-sync";
import { BackButton } from "./back-button";
import { GlobalSearch } from "./global-search";
import { getNavigationSearchData } from "@/lib/navigation-data";

export async function AppShell({ children, active = "Dashboard" }: { children: React.ReactNode; active?: string }) {
  const viewer = await getViewerContext();
  const activeEvent = viewer?.activeEvent;
  const canManage = viewerCanManage(viewer);
  const eventHref = activeEvent ? `/events/${activeEvent.event_key}` : "/events";
  return <div className="shell"><LiveEventSync active={Boolean(activeEvent)}/><Sidebar active={active} canManage={canManage} eventHref={eventHref}/><main className="main">{children}</main></div>;
}

export async function PageHeader({ eyebrow, title, children }: { eyebrow?: string; title: string; children?: React.ReactNode }) {
  const viewer = await getViewerContext();
  const activeEvent = viewer?.activeEvent;
  const { events: searchEvents, teams: searchTeams } = await getNavigationSearchData(viewer?.organizationId ?? null, activeEvent?.id ?? null);
  const visibleEyebrow = eyebrow && eyebrow !== activeEvent?.name ? eyebrow : null;
  const eventChip = <><span className={activeEvent ? "online" : "offline"}/><span>Active event:</span><strong>{activeEvent?.name ?? "None selected"}</strong></>;
  return <div className="topbar"><div className="topbar-title"><BackButton/><div>{visibleEyebrow && <div className="eyebrow">{visibleEyebrow}</div>}<h1>{title}</h1></div></div><div className="topbar-actions"><GlobalSearch eventKey={activeEvent?.event_key ?? null} teams={searchTeams} events={searchEvents}/>{children}{viewerCanManage(viewer) ? <Link className="event-chip" href="/events#event-list" aria-label="Choose the active event">{eventChip}</Link> : <div className="event-chip">{eventChip}</div>}</div></div>;
}
