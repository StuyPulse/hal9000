import { getEventTeamRemaps } from "@/lib/event-team-remaps";
import { eventTeamNumber } from "@/lib/tba-team-identity";
import { AppShell, PageHeader } from "@/components/app-shell";
import { QrHandoff } from "@/components/qr-handoff";
import { createClient } from "@/lib/supabase/server";
import { getViewerContext } from "@/lib/viewer-context";

export default async function QrHandoffPage() {
  const [viewer, supabase] = await Promise.all([getViewerContext(), createClient()]);
  const eventId = viewer?.activeEvent?.id ?? null;
  const { data } = eventId ? await supabase.from("event_teams").select("team_id,teams(team_number,name)").eq("event_id", eventId) : { data: [] };
  const remaps = await getEventTeamRemaps(eventId);
  const teams = (data ?? []).map((row: any) => ({ id: row.team_id, number: row.teams?.team_number, displayNumber: eventTeamNumber(row.teams?.team_number, remaps), name: row.teams?.name }));
  return <AppShell active="QR handoff"><PageHeader eyebrow={viewer?.activeEvent?.name ?? "No active event"} title="QR handoff."/><QrHandoff organizationId={viewer?.organizationId ?? null} eventId={eventId} role={viewer?.role ?? null} teams={teams}/></AppShell>;
}
