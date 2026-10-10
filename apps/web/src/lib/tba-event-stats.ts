import { tbaTeamNumberResolver, type TbaTeamRemaps } from "./tba-team-identity";

export type TbaRanking = { team_key?: string; rank?: number; record?: { wins: number; losses: number; ties: number }; sort_orders?: unknown[] };
export type TbaSortInfo = { name: string };
type OfficialMatch = { red_teams?: string[] | null; blue_teams?: string[] | null; tba_score_breakdown?: Record<string, Record<string, unknown> | undefined> | null };

export const asNumber = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;

/** Reads one of TBA's ranking sort-order metrics by matching its display name. */
export function tbaMetric(ranking: TbaRanking | undefined, info: TbaSortInfo[], pattern: RegExp) {
  const index = info.findIndex((metric) => pattern.test(metric.name));
  return index >= 0 ? asNumber(ranking?.sort_orders?.[index]) : 0;
}

/** Most common climb result and success rate for a team, from official played-match breakdowns. */
export function officialClimb(matches: OfficialMatch[], teamId: string) {
  const auto: string[] = []; const endgame: string[] = [];
  for (const match of matches) {
    const side = match.red_teams?.includes(teamId) ? "red" : match.blue_teams?.includes(teamId) ? "blue" : null;
    if (!side) continue;
    const slot = (side === "red" ? match.red_teams : match.blue_teams)!.indexOf(teamId) + 1;
    const breakdown = match.tba_score_breakdown?.[side];
    if (!breakdown || !slot) continue;
    auto.push(String(breakdown[`autoTowerRobot${slot}`] ?? "None"));
    endgame.push(String(breakdown[`endGameTowerRobot${slot}`] ?? "None"));
  }
  const typical = (values: string[]) => {
    if (!values.length) return "—";
    const counts = new Map<string, number>();
    for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
    return [...counts.entries()].sort((left, right) => right[1] - left[1])[0][0];
  };
  const success = (values: string[]) => values.length ? values.filter((value) => value !== "None" && value !== "").length / values.length * 100 : 0;
  return { autoClimb: typical(auto), autoClimbRate: success(auto), endgameClimb: typical(endgame), endgameClimbRate: success(endgame) };
}

/** TBA rankings + OPRs for an event, fetched together. `apiError` is empty on success. */
export async function fetchTbaRankings(eventKey: string, remaps: TbaTeamRemaps = {}) {
  let rankings: TbaRanking[] = []; let sortInfo: TbaSortInfo[] = []; let oprs: Record<string, number> = {}; let apiError = "";
  if (!process.env.TBA_AUTH_KEY) return { rankings, sortInfo, oprs, apiError: "TBA_AUTH_KEY is unavailable to this deployment." };
  try {
    const headers = { "X-TBA-Auth-Key": process.env.TBA_AUTH_KEY };
    const base = `https://www.thebluealliance.com/api/v3/event/${eventKey}`;
    const [rankingsResponse, oprsResponse] = await Promise.all([fetch(`${base}/rankings`, { headers, next: { revalidate: 20 } }), fetch(`${base}/oprs`, { headers, next: { revalidate: 20 } })]);
    const [rankingPayload, oprPayload] = await Promise.all([rankingsResponse.json(), oprsResponse.json()]);
    if (rankingsResponse.ok) { rankings = rankingPayload?.rankings ?? []; sortInfo = rankingPayload?.sort_order_info ?? []; }
    else apiError = `TBA returned HTTP ${rankingsResponse.status}.`;
    if (oprsResponse.ok) oprs = oprPayload?.oprs ?? {};
    else apiError ||= `TBA returned HTTP ${oprsResponse.status} for OPRs.`;
    ({ rankings, oprs } = normalizeTbaTeamStats(rankings, oprs, remaps));
  } catch { rankings = []; oprs = {}; apiError = "Could not load TBA team statistics right now."; }
  return { rankings, sortInfo, oprs, apiError };
}

/** TBA publishes rankings and OPRs using either demo keys or event aliases. */
export function normalizeTbaTeamStats(rankings: TbaRanking[], oprs: Record<string, number>, remaps: TbaTeamRemaps) {
  const numberFromKey = tbaTeamNumberResolver(remaps);
  return {
    rankings: rankings.map((ranking) => ({ ...ranking, team_key: ranking.team_key ? `frc${numberFromKey(ranking.team_key)}` : undefined })),
    oprs: Object.fromEntries(Object.entries(oprs).map(([key, value]) => [`frc${numberFromKey(key)}`, value])),
  };
}
