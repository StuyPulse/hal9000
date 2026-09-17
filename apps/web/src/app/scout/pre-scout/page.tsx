import { AppShell, PageHeader } from "@/components/app-shell";
import { createAdminClient } from "@/lib/supabase/admin";
import { getViewerContext, viewerCanManage } from "@/lib/viewer-context";
import { notFound } from "next/navigation";
import { ManualScouting } from "../manual/manual-scouting";

export default async function PreScoutPage({ searchParams }: { searchParams: Promise<{ edit?: string; returnTo?: string }> }) {
  const { edit: editingEntryId, returnTo: requestedReturnTo } = await searchParams;
  const viewer = await getViewerContext();
  // Chezy is intentionally available for prescouting before it becomes the
  // active event. Regular scouts cannot normally read upcoming events, so this
  // server-only query is still explicitly restricted to their organization.
  const database = createAdminClient();
  const { data: event } = viewer?.organizationId ? await database
    .from("events")
    .select("id,name,event_key")
    .eq("event_key", "2026cc")
    .eq("organization_id", viewer.organizationId)
    .maybeSingle()
    : { data: null };
  const { data: eventTeams } = event
    ? await database.from("event_teams").select("team_id,teams(team_number,name)").eq("event_id", event.id)
    : { data: [] };
  const teams = (eventTeams ?? []).map((row: any) => ({ id: row.team_id, number: row.teams?.team_number, name: row.teams?.name }));
  const { data: editingEntry } = event && viewer && editingEntryId ? await database
    .from("scouting_entries")
    .select("id,organization_id,event_id,team_id,scout_user_id,entry_type,payload")
    .eq("id", editingEntryId)
    .maybeSingle() : { data: null };
  if (editingEntryId && (!editingEntry || !event || editingEntry.organization_id !== viewer?.organizationId || editingEntry.event_id !== event.id || editingEntry.entry_type !== "pre_scout" || (editingEntry.scout_user_id !== viewer?.userId && !viewerCanManage(viewer)))) notFound();
  const returnTo = requestedReturnTo?.startsWith("/") && !requestedReturnTo.startsWith("//") ? requestedReturnTo : undefined;
  return <AppShell active="Pre scouting"><PageHeader eyebrow={event?.name ?? "Chezy Champs unavailable"} title="Pre scouting."/>{event ? <ManualScouting eventId={event.id} teams={teams} type="pre_scout" editingEntryId={editingEntry?.id} initialTeamId={editingEntry?.team_id} initialPayload={editingEntry?.payload ?? {}} returnTo={returnTo}/> : <section className="card"><p className="muted">Chezy Champs must be imported before pre scouting can begin.</p></section>}</AppShell>;
}
