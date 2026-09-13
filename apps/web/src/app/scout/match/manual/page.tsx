import Link from "next/link";
import { AppShell, PageHeader } from "@/components/app-shell";
import { getActiveEvent } from "@/lib/active-event";
import { createClient } from "@/lib/supabase/server";
import { RebuiltMatchForm } from "../[matchId]/rebuilt-match-form";

const stageNames: Record<string, string> = {
  qualification: "Qualification",
  practice: "Practice",
  quarterfinal: "Quarterfinal",
  semifinal: "Semifinal",
  final: "Final",
  other: "Other / exception",
};

export default async function ManualMatchFormPage({ searchParams }: { searchParams: Promise<{ team?: string; stage?: string; match?: string }> }) {
  const { team: teamId, stage: requestedStage, match: label } = await searchParams;
  const event = await getActiveEvent();
  const supabase = await createClient();
  const stage = requestedStage && stageNames[requestedStage] ? requestedStage : "other";
  const { data: selectedEventTeam } = event && teamId ? await supabase.from("event_teams").select("team_id,teams(team_number,name)").eq("event_id", event.id).eq("team_id", teamId).maybeSingle() : { data: null };

  if (!event || !selectedEventTeam) return <AppShell active="Manual scouting">
    <PageHeader eyebrow={event?.name ?? "No active event"} title="Choose a manual report team." />
    <section className="card"><p className="muted">Choose a team from the active event before opening a manual match report.</p><div className="section"><Link className="button" href="/scout/match#manual">Back to manual report setup</Link></div></section>
  </AppShell>;

  const team = selectedEventTeam.teams as unknown as { team_number: number; name: string } | null;
  const { data: eventTeams } = await supabase.from("event_teams").select("team_id,teams(team_number)").eq("event_id", event.id);
  const otherTeams = (eventTeams ?? []).filter((row) => row.team_id !== selectedEventTeam.team_id).map((row: any) => ({ id: row.team_id, number: row.teams?.team_number ?? 0, alliance: "manual" as const }));

  return <AppShell active="Manual scouting">
    <PageHeader eyebrow={`${stageNames[stage]}${label ? ` · ${label}` : ""}`} title={`${team?.team_number} · ${team?.name}`} />
    <RebuiltMatchForm eventId={event.id} teamId={selectedEventTeam.team_id} alliance="manual" otherTeams={otherTeams} manualMatch={{ stage: stageNames[stage], label }} />
  </AppShell>;
}
