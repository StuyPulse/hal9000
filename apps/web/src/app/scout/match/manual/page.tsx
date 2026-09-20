import Link from "next/link";
import { AppShell, PageHeader } from "@/components/app-shell";
import { getActiveEvent } from "@/lib/active-event";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getViewerContext, viewerCanManage } from "@/lib/viewer-context";
import { notFound } from "next/navigation";
import { RebuiltMatchForm } from "../[matchId]/rebuilt-match-form";
import { manualMatchLabel } from "@/lib/match-label";

const stageNames: Record<string, string> = {
  qualification: "Qualification",
  practice: "Practice",
  quarterfinal: "Quarterfinal",
  semifinal: "Semifinal",
  final: "Final",
  other: "Other / exception",
};

export default async function ManualMatchFormPage({ searchParams }: { searchParams: Promise<{ team?: string; stage?: string; match?: string; alliance?: string; edit?: string; returnTo?: string }> }) {
  const { team: requestedTeamId, stage: requestedStage, match: requestedLabel, alliance: requestedAlliance, edit: editingEntryId, returnTo: requestedReturnTo } = await searchParams;
  const event = await getActiveEvent();
  const [supabase, viewer] = await Promise.all([createClient(), getViewerContext()]);
  const database: any = createAdminClient();
  const { data: editingEntry } = event && viewer && editingEntryId ? await database
    .from("scouting_entries")
    .select("id,organization_id,event_id,team_id,match_id,scout_user_id,entry_type,payload")
    .eq("id", editingEntryId)
    .maybeSingle() : { data: null };
  const editingManualMatch = editingEntry?.payload?.manual_match && typeof editingEntry.payload.manual_match === "object" && !Array.isArray(editingEntry.payload.manual_match);
  if (editingEntryId && (!editingEntry || !event || editingEntry.organization_id !== viewer?.organizationId || editingEntry.event_id !== event.id || editingEntry.entry_type !== "match" || !editingManualMatch || (editingEntry.scout_user_id !== viewer?.userId && !viewerCanManage(viewer)))) notFound();

  const manualMetadata = editingEntry?.payload?.manual_match && typeof editingEntry.payload.manual_match === "object" && !Array.isArray(editingEntry.payload.manual_match) ? editingEntry.payload.manual_match as Record<string, unknown> : {};
  const stage = editingEntry
    ? (typeof manualMetadata.stage === "string" && manualMetadata.stage.trim() ? manualMetadata.stage : "Manual match")
    : (requestedStage && stageNames[requestedStage] ? stageNames[requestedStage] : stageNames.other);
  const label = editingEntry
    ? (typeof manualMetadata.label === "string" && manualMetadata.label.trim() ? manualMetadata.label : undefined)
    : requestedLabel;
  const alliance = editingEntry
    ? (manualMetadata.alliance === "red" || manualMetadata.alliance === "blue" ? manualMetadata.alliance : "red")
    : (requestedAlliance === "red" || requestedAlliance === "blue" ? requestedAlliance : null);
  const teamId = requestedTeamId ?? editingEntry?.team_id;
  const { data: selectedEventTeam } = event && teamId ? await supabase.from("event_teams").select("team_id,teams(team_number,name)").eq("event_id", event.id).eq("team_id", teamId).maybeSingle() : { data: null };

  if (!event || !selectedEventTeam || !alliance) return <AppShell active="Manual scouting">
    <PageHeader eyebrow={event?.name ?? "No active event"} title="Choose a manual report setup." />
    <section className="card"><p className="muted">Choose a team and alliance from the active event before opening a manual match report.</p><div className="section"><Link className="button" href="/scout/match#manual">Back to manual report setup</Link></div></section>
  </AppShell>;

  const team = selectedEventTeam.teams as unknown as { team_number: number; name: string } | null;
  const { data: eventTeams } = await supabase.from("event_teams").select("team_id,teams(team_number,name)").eq("event_id", event.id);
  const numericLabel = label?.trim() ?? "";
  const normalizedStage = stage.trim().toLowerCase();
  const matchType = normalizedStage === "qualification" || normalizedStage === "practice"
    ? normalizedStage
    : ["quarterfinal", "semifinal", "final"].includes(normalizedStage) ? "playoff" : null;
  const { data: scheduledCandidates } = matchType && /^\d+$/.test(numericLabel)
    ? await supabase.from("matches").select("id,red_teams,blue_teams").eq("event_id", event.id).eq("match_type", matchType).eq("match_number", Number(numericLabel))
    : { data: [] };
  // The fallback form should become a scheduled report only when the entered
  // details identify one actual slot. An exception stays manual rather than
  // risking a bad link to a similarly numbered playoff match.
  const matchingCandidates = (scheduledCandidates ?? []).filter((match) => [...match.red_teams, ...match.blue_teams].includes(selectedEventTeam.team_id));
  const scheduledMatch = matchingCandidates.length === 1 ? matchingCandidates[0] : null;
  const opposingTeamIds = scheduledMatch
    ? scheduledMatch.red_teams.includes(selectedEventTeam.team_id) ? scheduledMatch.blue_teams : scheduledMatch.red_teams
    : null;
  const otherTeams = (opposingTeamIds ?? (eventTeams ?? []).filter((row) => row.team_id !== selectedEventTeam.team_id).map((row) => row.team_id))
    .map((teamId: string) => {
      const eventTeam = (eventTeams ?? []).find((row) => row.team_id === teamId);
      return { id: teamId, number: (eventTeam as any)?.teams?.team_number ?? 0, alliance: "manual" as const };
    });

  const returnTo = requestedReturnTo?.startsWith("/") && !requestedReturnTo.startsWith("//") ? requestedReturnTo : undefined;
  if (!viewer?.organizationId) notFound();
  return <AppShell active="Manual scouting">
    <PageHeader eyebrow={`${manualMatchLabel({ stage, label })} · ${alliance} alliance`} title={`${team?.team_number} · ${team?.name}`} />
    <RebuiltMatchForm eventId={event.id} organizationId={viewer.organizationId} scoutUserId={viewer.userId} matchId={scheduledMatch?.id} teamId={selectedEventTeam.team_id} alliance={alliance} otherTeams={otherTeams} manualMatch={{ stage, label, alliance }} manualTeams={(eventTeams ?? []).map((row: any) => ({ id: row.team_id, number: row.teams?.team_number ?? 0, name: row.teams?.name ?? "Unknown team" })).filter((team) => team.number > 0)} editingEntryId={editingEntry?.id} initialPayload={editingEntry?.payload ?? {}} returnTo={returnTo}/>
  </AppShell>;
}
