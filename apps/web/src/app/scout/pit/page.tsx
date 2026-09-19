import { AppShell, PageHeader } from "@/components/app-shell";
import { getActiveEvent } from "@/lib/active-event";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getViewerContext } from "@/lib/viewer-context";
import { notFound } from "next/navigation";
import { PitScoutingTabs } from "./pit-scouting-tabs";

export default async function PitPage({ searchParams }: { searchParams: Promise<{ edit?: string; returnTo?: string }> }) {
  const { edit: editingEntryId, returnTo: requestedReturnTo } = await searchParams;
  const event = await getActiveEvent();
  const [supabase, viewer] = await Promise.all([createClient(), getViewerContext()]);
  const [{ data: eventTeams }, { data: photos }, { data: pitEntries }] = event ? await Promise.all([
    supabase.from("event_teams").select("team_id,teams(team_number,name)").eq("event_id", event.id),
    supabase.from("pit_photos").select("team_id").eq("event_id", event.id),
    supabase.from("scouting_entries").select("team_id").eq("event_id", event.id).eq("entry_type", "pit").eq("status", "submitted"),
  ]) : [{ data: [] }, { data: [] }, { data: [] }];
  const teams = (eventTeams ?? []).map((row: any) => ({ id: row.team_id, number: row.teams?.team_number, name: row.teams?.name })).sort((left, right) => left.number - right.number);
  const photographedTeamIds = new Set((photos ?? []).map((photo: any) => photo.team_id));
  const scoutedTeamIds = [...new Set((pitEntries ?? []).map((entry: any) => entry.team_id))];
  const missing = teams.filter((team) => !photographedTeamIds.has(team.id));
  const photographed = teams.length - missing.length;
  const database: any = createAdminClient();
  const { data: editingEntry } = event && viewer && editingEntryId ? await database
    .from("scouting_entries")
    .select("id,organization_id,event_id,team_id,scout_user_id,entry_type,payload")
    .eq("id", editingEntryId)
    .maybeSingle() : { data: null };
  if (editingEntryId && (!editingEntry || !event || editingEntry.organization_id !== viewer?.organizationId || editingEntry.event_id !== event.id || editingEntry.entry_type !== "pit")) notFound();
  const returnTo = requestedReturnTo?.startsWith("/") && !requestedReturnTo.startsWith("//") ? requestedReturnTo : undefined;

  return <AppShell active="Pit scouting"><PageHeader eyebrow={event?.name ?? "No active event"} title="Pit scouting."/>{event && viewer?.organizationId ? <PitScoutingTabs eventId={event.id} organizationId={viewer.organizationId} scoutUserId={viewer.userId} teams={teams} missing={missing} photographed={photographed} scoutedTeamIds={scoutedTeamIds} editingEntryId={editingEntry?.id} initialTeamId={editingEntry?.team_id} initialPayload={editingEntry?.payload ?? {}} returnTo={returnTo}/> : <section className="card"><p className="muted">Set an active event first.</p></section>}</AppShell>;
}
