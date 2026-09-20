import { AppShell, PageHeader } from "@/components/app-shell";
import { createClient } from "@/lib/supabase/server";
import { getViewerContext } from "@/lib/viewer-context";
import { LeaderboardBoard, type LeaderboardEntry } from "./leaderboard-board";

type ScoutingEntryRow = {
  id: string;
  entry_type: "match" | "pit" | "pre_scout";
  scout_user_id: string;
  team_id: string | null;
  match_id: string | null;
  created_at: string;
  submitted_at: string | null;
  payload: Record<string, unknown> | null;
  matches: { match_type: string | null } | { match_type: string | null }[] | null;
  author: { display_name: string | null } | { display_name: string | null }[] | null;
};

async function getSubmittedEntries(eventId: string) {
  const supabase = await createClient();
  const entries: ScoutingEntryRow[] = [];
  const pageSize = 1000;

  for (let start = 0; ; start += pageSize) {
    const { data, error } = await (supabase as any)
      .from("scouting_entries")
      .select("id,entry_type,scout_user_id,team_id,match_id,created_at,submitted_at,payload,matches(match_type),author:profiles!scouting_entries_scout_user_id_fkey(display_name)")
      .eq("event_id", eventId)
      .eq("status", "submitted")
      .order("submitted_at", { ascending: false })
      .range(start, start + pageSize - 1);

    if (error) throw error;
    const page = (data ?? []) as ScoutingEntryRow[];
    entries.push(...page);
    if (page.length < pageSize) return entries;
  }
}

function firstRelation<T>(relation: T | T[] | null) {
  return Array.isArray(relation) ? relation[0] ?? null : relation;
}

export default async function LeaderboardPage() {
  const viewer = await getViewerContext();
  const event = viewer?.activeEvent;
  const entries = event ? await getSubmittedEntries(event.id) : [];
  const leaderboardEntries: LeaderboardEntry[] = entries.map((entry) => {
    const match = firstRelation(entry.matches);
    const author = firstRelation(entry.author);
    const manualMatch = entry.payload?.manual_match;
    const manualStage = typeof manualMatch === "object" && manualMatch && "stage" in manualMatch && typeof manualMatch.stage === "string"
      ? manualMatch.stage
      : null;

    return {
      id: entry.id,
      type: entry.entry_type,
      scoutUserId: entry.scout_user_id,
      scoutName: author?.display_name ?? "Unknown scout",
      submittedAt: entry.submitted_at ?? entry.created_at,
      teamId: entry.team_id,
      matchId: entry.match_id,
      matchType: match?.match_type ?? null,
      manualStage,
      manualMatchKey: typeof manualMatch === "object" && manualMatch && "stage" in manualMatch && "label" in manualMatch
        ? `${typeof manualMatch.stage === "string" ? manualMatch.stage : ""}|${typeof manualMatch.label === "string" ? manualMatch.label : ""}`
        : null,
    };
  });

  return <AppShell active="Leaderboard">
    <PageHeader eyebrow={event?.name ?? "Scouting"} title="Leaderboard." />
    {event ? <LeaderboardBoard entries={leaderboardEntries} eventName={event.name} /> : <section className="card">
      <h2>No active event</h2>
      <p className="muted" style={{ marginTop: 8 }}>Choose an active event to view scouting contributions.</p>
    </section>}
  </AppShell>;
}
