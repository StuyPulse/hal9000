# Website-to-native workflow audit — October 13, 2026

## Baseline and method

Baseline: native branch commit `7c5c57b`; current website source in the same repository is the behavioral authority. The earlier feature matrix and native tests are historical inventory, not proof of workflow parity. Audit completed before implementation changes. Three independent source reviews covered capture, strategist/review, and auth/admin; the primary review covered offline persistence, event selection and navigation. Findings below are source-confirmed unless stated otherwise. No real account mutations, email sends, destructive tests, OTA publication or production changes were performed.

Verdict: the app is genuinely native, but its workflows are **not yet equivalent** to the website. Native navigation and offline persistence are appropriate adaptations; changing publication boundaries, role permissions, scoring affordances, defaults, ordering and accessible data is not.

## Coverage

| Area | Website flows checked | Main divergences |
| --- | --- | --- |
| Authentication | Email login, named signup, Google, reset, membership waiting, sign-out | Membership waiting and reset landing; role refresh |
| Workspace | Active event, archived review, teams, schedule, assignments, search | Network-first restore, one cached event, active-event drift, missing team/event destinations |
| Match capture | Assigned/unassigned/manual launch, position, scoring, fouls, defense, no-show, breakage, review/edit | Wrong entry order, wizard/decrement changes, manual defaults/labels, autosave publishes edits |
| Pit/pre-scout | Fields, dimensions, experience, traversal, drawing, assignment guidance, resume | Draft overwrite and backed-up draft disappearance |
| Photos | Pick/camera, team, stage/remove, submit, coverage, private display | Immediate publication; remote media not durable offline |
| Reports | Own/everyone/event/type/team/scout/match filtering, detail, author, edit/delete, assignment reopen | Outbox substituted for review; wrong role edit; stale synced snapshots |
| Strategy | Summary groups, official metrics, comparison, timeline, source selection, lineups/drawing | Missing metric/chart flows, wrong defaults, drawing crosses events |
| Picklist | Ordering, first insert, moves, tiers/tags, history and restore | OPR ordering and sequential partial writes |
| Administration | Empty-org setup, create/import/activate/delete events, teams/aliases, matches/results, rosters, assignments/clear/undo, users/invites/email, forms | Bootstrap blocked, own-only assignments, finished slots, preview order and destructive editor defaults |
| Offline/relay | Cached startup, disconnection, event switching, local saves, reconnect, signed receipts | Restore waits on auth, partial fetch can erase cache, reconnect doesn't refresh immediately |

## Prioritized findings

All paths are repository-relative. P1 means correctness/data/task failure; P2 means an existing task has an avoidable detour or missing controls. No P0 was independently reproduced.

### Offline and data authority

- **O1 P1 — Cached startup still depends on connectivity/Auth.** `apps/mobile/src/core/context.tsx:46-53` restores a cached live workspace only after `NetInfo.fetch()` and, when connectivity appears available, `auth.getSession()`. A timeout/captive portal can leave the user at login despite downloaded data. Restore local state first, then verify/update online without deleting the cache on transient failure.
- **O2 P1 — Only one event package is retained.** `context.tsx:34,100` overwrites the singleton bundle; selecting a live event always fetches. Persist a scoped event index and separate packages for every visited/downloaded event; use cache before fetch.
- **O3 P1 — Optional fetch failures become successful empty data.** `src/core/data.ts:11` catches every error as `[]`. A partially failed refresh can persist empty photos, picklist, drawings or report-source data. Failed fetches must preserve last successful data, not masquerade as authoritative empty responses.
- **O4 P1 — Fully acknowledged local reports override new server corrections/deletions.** `StrategyViews.tsx:33-46`, `Leaderboard.tsx:21-23`, `app/search.tsx:18-20` overlay every local submitted record. Use a shared authoritative overlay that includes only explicitly approved unsynced revisions; acknowledged rows defer to a successful complete server snapshot.
- **O5 P1 — Reconnection uploads but does not promptly refresh workspace.** `context.tsx:82-100` reconnect effect invokes sync, while downloaded data waits for poll/realtime. Refresh cached event metadata, membership, assignments and reports after reconnect; preserve pending local work.
- **O6 P2 — Downloaded photos are not actually cached locally.** `data.ts:18` retains signed URLs, not image files; remote URLs expire and may never have entered an OS image cache. Persist viewed/downloaded private photos in account/org-scoped storage; do not block bundle access on media download.

### Capture and publication

- **C1 P1 — Reusing an unseen pit/pre draft overwrites its fields.** `ManualScouting.tsx:78-88` computes a base then saves the new-screen payload; its condition cannot recover after setting `recordIdRef`. Resume also tests delivery status rather than `entry.status` at line 124. Hydrate reused drafts and keep backed-up/failed unsubmitted drafts resumable.
- **C2 P1 — Submitted corrections publish before Save changes.** Match/manual controls autosave through `context.tsx:135`, which preserves submitted status and schedules upload. Website `rebuilt-match-form.tsx:158-161` and `manual-scouting.tsx:101-109` require explicit Save changes. Keep a durable working copy but do not publish it until approved; do not demote the server report to draft.
- **C3 P1 — Legacy breakage is erased.** `src/core/rebuilt.ts:9-10` rewrites legacy fields from an empty issue array. Website hydrates `break_tag`/`break_timestamp` (`rebuilt-match-form.tsx:60-73`). Independently reproduced on a comment-only normalization. Preserve legacy observations.
- **C4 P1 — Legitimate manual labels are rejected.** Shared schema and `context.tsx:148` require a positive numeric label; website explicitly supports `2–1` (`manual-match-picker.tsx:45-46`). Require a trimmed nonempty label, except Other; numeric inference belongs only in schedule linking. Shared/backend changes must be validated separately; do not modify an already-applied migration in place.
- **C5 P1 — Global scout offered another author's raw-report edit.** `report-editing.ts:5` adds global scout while website `viewerCanManage` permits only admin/developer. Retain own-report and any-member pit edits.
- **C6 P1/P2 — Picking photos immediately queues publication.** Native photo surfaces immediately call `addPhoto`, while website stages/removes/reassigns before Submit photos. Persist a local staging phase; queue only explicitly submitted photos.
- **C7 P2 — Manual defaults changed.** Native Practice/red defaults replace website Qualification/unselected alliance. Require deliberate alliance selection.
- **C8 P2 — Scheduled flow reversed.** Native requires event-wide team selection before match; website chooses match, then six alliance-grouped robots. Restore that flow and pending-first/played-delay ordering.
- **C9 P2 — Scoring was redesigned.** Native mandatory phase wizard removes simultaneous Auto/Teleop, dedicated −10 and foul ±1 controls. Restore website affordances and one foul control, keeping native touch targets.
- **C10 P2 — Starting position cannot be cleared.** Same selected spot should toggle off, and controls should retain map position/orientation.
- **C11 P2 — Breakage default asserts Intake failure.** Add a blank observation and normalize time as website does; do not infer an issue from opening its control.
- **C12 P2 — Outbox is not the Submissions review flow.** Add website event/Everyone/Just me/type/team/scout/match filters, readable identity/author/date/editor, intentional sorting, separately from delivery queue.
- **C13 P2 — Report detail hides saved drawing.** It says Saved instead of rendering SVG (`reportDetail.ts:29`); render the drawing for read-only review.
- **C14 P2 — Assignment queue is truncated.** Today shows five pending assignments with no full-list destination. Make every own pending assignment accessible.

### Strategy and review

- **S1 P1 — Drawing state crosses event/user boundaries.** `StrategyViews.tsx:643-659` initializes strokes once and saves through current event context. Key state to event/user; hydrate clean refreshes and retain dirty scoped drafts.
- **S2 P1 — Multi-row picklist actions split into sequential writes and refreshes.** `StrategyViews.tsx:381-386,457-463` loops individual writers; website persists a bulk plan. Provide one bulk mutation/refresh and honest failure behavior.
- **S3 P1 — Summary changes metrics and decision defaults.** Missing Performance and official fuel/climb metrics; total scouting fuel replaces OPR-desc default. Restore website groups, fallback values and sortable identities.
- **S4 P1/P2 — Team timeline and comparison analytical controls are missing.** Restore selectable 1–4 trend metrics/source effects and the website's two explicit comparison slots, groups and graphs; do not treat extra four-team selection as parity.
- **S5 P1/P2 — Picklist OPR order/default ranks changed to team number.** Restore consistent rank→OPR→number order, first-write rank/default fields and historical restore defaults.
- **S6 P2 — Strategy match selection starts blank and caps at eight.** Website chooses the first prioritized match, exposes all matches and permits manual lineup without schedule. Restore those flows.
- **S7 P2 — Events removed from search and Teams conflated with summary.** Provide a number-sorted searchable directory and cached event search/review that does not activate historical events.
- **S8 P2 — Valid Google `/u/0/d/` document links rejected.** Reuse website link semantics; external opening is a valid native adaptation.
- **S9 P2 — Pre-scout latest selection uses a different timestamp.** Website orders `created_at`, native uses submission/update time. Preserve created metadata and website ordering.
- **S10 P2 — Manual timeline rows appended unsorted.** Combine/sort scheduled/manual rows by round and numeric-aware label.
- **S11 P2 — Leaderboard includes pending work without disclosure.** Separate confirmed counts from explicit offline pending preview; never silently inflate server totals.

### Auth and administration

- **A1 P1 — Admin board loads only admin-owned assignments.** `data.ts:14` versus website `admin/assignments/page.tsx:37`. Load accessible event-wide assignments for managers; Today stays own-only.
- **A2 P1 — Zero-event admin bootstrap is inaccessible.** `app/admin.tsx:20` and `AdminTools.tsx:29` return before creation/import. Provide setup without an existing bundle and honest scout waiting state.
- **A3 P1 — Cached workspace wins over newly active event.** `context.tsx:44,87` uses stale event metadata. Default scouting follows authoritative active event; deliberate historical review is explicit and cached separately.
- **A4 P1 — Adding scouts to a finished slot is permitted.** `setup.ts:20` misses completed/submitted slot guard in website `admin/assignments.ts:216-225`.
- **A5 P2 — Preview ordering differs from generated plan.** Match/scout query order differs; share deterministic schedule/id ordering and authoritative occupied-slot checks.
- **A6 P2 — Completion requires inventing scores.** Add mark-complete without changing unknown/null scores, as website does.
- **A7 P2 — Extra event-details editor can deactivate an active event.** Defaults are upcoming/blank dates; remove unsupported mutation or initialize/preserve actual fields.
- **A8 P2 — Only/current unused event cannot be deleted.** Website checks records, not current selection. Support deletion to the no-event state while protecting local work.
- **A9 P2 — Manual lineup/team creation adds hidden prerequisites.** Website resolves/creates missing numbers and accepts optional name/aliases; native requires existing event-team chips and nonempty numeric-name input. Restore those entry semantics without duplicating permanent teams.
- **A10 P2 — Role choices differ.** Website invitation has scout/global/strategist/admin; role editor additionally master, not developer. Match visible choices and preserve existing developer display.
- **A11 P2 — Membership/role context never refreshes.** Refresh current viewer online without deleting private offline work; show signed-in membership waiting/retry/sign-out state, not a generic login failure.
- **A12 P2 — Recovery landing differs.** Website signs out after reset; native retains recovery session. Preserve strict PKCE/recovery proof, then return to login.
- **A13 P2 — Email-manager navigation is exposed without its independent permission.** Mirror caller-scoped eligibility; admin role alone does not grant it.

## Guardrails and non-findings

- Permanent scheduled report UUID reuse already matches the website; do not create a new UUID after each submit merely to resolve C2.
- Existing payload field names, separate scored/ferried aggregates, source grouping, shared-picklist permissions and transactional deletion protection are useful and should remain.
- Generic published form definitions do not drive specialized capture on either website or native. That is not a mobile-only mismatch and is not expanded in this correction pass.
- Native external document opening, stronger CAS checks, signed relay and SQLite are appropriate platform/reliability adaptations. Invitations, brand-new server/TBA data and irreversible remote actions cannot actually execute without a server connection; their absence must not disable cached scouting/review.

## Native technical supplement (source-level, not device certification)

| Dimension | Provisional /4 | Evidence |
| --- | --- | --- |
| Accessibility | 2 | Native labels/52pt controls exist; full reading order and large text not tested |
| Performance | 2 | Eager long lists and large full bundles; no frame/startup measurements |
| Appearance/theming | 3 | Coherent role palettes; dark runtime not verified in this audit |
| Platform conformance | 2 | Native navigation, but required workflow decisions were replaced |
| Adaptivity | 2 | Safe areas/keyboard handling; Android/narrow device behavior unverified |
| Total | 11/20 | Provisional technical supplement; correctness findings above govern priority |

## Correction order and validation

1. Preserve O1–O6 cached reads and local writes through cold launch, disconnect, partial failures and reconnect. Test with injected stores/network first, then native runtime where accessible.
2. Resolve C1–C6 and A1–A4 before UI polish: draft/data safety, explicit publication, role gates and usable assignment/setup paths.
3. Restore capture/navigation/strategy/admin affordances and website decision defaults, using existing native system. Suggested Impeccable passes: harden/clarify/adapt, then one final polish confirmation—not a new redesign.
4. For every finding, add a website-derived regression scenario; tests should not encode the previous incorrect app behavior. Run mobile/backend tests, typechecks and both platform exports; distinguish source/pure-test/native/live evidence.
5. No push, deployment, new production migration or OTA publication in this correction pass without new release authorization. A queued older TestFlight build does not include these fixes.

Status: **audit complete; fixes pending at the moment this document was written.** Per-finding resolution evidence will be appended rather than deleting the original audit.

## Resolution evidence (appended 2026-10-13; source and pure-test level, not device)

Evidence key: **src** = read in source; **test** = covered by a unit test; no row is device-verified.

| Finding | Status | Evidence |
| --- | --- | --- |
| O1 cached startup | resolved | src: `context.tsx` activates cached viewer/bundle before `NetInfo`/Auth |
| O2 per-event cache | resolved | src+test: `workspace-cache(-model).ts`, `workspace-cache.test.ts` |
| O3 failed fetch ≠ empty | resolved | src: `data.ts` no blanket catch |
| O4 authoritative overlay | resolved | src+test: `report-overlay.ts` used by StrategyViews, Leaderboard, Submissions |
| O5 refresh on reconnect | resolved | src: reconnect effect calls `refreshOnline` (context.tsx) |
| O6 photo files cached | **open** | signed URLs only |
| C1 draft overwrite | resolved | src: `ManualScouting.tsx` adopts existing own draft; base merge |
| C2 explicit publish | resolved | src: working edits local; "Save changes" publishes |
| C3 legacy breakage | resolved | src: `rebuilt.ts` hydrates break_tag/break_timestamp |
| C4 manual labels | resolved | src: creation and `saveManualIdentity` accept `2–1` |
| C5 global scout edit | resolved | src: `report-editing.ts` admin/developer only |
| C6 photo staging | resolved | src: `photo-selection.ts`, photos screen |
| C7–C10 defaults/flow/scoring/start spot | resolved | src: schedule match-first, Qualification default, simultaneous Auto/Teleop, toggle-off start |
| C11 breakage default | resolved | src: blank observation |
| C12 Submissions review | resolved | src: `app/submissions.tsx` filters |
| C13 drawing in detail | resolved | src: SVG rendered in report detail |
| C14 assignment queue | resolved | src: Today lists all pending |
| S1 drawing scope | resolved | src: state reset and hydrated per event/user |
| S2 bulk picklist | resolved | src: `writePicklistBulk` single upsert |
| S3–S6 strategy metrics/slots/match selection | resolved (needs device review) | src: Performance group, OPR default, two compare slots, MetricChart |
| S7 team directory | resolved | src: `app/teams/index.tsx` |
| S8 Google `/u/N/d/` links | resolved | test: `document-link.test.ts` |
| S9–S11 | resolved | src: created_at ordering, sorted manual rows, pending preview toggle |
| A1–A6, A10, A12, A13 | resolved | src: see AdminTools/setup/admin files |
| A11 membership waiting | resolved | src: login waiting state with check again/sign out |
| A7 event-details editor | resolved | src: no event-details update path remains; only create/activate/delete/alias |
| A8 delete current unused event | resolved | src: `deleteNativeEvent` protects only events with data |
| A9 lineup/team entry | resolved | src: `manualLineupNumbers` resolves/creates numbers; optional alias |
| Terms link (website `/terms`) | resolved | src: Settings and sign-in link to `/terms` and `/privacy` |
