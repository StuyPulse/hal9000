# Content safety implementation and release gates

October 18, 2026. Local implementation only. No migration applied to the hosted database, no real safety report submitted, no live member suspended and no push/deployment performed.

## Implemented

- Settings → Content safety and reports; contextual report actions on scouting-report details and photo gallery items.
- Account/organization-scoped SQLite queue with an immutable report UUID, explicit pending/received wording and retry on normal reconnect/foreground sync. Local practice reports never reach the server. Pending safety reports count in Settings delivery status and prevent an all-success last-sync marker.
- `GET/POST/PATCH /api/mobile/safety`: verified Bearer identity and database membership; event/content organization scoping; strict request validation; exact retry acknowledgment even if the target was subsequently removed; paginated private reporter/admin inbox; admin resolution explanation with compare-and-swap against open status.
- SQL RLS/read grants limit reporter visibility and organization-admin visibility. Mobile clients cannot insert or edit moderation rows directly. A serialized per-reporter limit permits at most 50 new reports per rolling 24 hours; pending local requests remain available for retry. No report attachments or underlying content snapshots are copied automatically.
- Settings → Team access safeguards: online-only admin suspension/restoration with explicit confirmation. Suspension transaction archives the existing role and removes only the target organization's membership. No account/content deletion, self-suspension, role chosen by the requester, or silent last-admin bypass. Restoration preserves an independently re-added membership rather than overwriting its newer role.
- A confirmed membership denial closes the current native workspace and conditionally clears only its matching live cached-viewer pointer. Other-account pointers and unsent SQLite work remain. Temporary network failures do not trigger this path.

## Verification

Automated tests and disposable PostgreSQL/SQLite fixtures cover reporter privacy, cross-organization isolation, forged request rejection, immutable retry receipts, local delivery failures, parallel queue flushing, rate limits, account cascade, manager authorization, last-admin rollback, self protection, restoration, other-team/report preservation and conditional cached-viewer removal. The PostgreSQL fixture uses PGlite only; it never connects to production.

Native iPhone 17 Pro/iOS 26.5 smoke test opened Settings → Content safety, entered harmless practice text and saved a practice safety report. The UI showed a local receipt and explicitly said nothing was sent to the team. Real-account delivery/admin review remains untested until an approved isolated deployment exists.

The same simulator opened Team access safeguards and confirmed that its load/access-change controls are disabled in local practice. Keyboard capture was restored to its original off setting after UI testing. Automated checks now include 161 mobile tests and 51 mobile-backend tests, plus both TypeScript checks and disposable migration fixtures; platform exports are recorded in the release audit.

## Not yet complete

- Photo/drawing moderation, broader abuse detection, personal abusive-user blocking if required for the final distribution model, moderation notifications/escalation, and a staffed response procedure. Admin suspension and the baseline text rules below do not prove complete guideline 1.2 compliance.
- Actual content/photo removal from the moderation inbox. Recording “action taken” does not execute deletion; the UI explicitly requires the administrator to perform and verify the action separately.
- Hosted migrations/backend deployment, cross-device reports/role tests, cold-relaunch revocation checks, real-device accessibility and Android/iPad runtime tests.
- Account erasure, approved retention/backup deadlines and operational ownership. Suspension is not a substitute.

## Local migration verification

Run from the repository root, with an isolated installed PGlite module:

```sh
node --import tsx --test apps/web/src/lib/mobile/*.test.ts
node apps/web/src/lib/mobile/verify-safety-migration.mjs /absolute/path/to/pglite/dist/index.js
npm run mobile:test
npm run mobile:typecheck
npm run typecheck
```

New migration files were generated with Supabase CLI, then tested only against disposable local fixtures. Hosted advisors cannot certify these unapplied migrations; run security/performance advisors after an approved preview deployment and resolve any findings before production.

## Baseline text filtering (local, October 18)

- Shared English profanity/slur rules run before native report sharing, submitted-report correction and signed relay. Signed relay still acknowledges an already-existing identical receipt; it never rewrites the signed payload. A rejected report remains on the original device for the author to correct/re-export.
- The matching SQL migration checks nested JSON string values in scouting reports plus team notes, shared/personal picklist notes and tier/tag names. It runs for direct authenticated writes and service-role mutations, so the website and direct Data API are not bypass paths once the migration is deployed. A legacy draft cannot evade the check with a status-only transition to submitted.
- Local saving/finalizing is independent of filtering. No text is silently redacted, deleted, sent to an outside classifier, or logged by the filter. Safety-report explanations are deliberately not filtered: members must be able to report/quote abuse.
- Unicode compatibility normalization, zero-width removal, basic leetspeak and separated letters are covered. Word boundaries avoid false positives in ordinary scouting terms. This is a limited deterministic English rule set, not semantic harassment/threat detection, complete multilingual filtering, OCR or an image classifier. New evasion patterns and false positives require review.
- Existing server rows and downloaded caches are not retroactively rewritten. SQL permits unchanged legacy notes during rank-only edits; new/revised shared text must pass. A production rollout needs a separately approved legacy-content review and cross-device verification.
- Photo auto-upload behavior is unchanged. The owner clarified that photos are automatically added; no manual approval queue or external moderation service has been enabled. Image moderation remains a release gate.

Verification: 165 mobile tests, 53 backend tests, both TypeScript checks, a disposable PGlite fixture exercising both database roles, iOS/Android/web exports and the website production Webpack build passed. Targeted backend ESLint had zero errors and six pre-existing warnings on unchanged declarations. Final native/live delivery tests remain separate. Final platform export directory: `/private/tmp/hal9000-text-filter-final-oct18` (iOS `entry-49a2f34914ea7378615e8ec5b62acfb8.hbc`, Android `entry-3457b6209a688320fe2f4e8f1a579790.hbc`). These are local exports, not shipped binaries.

```sh
node --import tsx apps/web/src/lib/mobile/verify-content-filter.mjs /absolute/path/to/pglite/dist/index.js
```
