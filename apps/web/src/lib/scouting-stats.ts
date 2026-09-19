import { manualMatchIsCompetitive } from "@/lib/match-label";

export type ScoutStats = {
  /** Number of submitted scout reports included in the calculation. */
  entries: number;
  /** Number of matches represented after reports are combined by match. */
  matches: number;
  autoMaxScored: number; autoMaxFerried: number; autoAvgScored: number; autoAvgFerried: number;
  teleopMaxScored: number; teleopMaxFerried: number; teleopAvgScored: number; teleopAvgFerried: number;
  avgFouls: number; defense: number; brokenPercent: number; peakFuel: number; totalFuel: number; autoFuel: number; teleopFuel: number; autoPeakFuel: number; teleopPeakFuel: number;
};
export const SCOUT_STAT_LABELS: Record<keyof Omit<ScoutStats, "entries" | "matches">, string> = {
  peakFuel: "Peak fuel", totalFuel: "Total fuel", autoFuel: "Auto fuel", teleopFuel: "Teleop fuel", autoPeakFuel: "Auto peak fuel", teleopPeakFuel: "Teleop peak fuel", autoMaxScored: "Auto max scored", autoMaxFerried: "Auto max ferried", autoAvgScored: "Auto avg scored", autoAvgFerried: "Auto avg ferried", teleopMaxScored: "Teleop max scored", teleopMaxFerried: "Teleop max ferried", teleopAvgScored: "Teleop avg scored", teleopAvgFerried: "Teleop avg ferried", avgFouls: "Avg fouls", defense: "Defense", brokenPercent: "% broken",
};
const number = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const average = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
const maximum = (values: number[]) => values.length ? Math.max(...values) : 0;

type MatchValues = {
  autoScored: number; autoFerried: number; teleopScored: number; teleopFerried: number;
  autoFuel: number; teleopFuel: number; fouls: number; defense: number; broken: number;
};

const reportValues = (entry: any): MatchValues => {
  const autoScored = number(entry.payload?.auto?.shoot);
  const autoFerried = number(entry.payload?.auto?.ferry);
  const teleopScored = number(entry.payload?.teleop?.shoot ?? entry.payload?.teleop_fuel);
  const teleopFerried = number(entry.payload?.teleop?.ferry);
  return {
    autoScored,
    autoFerried,
    teleopScored,
    teleopFerried,
    autoFuel: autoScored + autoFerried || number(entry.payload?.auto_fuel),
    teleopFuel: teleopScored + teleopFerried || number(entry.payload?.teleop_fuel),
    fouls: number(entry.payload?.fouls),
    defense: number(entry.payload?.defense_level),
    broken: entry.payload?.robot_broke ? 1 : 0,
  };
};

/**
 * Reports are observations of a match, not separate matches. Combine a team's
 * reports for the same scheduled or manual match before calculating team stats,
 * so a heavily scouted match cannot outweigh another match.
 */
function matchKey(entry: any, index: number) {
  const match = Array.isArray(entry?.matches) ? entry.matches[0] : entry?.matches;
  const scheduledMatchId = entry?.match_id ?? match?.id;
  if (typeof scheduledMatchId === "string" && scheduledMatchId) return `scheduled:${scheduledMatchId}`;

  const manual = entry?.payload?.manual_match;
  const stage = typeof manual?.stage === "string" ? manual.stage.trim().toLowerCase() : "";
  const label = typeof manual?.label === "string" ? manual.label.trim().toLowerCase() : "";
  if (stage && label) return `manual:${stage}:${label}`;

  // A legacy/unlabelled manual report has no reliable shared match identity.
  return `report:${typeof entry?.id === "string" ? entry.id : index}`;
}

export function averageReportsByMatch(entries: any[]): MatchValues[] {
  const reportsByMatch = new Map<string, any[]>();
  entries.forEach((entry, index) => {
    const key = matchKey(entry, index);
    reportsByMatch.set(key, [...(reportsByMatch.get(key) ?? []), entry]);
  });

  return [...reportsByMatch.values()].map((reports) => {
    const values = reports.map(reportValues);
    return {
      autoScored: average(values.map((value) => value.autoScored)),
      autoFerried: average(values.map((value) => value.autoFerried)),
      teleopScored: average(values.map((value) => value.teleopScored)),
      teleopFerried: average(values.map((value) => value.teleopFerried)),
      autoFuel: average(values.map((value) => value.autoFuel)),
      teleopFuel: average(values.map((value) => value.teleopFuel)),
      fouls: average(values.map((value) => value.fouls)),
      defense: average(values.map((value) => value.defense)),
      // A robot was broken in the match if any observer reported it.
      broken: maximum(values.map((value) => value.broken)),
    };
  });
}

/** Only official qualification/playoff reports and manually-labelled equivalents affect team metrics. */
export function isCompetitiveMatchEntry(entry: any) {
  const match = Array.isArray(entry?.matches) ? entry.matches[0] : entry?.matches;
  if (match?.match_type) return match.match_type === "qualification" || match.match_type === "playoff";
  const manualMatch = entry?.payload?.manual_match;
  return manualMatchIsCompetitive(manualMatch && typeof manualMatch === "object" && !Array.isArray(manualMatch) ? manualMatch : {});
}

export function competitiveMatchEntries(entries: any[]) {
  return entries.filter(isCompetitiveMatchEntry);
}

/** Practice reports are useful for early-event strategy before a team has played a qualification match. */
export function practiceMatchEntries(entries: any[]) {
  return entries.filter((entry) => {
    const match = Array.isArray(entry?.matches) ? entry.matches[0] : entry?.matches;
    if (match?.match_type) return match.match_type === "practice";
    const manualMatch = entry?.payload?.manual_match;
    return manualMatch?.stage === "practice";
  });
}

export function calculateScoutStats(entries: any[]): ScoutStats {
  const matches = averageReportsByMatch(entries);
  const autoScored = matches.map((match) => match.autoScored);
  const autoFerried = matches.map((match) => match.autoFerried);
  const teleopScored = matches.map((match) => match.teleopScored);
  const teleopFerried = matches.map((match) => match.teleopFerried);
  const autoFuel = matches.map((match) => match.autoFuel);
  const teleopFuel = matches.map((match) => match.teleopFuel);
  return { entries: entries.length, matches: matches.length, autoMaxScored: maximum(autoScored), autoMaxFerried: maximum(autoFerried), autoAvgScored: average(autoScored), autoAvgFerried: average(autoFerried), teleopMaxScored: maximum(teleopScored), teleopMaxFerried: maximum(teleopFerried), teleopAvgScored: average(teleopScored), teleopAvgFerried: average(teleopFerried), avgFouls: average(matches.map((match) => match.fouls)), defense: average(matches.map((match) => match.defense)), brokenPercent: matches.length ? matches.filter((match) => match.broken).length / matches.length * 100 : 0, peakFuel: maximum(autoFuel.map((value, index) => value + teleopFuel[index])), totalFuel: average(autoFuel) + average(teleopFuel), autoFuel: average(autoFuel), teleopFuel: average(teleopFuel), autoPeakFuel: maximum(autoFuel), teleopPeakFuel: maximum(teleopFuel) };
}
export const formatStat = (value: number) => value.toFixed(2);
