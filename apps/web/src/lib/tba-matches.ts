import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

const teamKey = z.string().regex(/^frc\d+[A-Za-z]*$/);
const alliance = z.object({ team_keys: z.array(teamKey) });
export const tbaMatchSchema = z.object({
  key: z.string().min(1), comp_level: z.enum(["qm", "pm", "pr", "ef", "qf", "sf", "f"]),
  match_number: z.number().int().positive(),
  time: z.number().nullable().optional(), predicted_time: z.number().nullable().optional(), actual_time: z.number().nullable().optional(),
  alliances: z.object({ red: alliance, blue: alliance }),
});
export const tbaLiveMatchSchema = tbaMatchSchema.extend({
  post_result_time: z.number().nullable().optional(),
  alliances: z.object({ red: alliance.extend({ score: z.number().int() }), blue: alliance.extend({ score: z.number().int() }) }),
  score_breakdown: z.object({ red: z.record(z.string(), z.unknown()).nullable(), blue: z.record(z.string(), z.unknown()).nullable() }).nullable().optional(),
});
const remapSchema = z.object({ remap_teams: z.record(z.string().regex(/^frc\d+$/), teamKey).nullable().optional() });

/** TBA maps numeric demo keys to B-team labels. Resolve labels back to those
 * numbers so a B robot retains its own existing team ID and scouting history. */
export function tbaTeamNumberResolver(remaps: Record<string, string> = {}) {
  const originalByLabel = new Map<string, string>();
  for (const [original, label] of Object.entries(remaps)) {
    if (originalByLabel.has(label)) throw new Error(`TBA maps ${label} to more than one team.`);
    originalByLabel.set(label, original);
  }
  return (key: string) => {
    const numericKey = originalByLabel.get(key) ?? key;
    if (!/^frc\d+$/.test(numericKey)) throw new Error(`TBA team ${key} has no numeric event mapping. The existing schedule was left unchanged.`);
    const number = Number(numericKey.slice(3));
    if (!Number.isSafeInteger(number) || number <= 0) throw new Error(`TBA returned an invalid team key: ${key}.`);
    return number;
  };
}

export async function resolveTbaTeamNumbers(baseUrl: string, authKey: string, matches: z.infer<typeof tbaMatchSchema>[], eventPayload?: unknown) {
  const teamKeys = matches.flatMap((match) => [...match.alliances.red.team_keys, ...match.alliances.blue.team_keys]);
  if (teamKeys.every((key) => /^frc\d+$/.test(key))) return tbaTeamNumberResolver();
  if (eventPayload === undefined) {
    const response = await fetch(baseUrl, { headers: { "X-TBA-Auth-Key": authKey }, cache: "no-store" });
    if (!response.ok) throw new Error(`TBA team mapping returned HTTP ${response.status}.`);
    eventPayload = await response.json();
  }
  const parsed = remapSchema.safeParse(eventPayload);
  if (!parsed.success) throw new Error("TBA returned an unexpected event team mapping.");
  const resolve = tbaTeamNumberResolver(parsed.data.remap_teams ?? {});
  // Validate every key before any schedule rows are changed.
  teamKeys.forEach(resolve);
  return resolve;
}

export const tbaMatchType = (level: string) => level === "qm" ? "qualification" : level === "pm" || level === "pr" ? "practice" : "playoff";

export type TbaMatchRow = {
  event_id: string; tba_match_key: string; match_number: number; match_type: string;
  red_teams: string[]; blue_teams: string[]; scheduled_at: string | null; status: string;
  actual_at?: string | null; red_score?: number | null; blue_score?: number | null;
  tba_score_breakdown?: Record<string, unknown>;
};
export type StoredMatch = TbaMatchRow & { id: string };

export function tbaMatchRows(matches: z.infer<typeof tbaLiveMatchSchema>[], eventId: string, teamIds: Map<number, string>, numberFromKey: (key: string) => number): TbaMatchRow[] {
  const teamId = (key: string) => {
    const id = teamIds.get(numberFromKey(key));
    if (!id) throw new Error(`TBA team ${key} is missing from the saved team directory.`);
    return id;
  };
  const timestamp = (value: number | null | undefined) => value ? new Date(value * 1000).toISOString() : null;
  return matches.map((match) => ({
    event_id: eventId, tba_match_key: match.key, match_number: match.match_number, match_type: tbaMatchType(match.comp_level),
    red_teams: match.alliances.red.team_keys.map(teamId), blue_teams: match.alliances.blue.team_keys.map(teamId),
    scheduled_at: timestamp(match.predicted_time ?? match.time), actual_at: timestamp(match.actual_time),
    status: match.actual_time || match.post_result_time ? "played" : "scheduled",
    red_score: match.alliances.red.score >= 0 ? match.alliances.red.score : null,
    blue_score: match.alliances.blue.score >= 0 ? match.alliances.blue.score : null,
    tba_score_breakdown: match.score_breakdown ?? {},
  }));
}
const sameAlliance = (left: string[], right: string[]) => left.length === right.length && left.every((id) => right.includes(id));
const sameRoundAndTeams = (left: TbaMatchRow, right: TbaMatchRow) => left.match_type === right.match_type && left.match_number === right.match_number && sameAlliance(left.red_teams, right.red_teams) && sameAlliance(left.blue_teams, right.blue_teams);

export function manualMatchToAdopt(row: TbaMatchRow, existing: StoredMatch[], incoming: TbaMatchRow[]) {
  if (existing.some((match) => match.tba_match_key === row.tba_match_key)) return undefined;
  const candidates = existing.filter((match) => match.tba_match_key.startsWith("manual_") && sameRoundAndTeams(match, row));
  if (candidates.length !== 1 || incoming.filter((match) => sameRoundAndTeams(match, row)).length !== 1) return undefined;
  return candidates[0];
}

export async function saveTbaMatchRows(database: SupabaseClient, eventId: string, rows: TbaMatchRow[]) {
  if (!rows.length) return;
  const { data, error: readError } = await database.from("matches").select("id,event_id,tba_match_key,match_number,match_type,red_teams,blue_teams,scheduled_at,status,actual_at,red_score,blue_score,tba_score_breakdown").eq("event_id", eventId);
  if (readError) throw new Error("Could not load the existing match schedule.");
  const existing = (data ?? []) as StoredMatch[];
  const updates: TbaMatchRow[] = [];
  for (const row of rows) {
    const manual = manualMatchToAdopt(row, existing, rows);
    if (manual) {
      // Rename the matching row in place; all report and assignment foreign
      // keys continue to reference its original UUID. Never delete a match.
      const { error } = await database.from("matches").update({ tba_match_key: row.tba_match_key }).eq("id", manual.id).eq("tba_match_key", manual.tba_match_key);
      if (error) throw new Error("Could not attach the official key to an existing manual match.");
    }
    const current = existing.find((match) => match.tba_match_key === row.tba_match_key) ?? manual;
    updates.push(current?.status === "played" && row.status !== "played" ? {
      ...row, status: current.status, actual_at: current.actual_at,
      red_score: row.red_score ?? current.red_score, blue_score: row.blue_score ?? current.blue_score,
      tba_score_breakdown: current.tba_score_breakdown,
    } : row);
  }
  const { error } = await database.from("matches").upsert(updates, { onConflict: "event_id,tba_match_key" });
  if (error) throw new Error("Could not save the official match schedule.");
  const { error: reconciliationError } = await database.rpc("reconcile_manual_match_reports", { p_event_id: eventId });
  if (reconciliationError) throw new Error("Could not reconcile manual scouting reports with the official schedule.");
}
