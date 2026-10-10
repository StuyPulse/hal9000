import { getEventTeamRemaps } from "@/lib/event-team-remaps";
import { eventTeamNumber } from "@/lib/tba-team-identity";
import { AppShell, PageHeader } from "@/components/app-shell";
import { createAdminClient } from "@/lib/supabase/admin";
import { getViewerContext, viewerCanManage } from "@/lib/viewer-context";
import { notFound } from "next/navigation";
import { ManualScouting } from "../manual/manual-scouting";

export default async function PreScoutPage({ searchParams }: { searchParams: Promise<{ edit?: string; returnTo?: string }> }) {
  const { edit: editingEntryId, returnTo: requestedReturnTo } = await searchParams;
  const viewer = await getViewerContext();
  const event = viewer?.activeEvent ?? null;
  const database = createAdminClient();
  const { data: eventTeams } = event
    ? await database.from("event_teams").select("team_id,teams(team_number,name)").eq("event_id", event.id)
    : { data: [] };
  const remaps = await getEventTeamRemaps(event?.id);
  const teams = (eventTeams ?? []).map((row: any) => ({ id: row.team_id, number: row.teams?.team_number, displayNumber: eventTeamNumber(row.teams?.team_number, remaps), name: row.teams?.name }));
  const { data: submittedEntries } = event
    ? await database.from("scouting_entries").select("team_id").eq("event_id", event.id).eq("entry_type", "pre_scout").eq("status", "submitted")
    : { data: [] };
  const scoutedTeamIds = [...new Set((submittedEntries ?? []).map((entry: any) => entry.team_id))];
  const { data: editingEntry } = event && viewer && editingEntryId ? await database
    .from("scouting_entries")
    .select("id,organization_id,event_id,team_id,scout_user_id,entry_type,payload")
    .eq("id", editingEntryId)
    .maybeSingle() : { data: null };
  if (editingEntryId && (!editingEntry || !event || editingEntry.organization_id !== viewer?.organizationId || editingEntry.event_id !== event.id || editingEntry.entry_type !== "pre_scout" || (editingEntry.scout_user_id !== viewer?.userId && !viewerCanManage(viewer)))) notFound();
  const returnTo = requestedReturnTo?.startsWith("/") && !requestedReturnTo.startsWith("//") ? requestedReturnTo : undefined;
  return <AppShell active="Pre scouting"><PageHeader eyebrow={event?.name ?? "No active event"} title="Pre scouting."/>{event && viewer?.organizationId ? <ManualScouting eventId={event.id} organizationId={viewer.organizationId} scoutUserId={viewer.userId} teams={teams} type="pre_scout" markedTeamIds={scoutedTeamIds} editingEntryId={editingEntry?.id} initialTeamId={editingEntry?.team_id} initialPayload={editingEntry?.payload ?? {}} returnTo={returnTo}/> : <section className="card"><p className="muted">Set an active event before pre scouting can begin.</p></section>}</AppShell>;
}
