import { z } from "zod";
import { tbaLiveMatchSchema, tbaMatchRows, resolveTbaTeamNumbers, saveTbaMatchRows } from "../tba-matches";
import { tbaTeamRemapsSchema } from "../tba-team-remaps-schema";
import { requireManager } from "./admin-operations";
import { MobileError, type Actor, type MobileDatabase } from "./operations";

const eventSchema = z.object({ name: z.string().min(1), start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), remap_teams: tbaTeamRemapsSchema.optional() });
const teamsSchema = z.array(z.object({ key: z.string().regex(/^frc\d+$/), team_number: z.number().int().positive(), nickname: z.string().nullable() }));
function checked(result: any, resource: string) {
  if (result.error) throw new MobileError(503, "import_database_failed", `TBA import could not save ${resource}. Earlier import steps may have completed; retry safely.`);
  return result.data;
}
export async function importEvent(database: MobileDatabase, actor: Actor, input: unknown) {
  requireManager(actor);
  const parsed = z.object({ eventKey: z.string().trim().toLowerCase().regex(/^[0-9]{4}[a-z0-9_]+$/) }).strict().parse(input);
  const key = process.env.TBA_AUTH_KEY;
  if (!key) throw new MobileError(503, "tba_unavailable", "TBA import is not configured on this server.");
  const base = `https://www.thebluealliance.com/api/v3/event/${parsed.eventKey}`;
  // Full refresh deliberately avoids stale ETags. Each response must validate
  // before any writes; imported matches use the existing source's merge helper.
  const responses = await Promise.all(["", "/teams/simple", "/matches", "/matches/practice"].map((suffix) => fetch(`${base}${suffix}`, { headers: { "X-TBA-Auth-Key": key }, cache: "no-store", signal: AbortSignal.timeout(15000) })));
  const failed = responses.find((result) => !result.ok);
  if (failed) throw new MobileError(502, "tba_fetch_failed", `TBA returned HTTP ${failed.status}. No import data was written.`);
  const [rawEvent, rawTeams, rawMatches, rawPractice] = await Promise.all(responses.map((result) => result.json()));
  const event = eventSchema.parse(rawEvent); const teams = teamsSchema.parse(rawTeams);
  const matches = z.array(tbaLiveMatchSchema).parse([...z.array(z.unknown()).parse(rawMatches), ...z.array(z.unknown()).parse(rawPractice)]);
  const existing = checked(await database.from("events").select("id").eq("organization_id", actor.organizationId).eq("event_key", parsed.eventKey).maybeSingle(), "event lookup");
  const patch = { name: event.name, starts_at: `${event.start_date}T00:00:00Z`, ends_at: `${event.end_date}T23:59:59Z`, is_manual: false, tba_team_remaps: event.remap_teams ?? {} };
  const saved = existing
    ? checked(await database.from("events").update(patch).eq("id", existing.id).eq("organization_id", actor.organizationId).select("id").single(), "event")
    : checked(await database.from("events").insert({ ...patch, organization_id: actor.organizationId, event_key: parsed.eventKey, status: "upcoming" }).select("id").single(), "event");
  if (!saved) throw new MobileError(503, "import_database_failed", "The imported event could not be confirmed.");
  if (teams.length) checked(await database.from("teams").upsert(teams.map((team) => ({ organization_id: actor.organizationId, team_number: team.team_number, name: team.nickname || `FRC Team ${team.team_number}` })), { onConflict: "organization_id,team_number" }), "teams");
  // Fetch every page; large organization directories must not silently omit IDs.
  const directory: { id: string; team_number: number }[] = [];
  for (let offset = 0; ; offset += 1000) {
    const page = checked(await database.from("teams").select("id,team_number").eq("organization_id", actor.organizationId).order("id").range(offset, offset + 999), "team directory") ?? [];
    directory.push(...page); if (page.length < 1000) break;
  }
  const ids = new Map(directory.map((team) => [team.team_number, team.id]));
  const links = teams.map((team) => ({ event_id: saved.id, team_id: ids.get(team.team_number), is_manual: false }));
  if (links.some((link) => !link.team_id)) throw new MobileError(503, "import_database_failed", "A participant was not saved. Retry the import.");
  if (links.length) checked(await database.from("event_teams").upsert(links, { onConflict: "event_id,team_id" }), "event roster");
  const resolver = await resolveTbaTeamNumbers(base, key, matches, rawEvent);
  const missing = matches.flatMap((match) => [...match.alliances.red.team_keys, ...match.alliances.blue.team_keys]).map(resolver).find((number) => !ids.has(number));
  if (missing) throw new MobileError(422, "tba_missing_team", `The imported schedule references unsaved team ${missing}. Retry the import.`);
  await saveTbaMatchRows(database as Parameters<typeof saveTbaMatchRows>[0], saved.id, tbaMatchRows(matches, saved.id, ids, resolver));
  checked(await database.from("events").update({ tba_last_synced_at: new Date().toISOString() }).eq("id", saved.id).eq("organization_id", actor.organizationId), "sync metadata");
  return { eventId: saved.id, teams: teams.length, matches: matches.length, message: `Synced ${teams.length} teams and ${matches.length} matches. Existing active-event status was preserved.` };
}
