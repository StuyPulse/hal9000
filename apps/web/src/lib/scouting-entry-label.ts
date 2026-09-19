import { manualMatchLabel, matchLabel } from "@/lib/match-label";

type MatchDetails = Parameters<typeof matchLabel>[0];

type EntryForLabel = {
  entry_type?: string | null;
  matches?: MatchDetails | null;
  payload?: Record<string, unknown> | null;
};

function readManualMatch(payload: Record<string, unknown> | null | undefined) {
  const candidate = payload?.manual_match;
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;
  const manualMatch = candidate as Record<string, unknown>;
  const stage = typeof manualMatch.stage === "string" ? manualMatch.stage.trim() : "";
  const label = typeof manualMatch.label === "string" ? manualMatch.label.trim() : "";
  return { stage, label };
}

export function scoutingEntryLabel(entry: EntryForLabel) {
  if (entry.entry_type === "match") {
    if (entry.matches) return matchLabel(entry.matches);
    const manualMatch = readManualMatch(entry.payload);
    return manualMatchLabel(manualMatch ?? {});
  }
  if (entry.entry_type === "pit") return "Pit scouting";
  if (entry.entry_type === "pre_scout") return "Pre scouting";
  return "Scouting report";
}

export function scoutingEntryTypeLabel(entryType: string | null | undefined) {
  if (entryType === "match") return "Match scouting";
  if (entryType === "pit") return "Pit scouting";
  if (entryType === "pre_scout") return "Pre scouting";
  return "Scouting";
}
