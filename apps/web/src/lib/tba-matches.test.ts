import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { manualMatchToAdopt, resolveTbaTeamNumbers, saveTbaMatchRows, tbaLiveMatchSchema, tbaMatchRows, tbaMatchType, tbaTeamNumberResolver, type StoredMatch, type TbaMatchRow } from "./tba-matches";

const remaps = { frc9997: "frc271B", frc9998: "frc1601B", frc9993: "frc333B" };
const official: TbaMatchRow = {
  event_id: "event", tba_match_key: "2026nycrr_pm2", match_number: 2, match_type: "practice",
  red_teams: ["263", "369", "333"], blue_teams: ["10454", "9997", "3017"],
  scheduled_at: null, status: "scheduled", actual_at: null, red_score: null, blue_score: null, tba_score_breakdown: {},
};
const manual: StoredMatch = { ...official, id: "permanent-match-id", tba_match_key: "manual_existing" };
const payload = {
  key: "2026nycrr_qm10", comp_level: "qm", match_number: 10, time: 1791647640, actual_time: null,
  alliances: { red: { team_keys: ["frc334", "frc1155", "frc1601B"], score: -1 }, blue: { team_keys: ["frc1807", "frc3017", "frc263"], score: -1 } },
};

test("B-team labels resolve to their demo teams without merging into the parent robot", () => {
  const resolve = tbaTeamNumberResolver(remaps);
  assert.equal(resolve("frc1601B"), 9998);
  assert.equal(resolve("frc271B"), 9997);
  assert.equal(resolve("frc333B"), 9993);
  assert.equal(resolve("frc1601"), 1601);
  assert.equal(resolve("frc9998"), 9998);
});

test("unknown and ambiguous B-team mappings fail instead of guessing a team", () => {
  assert.throws(() => tbaTeamNumberResolver()("frc1601B"), /no numeric event mapping/);
  assert.throws(() => tbaTeamNumberResolver({ frc9997: "frc1601B", frc9998: "frc1601B" }), /more than one team/);
});

test("match validation accepts TBA B-team keys and rejects malformed keys", () => {
  assert.equal(tbaLiveMatchSchema.safeParse(payload).success, true);
  assert.equal(tbaLiveMatchSchema.safeParse({ ...payload, alliances: { ...payload.alliances, red: { ...payload.alliances.red, team_keys: ["not-a-team"] } } }).success, false);
});

test("event metadata supplies the inverse remap and validates every match key", async () => {
  const matches = [tbaLiveMatchSchema.parse(payload)];
  const resolve = await resolveTbaTeamNumbers("unused", "unused", matches, { remap_teams: remaps });
  assert.equal(resolve("frc1601B"), 9998);
  await assert.rejects(resolveTbaTeamNumbers("unused", "unused", matches, { remap_teams: {} }), /no numeric event mapping/);
});

test("practice matches stay practice and negative unplayed scores stay empty", () => {
  assert.equal(tbaMatchType("pm"), "practice");
  assert.equal(tbaMatchType("pr"), "practice");
  assert.equal(tbaMatchType("qm"), "qualification");
  assert.equal(tbaMatchType("sf"), "playoff");
  const teamIds = new Map([334, 1155, 9998, 1807, 3017, 263].map((number) => [number, `id-${number}`]));
  const [row] = tbaMatchRows([tbaLiveMatchSchema.parse(payload)], "event", teamIds, tbaTeamNumberResolver(remaps));
  assert.deepEqual(row.red_teams, ["id-334", "id-1155", "id-9998"]);
  assert.equal(row.red_score, null);
  assert.equal(row.blue_score, null);
  assert.equal(row.status, "scheduled");
  assert.equal(row.scheduled_at, "2026-10-10T15:54:00.000Z");
  teamIds.delete(9998);
  assert.throws(() => tbaMatchRows([tbaLiveMatchSchema.parse(payload)], "event", teamIds, tbaTeamNumberResolver(remaps)), /missing from the saved team directory/);
});

test("an exact manual round and alliance lineup keeps its original match UUID", () => {
  const reordered = { ...manual, red_teams: [...manual.red_teams].reverse() };
  assert.equal(manualMatchToAdopt(official, [reordered], [official])?.id, manual.id);
  assert.equal(manualMatchToAdopt({ ...official, match_number: 3 }, [manual], [official]), undefined);
  assert.equal(manualMatchToAdopt({ ...official, blue_teams: official.red_teams, red_teams: official.blue_teams }, [manual], [official]), undefined);
});

test("ambiguous rounds and existing official matches never replace manual records", () => {
  assert.equal(manualMatchToAdopt(official, [manual, { ...manual, id: "another-id" }], [official]), undefined);
  assert.equal(manualMatchToAdopt(official, [manual], [official, { ...official, tba_match_key: "another-official-key" }]), undefined);
  assert.equal(manualMatchToAdopt(official, [manual, { ...official, id: "official-id" }], [official]), undefined);
});

function memoryDatabase(matches: StoredMatch[]) {
  const changes: string[] = [];
  const database = {
    from(table: string) {
      assert.equal(table, "matches");
      return {
        select: () => ({ eq: async () => ({ data: structuredClone(matches), error: null }) }),
        update: (update: Partial<StoredMatch>) => ({ eq: (_column: string, id: string) => ({ eq: async (_keyColumn: string, oldKey: string) => {
          const match = matches.find((row) => row.id === id && row.tba_match_key === oldKey);
          if (match) Object.assign(match, update);
          changes.push("rename");
          return { error: null };
        } }) }),
        upsert: async (rows: TbaMatchRow[], options: { onConflict: string }) => {
          assert.equal(options.onConflict, "event_id,tba_match_key");
          for (const row of rows) {
            const current = matches.find((match) => match.event_id === row.event_id && match.tba_match_key === row.tba_match_key);
            if (current) Object.assign(current, row);
            else matches.push({ ...row, id: `new-${matches.length}` });
          }
          changes.push("upsert");
          return { error: null };
        },
      };
    },
    rpc: async (name: string, args: { p_event_id: string }) => {
      assert.equal(name, "reconcile_manual_match_reports");
      assert.equal(args.p_event_id, "event");
      return { error: null };
    },
  } as unknown as SupabaseClient;
  return { database, changes };
}

test("saving and retrying imports preserves report/assignment references and creates no duplicate", async () => {
  const matches = [structuredClone(manual)];
  const { database, changes } = memoryDatabase(matches);
  const report = { match_id: manual.id, payload: { robot_broke: true } };
  const assignment = { match_id: manual.id, status: "complete" };
  await saveTbaMatchRows(database, "event", [official]);
  await saveTbaMatchRows(database, "event", [official]);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].id, report.match_id);
  assert.equal(matches[0].id, assignment.match_id);
  assert.equal(matches[0].tba_match_key, official.tba_match_key);
  assert.deepEqual(report.payload, { robot_broke: true });
  assert.equal(assignment.status, "complete");
  assert.deepEqual(changes, ["rename", "upsert", "upsert"]);
});

test("a played manual match retains its result when TBA has only a schedule, including later retries", async () => {
  const matches = [{ ...manual, status: "played", actual_at: "2026-10-10T12:00:00Z", red_score: 100, blue_score: 90, tba_score_breakdown: { saved: true } }];
  const { database } = memoryDatabase(matches);
  await saveTbaMatchRows(database, "event", [official]);
  await saveTbaMatchRows(database, "event", [official]);
  assert.equal(matches[0].status, "played");
  assert.equal(matches[0].red_score, 100);
  assert.equal(matches[0].blue_score, 90);
  assert.equal(matches[0].actual_at, "2026-10-10T12:00:00Z");
  assert.deepEqual(matches[0].tba_score_breakdown, { saved: true });
});

test("a nonmatching manual match stays intact while the official match is added", async () => {
  const unrelated = { ...manual, match_number: 4 };
  const matches = [structuredClone(unrelated)];
  const { database, changes } = memoryDatabase(matches);
  await saveTbaMatchRows(database, "event", [official]);
  assert.deepEqual(matches[0], unrelated);
  assert.equal(matches.length, 2);
  assert.deepEqual(changes, ["upsert"]);
});
