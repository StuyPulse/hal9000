# Feature notes: ManualScouting / StrategyViews

Honest record of what these screens can and cannot do. Source semantics are in `docs/mobile-feature-matrix.md`.

## Status

| Area | Written | Run on device | Notes |
| --- | --- | --- | --- |
| `stats.ts`, `picklist.ts`, `autoPath.ts`, `manualFields.ts` | yes | unit-tested (`features.test.ts`, 12 tests, Node) | Pure TS; ports of website logic. |
| `ManualScoutingScreen` (pit, pre-scout) | yes | **no** | Typechecks against `FeatureContext`. Not exercised on iOS/Android. |
| `AutoPathCanvas` | yes | **no** | PanResponder + react-native-svg. Touch coordinates (`locationX/Y`) unverified on hardware. |
| Photo capture | yes | **no** | Uses `expo-image-picker`; depends on `context.addPhoto` for compression/upload. |
| `StrategyScreen` (summary/compare/picklist/strategy) | yes | **no** | Reads `bundle` + `records` only. |
| `TeamProfileScreen` | yes | **no** | |

## Data-format facts that differ from the task statement

- `auto_routines_drawing` is an **SVG string** (`<svg … viewBox="0 0 1380 674">` with one `linearGradient` + `path` per stroke), not a PNG data URI. The website renders it through `data:image/svg+xml`. This build writes the same string and reads it back into editable strokes (the website discards the old drawing on edit).
- Pit and pre-scout payload values are all strings (`form_version` 2). Non-string keys found in a loaded payload are kept untouched in `extras` and merged back on save.

## Unavailable backend fields / behaviours

- **TBA rank and OPR**: need the TBA key and are not on device. Not shown, not invented. W-L-T, win/loss and official fuel/climb *are* computed from `matches.red_score/blue_score/tba_score_breakdown`.
- **Prescout assignments**: not in the bundle. Pre-scout shows a warning when the event is not active; the server (RLS) is the real gate.
- **Picklist history, tier/tag management, strategy drawings, robot profile**: now implemented against `savePicklistMeta`, `deletePicklistMeta`, `saveStrategyDrawing`, `saveRobotProfile` and `bundle.picklistHistory`/`profiles` (see "Second pass" below). Robot profile editing is admin/developer only because `event_teams` writes are restricted by RLS; ordinary members need a server endpoint that does not exist.
- **Report source selection**: read from `bundle.reportSources` and applied; choosing is admin-only and not implemented.
- **Field artwork**: now in `apps/mobile/assets`; the route wrappers pass it as `fieldArt` to `AutoPathCanvas`. `StrategyCanvas` accepts the same prop but the match-strategy screen does not pass it yet.

## Deviations from the website (deliberate)

- Practice detection compares the manual stage case-insensitively. The website compares `stage === "practice"` exactly, but stores `"Practice"`, so it never matches (bug in `scouting-stats.ts`).
- Summary/compare/picklist stats include this device's submitted-but-unsynced match reports and say so on screen.
- No admin report-source picker, no leaderboard.

## Integration points that must exist

- `src/core/context.tsx` exporting `useApp(): FeatureContext` with `savePicklistRanking`, `saveStrategyDrawing`, `savePicklistMeta`, `deletePicklistMeta`, `saveRobotProfile`. `common.tsx` is the only feature file that imports it.
- Routes `/submission/[id]` and `/teams/[id]` (called through `router.push(... as never)`).
- `createDraft(kind, teamId, null, null, payload)` for pit/pre-scout; `saveDraft(id, payload, finalize)` on each autosave (every 700 ms after an edit, and on review/unmount) and with `finalize=true` on submit.
- `mobile:test` runs both `src/core` and `src/features` test globs.

## Second pass (strategy drawing, history, tiers/tags, robot profile)

| Feature | Where | Behaviour |
| --- | --- | --- |
| Strategy drawing | `StrategyCanvas.tsx`, match strategy | Loads the viewer's `bundle.strategyDrawings` row; strokes are normalized 0..1 `{color, points}` (same as the website); flip view; save via `saveStrategyDrawing`, which queues locally first (one revision per save, `core/strategy-queue.ts`), replays on sync, never retires a newer revision, and is overlaid onto refreshed bundles. Demo never uploads. |
| Picklist history | `picklist.ts` `groupRevisions/describeChange/planRestore` | Sessions = same actor within 5 minutes; restore walks back through newer sessions and writes full states per team. |
| Tier/tag management | `StrategyViews.tsx` picklist | Add (name <= 48, hex colour, unique), reorder tiers by swapping `sort_order`, delete. Tier delete moves its teams first and rolls them back if the delete is refused. |
| Robot profile | team profile | Chips shown only for admin/developer. |
| Official stats | `stats.ts` | `matchOutcome` treats -1 scores as pending; `teamRecord`, `officialFuelAverages` (alliance hub totals), `officialClimb` (per-robot slot). |

## Integration findings and verified fixes

Found while reading the real `core/context.tsx`/`data.ts` (all verified by root `mobile:typecheck` and `mobile:test`, 27/27 tests; none verified on a device):

| # | Finding | Status |
| --- | --- | --- |
| 1 | `FeatureApp` intersected required and optional writers, so presence checks failed `TS2774`. | Fixed (`FeatureApp = FeatureContext`). |
| 2 | `createDraft` returns an existing own draft for the team; autosave would overwrite its fields. | Fixed in `ManualScouting.tsx`: existing fields are the base. |
| 3 | Tier delete could leave teams moved but the tier standing when the server refuses. | Fixed: teams restored on failure. |
| 4 | `entryId` for a report not stored locally showed a blank form. | Fixed: notice. |
| 5 | RLS refusals on `update`/`delete` return zero rows without an error; `deletePicklistMeta` and `saveRobotProfile` reported success. | Fixed in `context.tsx`: `.select()` read-back, a zero-row result throws with an explanatory message. |
| 6 | `savePicklistMeta` upserted `created_by = viewer` on every write, changing who may delete a tier (strategists/masters can delete only tiers they created; admin/developer/global_scout any). | Fixed: updates send only `name,color,sort_order`; `created_by` is sent only on insert. |
| 7 | Meta/robot inputs were passed through unsanitised. | Fixed: name trimmed to 48 and unique per kind (case-insensitive), `#rrggbb` only, `sort_order` a non-negative integer, id format, drivetrain/shooter restricted to the website's lists. |
| 8 | `writePicklist` overwrote `created_by` and did not verify rows. | Fixed by Codex in `data.ts`. |
| 9 | No signed URLs for uploaded photos. | Fixed by Codex. |
| 10 | Strategy drawings above 300000 JSON chars are rejected by the context (800 points/stroke, no stroke cap in the canvas). | Open: unlikely, not clamped client-side. |

Still open and not claimed: draft cloud syncing (drafts are local-only; only submitted reports upload), editing another scout's server report (pit edits are RLS-allowed but need a local claim record), and any on-device verification of drawing, camera or photo flows.

## Offline strategy queue (tested logic, not device-verified)

- Queue key is the event; each save bumps `revision`; upload retires only the revision it sent; a failed upload keeps the row with its error; legacy rows without a revision replay as revision 1.
- The server row is located by (event, user) and updated by id, so its primary key is never rewritten; an insert race (`23505`) falls back to update.
- 7 unit tests in `src/core/strategy-queue.test.ts` cover revision-safe acknowledgment, replay after failure and the refresh overlay. Upload and storage glue (`strategy-sync.ts`) is not unit-tested.

## Strategy refresh race (fixed in queue logic; not device-verified)

- An uploaded drawing is no longer deleted on acknowledgment. The row is marked `acknowledgedAt` and keeps overriding server snapshots until a fetched snapshot has the same strokes (structural equality, 1e-9 tolerance) or 10 minutes pass (`ACK_RETENTION_MS`).
- So a refresh that started before the upload and returns after it cannot resurrect old strokes, regardless of setState ordering; the decision is made from stored state at the moment each bundle is saved.
- Trade-off: if another device changes the drawing within 10 minutes of this device's upload, this device keeps showing its own until the window passes or its strokes appear on the server.
- `flush(guard)` checks the guard before each row and returns `aborted: true`; `context.tsx` passes `scopeRef.current === scope`. The upload wrapper also refuses to send a queued drawing unless the signed-in user id equals the drawing's `user_id`.
- Tests (`strategy-queue.test.ts`): stale snapshot after acknowledgment, confirmation releasing the override, retention expiry, save after acknowledgment, guard abort.

## Remaining UI/feature mismatches (open, not claimed complete)

- **Pre-scout assignments**: `bundle.prescoutAssignments` is available but the pre-scout screen does not use it. Plain scouts see the same team list; the server decides. Active-event warning only.
- **Admin report-source picker**: sources are applied but cannot be chosen; leaderboard not built.
- **Pit edit of another scout's report**: still needs a local claim record (`entryId` not in `records` shows a notice).
- **Cached photo URLs**: signed URLs expire after about an hour; offline after that the remote photos stop rendering until refreshed. Locally staged photos are unaffected.
- **Strategy drawing screen state**: initial strokes are read once on mount; a drawing updated from another device appears after leaving and reopening the screen.
- **Picklist**: changes require a connection (no offline queue); concurrent edits are last-writer-wins per team row.
- **Summary/compare**: do not show TBA rank or OPR; include this device's unsynced reports (labelled).
- **No device verification** of any canvas gesture, photo capture, keyboard behaviour or dark/light rendering.

## Parity pass 3 (2026-10-13) — what was added and what was actually seen running

Added (all in `src/features`, `app/leaderboard.tsx`, `app/_layout.tsx`):
- **Leaderboard** (`Leaderboard.tsx`, route `/leaderboard`): the website's metrics exactly — scouts grouped by submitted reports (desc, then name); Match tab adds Teams and Matches counts and a Practice/Qualification/Playoffs round filter; reports with no round label are excluded and counted. Includes this device's unsynced submitted reports. Needs a link from More (not mine).
- **TBA rank / record / OPR** from `bundle.official` in summary cards (+ rank/OPR sort), team profile tile and the compare "Official" tab. Nothing is shown when the download failed; no value is derived or invented.
- **Report-source picker** on the team timeline: admin only, chips "Combined" + each author, via `saveReportSource`. Surfaces the error text on refusal.
- **Prescout coordination**: "Assigned to you" quick-select, per-team assignee line; never blocks a submission.
- **Robot profile editor** shown to every signed-in member (the server route and policy are the real gate).
- **Polish**: compact one-row pens, collapsible team picker, native titles and "Back" labels, a resumed draft shows its saved time, `GestureHandlerRootView` at the app root.

Seen running on the iOS simulator (iPhone 17 Pro, Expo Go, isolated local-practice mode, no cloud writes):
- Pit form: resume-draft list, team selection, experience chips, autosave ("Draft saved on this device at …"), compact pens, field art, **finger drawing produces a gradient stroke without scrolling the page**, Review step renders the SVG drawing, Submit shows "Saved on this device · waiting to upload" and the Outbox badge increments.
- Scouting summary renders with the unsynced-report banner, filters, sort chips and heat-coloured metric tiles.

Gesture lesson: an earlier "scroll steals the drawing" diagnosis was wrong. The failed attempts started a touch while the previous swipe's momentum was still scrolling, which only stops the scroll. Drawing works once the page is at rest. The canvas now also blocks the screen's scroll view while a finger is down (Gesture Handler `blocksExternalGesture`) — that part is untested against a genuinely competing scroll.

Not verified on a device: Android, dark mode, the report-source picker, official rank/OPR (no official feed in local practice), prescout assignments, leaderboard screen (route exists; no navigation link yet), picklist editing, camera/photo capture.

## Independent read-only parity review (2026-10-13)

Method: source read of website + migrations vs current native source. **No simulator driving, no edits outside this file.** "Source-only" means read from code, not run. "Seen" means observed on the iOS simulator in the earlier pit/summary pass.

### Confirmed matching (source-only unless noted)
- **Leaderboard metrics**: native grouping/ordering/rounds/unlabelled-exclusion are a line-for-line port of `leaderboard-board.tsx`; 3 unit tests cover it. Data differs in one honest way: it counts the selected event's submitted entries plus this device's unsynced submitted reports (web: active event, server rows only).
- **Official ranks schema**: `/api/mobile/tba` returns `fetchTbaRankings(...)` unchanged, i.e. `{rankings:[{team_key:'frc{permanent}',rank,record,sort_orders}], sortInfo:[{name}], oprs:{frc{n}:value}, apiError}` with alias keys already normalized to permanent numbers. `officialForTeam` reads exactly those keys; unit-tested against that shape. Not exercised against a real TBA response.
- **Report-source grouping**: native `matchReportKey` equals `private.validate_match_report_source` (`scheduled:{id}` > `manual:{lower stage}:{lower label}` > `report:{id}`), and `saveReportSource` uses `onConflict event_id,team_id,match_key` with a zero-row check. Admin-only matches RLS (`admin` only; `developer` is refused client-side and by the database).
- **Pre-scout permissions**: native never gates by assignment, matching RLS (assigned OR active-event team; admin/developer/global_scout any). The only guidance is a warning when the event is not active and the team is not assigned (`ManualScouting.tsx`).

### Gaps (ordered by impact)

1. **Published forms have no effect on any scouting screen (web and native).** `bundle.forms` is loaded and `FormBuilder` publishes new `form_definitions` versions, but only `AdminTools.tsx` reads `bundle.forms`. Match v4 and pit/pre v2 are hard-coded, and `form_version` is a constant (4/2), unrelated to `form_definitions.version`. The generic schema (`counter|boolean|select|rating|notes`, sections `auto|teleop|notes`) cannot express the REBUILT fields (field map, shoot/ferry pairs, breakage list, drawing, bounded sliders). Repro: publish a new form version in Admin, open Pit scouting, nothing changes. Needs a product decision, not a patch; do not claim "versioned generic forms" for scouting.
2. **Match labels on Today and Schedule are raw**: `${match_type} ${match_number}` ("qualification 18", "playoff 3") instead of `matchLabel` from the TBA key. Playoff sets collide (Semifinal 1 Match 1 and Semifinal 2 Match 1 both read "playoff 1") and case is wrong. Seen on Today in the simulator. Fix: reuse `matchLabel` from `src/features/stats.ts`.
3. **Native payload validation is thinner than the database.** `validateNativeEntry` validates only match v4 and with `.passthrough()`. Pit and pre-scout payloads are not validated; `starting_spot` is any string (DB CHECK allows 9 values); a match payload containing `climb` or `shifts` passes client validation and is rejected by the database CHECK. Result: a report that can never upload, shown as failed. Source-only; nothing in the current UI can produce these values.
4. **Official-feed failure is silent in summary/profile/compare**: when `official.apiError` is set and rankings are empty, `hasOfficial` is false and nothing explains the missing TBA rank/OPR (the profile tile does say "TBA unavailable"; summary and compare do not). My files; will fix on the next pass.
5. **Report-source key drift for unsynced local rows**: a local manual report has `match_id=null` until the server trigger links it. Its key is `manual:...` locally and `scheduled:{id}` after sync, so an admin-selected source stored under one key will not apply under the other until the next refresh. Faithful to web behaviour (same trigger), but worth a note in the UI.
6. **Faithful-but-surprising**: when `selected_entry_id` points at a deleted/unsubmitted report, every report for that match is filtered out of the stats (web `selectedMatchReportEntries` behaves identically). No client guard.
7. **Pre-scout rejection is only warned about**: a plain scout can complete a pre-scout form for a non-active event with no assignment; the server will reject it at upload and the record sits as failed. Consider disabling Submit with an explanation instead of the current warning.
8. **Prescout assignments are visible only for own rows** (RLS: own, managers, global_scout), so "Assigned to Jane" lines cannot show other scouts' assignments to a plain scout. Expected, not a bug; the UI line is accurate only for what the user can read.

### Tested vs source-only summary
| Area | Evidence |
| --- | --- |
| Pit form autosave, review SVG, submit → "waiting to upload", Outbox badge | Seen (simulator) |
| Summary cards, unsynced-report banner, sort chips | Seen |
| Draw gesture | Seen (stroke drawn, page did not scroll once at rest) |
| Leaderboard grouping, official rank/record/OPR parsing, prescout coordination, picklist/strategy queue logic | Unit-tested (67 tests passing at last run) |
| Leaderboard screen, report-source picker, official rank in UI, prescout lines, robot editor for non-admins | Source-only |
| Android, dark mode, camera, real TBA response, real server writes | Not tested |

## Parallel pass (2026-10-13): labels, official feed, pre-scout gate, report detail
- Today/Schedule use `matchLabel`/`compareMatches` (playoff sets no longer collide; search matches the label).
- `officialFeedStatus` explains TBA failures/absence in the shared SourceNotice (summary, compare, strategy, profile). Stale "not available on mobile" text removed.
- Pre-scout (CORRECTED after live `pg_get_functiondef` check, apps/web/src/lib/mobile/README.md): `prescoutBlocked` disables Review/Submit unless privileged (admin/developer/global_scout), assigned, or (event status active AND team registered). Event status matters; the earlier reading of `20260913172229` was superseded by `20261007211503`. Strategist/master do not bypass.
- Report detail: grouped observations (`reportDetail.ts`), expandable raw JSON, QR sized from the measured container (`qrSize`, 160..320). QR/export/delete/manual-identity buttons untouched.
- Colour swatches and "Change team" target are 48dp. 77 tests, typecheck clean. Not run on a device.
