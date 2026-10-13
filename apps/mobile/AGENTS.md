# HAL9000 native app

Read the root AGENTS.md and docs/mobile-collaboration.md. Expo + React Native + TypeScript for BOTH iOS and Android. Never replace this with a WebView, HTML, or Swift-only implementation.

Follow actual website observations and database types. `scouting_entries` is the current report table. REBUILT v4 uses separate auto/teleop shoot/ferry, starting_spot/no_show, fouls/defense/defended teams, repeatable breakage issues and comments. Pit/pre-scout use form version 2. Generic form definitions remain versioned and game-agnostic. Share contracts and validation with packages/shared without editing the website unnecessarily.

Every mutation persists locally before network. Scope local rows by signed-in account and organization. Keep one UUID per report, retain immutable queued snapshots/revisions, and acknowledge exactly the revision uploaded. Never ship a service key. Master integrity checks do not grant upload-on-behalf permissions; preserve pending relay data if existing RLS denies it.

Use React Native controls, safe areas, native navigation, 44pt iOS/48dp Android targets, system font scaling and explicit screen-reader labels. Support dark/light. Keep all website features in docs/mobile-feature-matrix.md with honest implemented/tested/pending status.

Codex owns core and navigation. Claude must follow bounded file ownership provided in its conversation. Run mobile:typecheck, mobile:test, Expo export for both OS and at least one simulator runtime check. Do not claim camera/QR/auth/live sync verified without testing those actual operations.
