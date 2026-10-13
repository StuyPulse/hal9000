# Native implementation coordination

User requested the actual full native application for BOTH Android and iOS and explicitly authorized Codex and Claude to communicate, share repository/design context, and collaborate on implementation.

## Shared checkout

`/Users/mekot/Documents/App Development/hal9000-native`, branch `codex/native-mobile`. This is an isolated worktree from the clean current web repository. Do not edit the original checkout, change branches, commit/push, deploy or alter hosted database state during this implementation.

## Product evidence

- Root AGENTS.md governs the existing phased Expo plan. Current source is authoritative where old prose differs: current reports are scouting_entries and specialized REBUILT form v4.
- apps/web/src/app/scout/match/[matchId]/rebuilt-match-form.tsx contains the actual match observations.
- apps/web/src/components/manual-scouting.tsx contains pit and pre-scout fields.
- apps/web/src/app/scout/pit, global, pre-scout, dashboard, submissions, teams and events contain the rest of the website features.
- packages/shared and supabase/migrations provide contracts, roles and persistence model.
- docs/mobile-design contains the latest browser design study, design notes, screenshots and previous Claude consultation. It is design evidence only, not proof that a native app is implemented.

## Scope

Auth/device setup; event download/offline readiness; assignments; full/manual match schedule; real v4 match entry; shared dynamic forms; drafts/review/submissions; SQLite queue and direct sync; QR display/master receipt; pit/pre-scout/photo capture/coverage; event global document; team profiles/history; summary/comparison/picklist/strategy; appropriate role-based setup screens; settings/device status. Track each feature honestly in the implementation matrix rather than silently dropping features.

## Authority and data

No private production records or authentication credentials have been copied into this worktree. Codex configured an ignored mobile .env.local with public Supabase URL/publishable key only. Do not read/share environment files or external credentials with Claude. Client code uses only publishable keys and authenticated RLS. Do not add a service key to the app or bypass RLS. A relay checksum proves integrity only: genuine Master submission on behalf of another scout needs authorized server handling. Do not invent that access or claim real relay delivery until implemented and verified.

## Ownership

Codex: Expo scaffold, dependencies/configuration, core types/state/auth/SQLite/data/sync/QR, navigation and integration.

Claude initial task: inspect the entire website and source contracts, produce a precise feature inventory and implementation risks in docs/mobile-feature-matrix.md. Read-only outside that document until Codex sends a bounded code assignment with interface details.

Both may inspect all source. Coordinate through this document, scoped changes and Claude conversation. Do not overwrite each other's files. Report unexpected edits or missing interfaces before expanding file ownership.

## Active two-way exchange (October 12)

Claude Code session: `local_d16c62da-77c4-4f61-8f83-e28a9a43cdeb`, title HAL9000 mobile feature matrix.

- Claude audited the website and built `src/features/**`: pit/pre-scout, native drawing, team profiles, summaries/comparisons, shared picklist/history/tier/tag management and match strategy.
- Codex built auth, SQLite, queues, QR, navigation, match entry, photo capture and backend integration, then sent actual integration failures back to Claude.
- Claude corrected the required-context TypeScript conflict, autosave draft-clobbering, tier-delete rollback and missing-entry handling. Codex independently verified typecheck and 27 tests.
- Claude reviewed core and flagged zero-row RLS writes, overwritten creator metadata, missing signed URLs/history/profile data, and missing cloud-record editing. Codex fetched data/signed URLs and fixed ranking creator preservation/readback.
- Current additional bounded Claude ownership: ONLY `savePicklistMeta`, `deletePicklistMeta`, `saveRobotProfile` in `src/core/context.tsx`, plus `src/features/FeatureNotes.md`. Codex will not edit those functions during this pass.
- iOS, Android and web exports succeeded. This does not establish simulator/device, authenticated live-sync, real camera or multi-device QR correctness. Those remain separate verification tasks.
