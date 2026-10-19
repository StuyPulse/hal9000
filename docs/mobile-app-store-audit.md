# App Store readiness audit — October 18, 2026

**Verdict: do not submit for public App Review yet.** Source fixes are local. There was no push, deployment, account deletion, privacy-questionnaire submission, legal acceptance or public release.

## Latest safety implementation pass

- 161 mobile tests, 51 mobile-backend tests, both TypeScript checks, diff checks and disposable PGlite migration fixtures passed. Fixtures verify privacy, org/role checks, quotas, retry identity, self/last-admin protection, rollback and restoration; native cache-pointer SQL is exercised against in-memory SQLite.
- iOS/Android Hermes and Expo-web exports passed at `/private/tmp/hal9000-release-safety-verified-oct18`.
- Next.js production build passed with `--webpack`, including both new API routes. Default Turbopack first hit restricted font fetches, then a local process/port permission panic; it is not recorded as a passing Turbopack build. No hosting deployment occurred.
- iPhone 17 Pro/iOS 26.5 practice smoke test saved a harmless safety concern locally with an explicit no-delivery receipt and verified team-access controls are disabled in practice. Real-account moderation/suspension, two-device QR, Android/iPad and full accessibility testing are still outstanding.
- [Privacy disclosure draft](mobile-privacy-disclosure-draft.md) and [content-safety status](mobile-content-safety.md) are local review artifacts. Retaining names, deletion scope, completion deadline and response ownership remain unresolved; "90 days?" was not silently published as a promise.
- Neither new migration was applied to production. All source changes are still local/uncommitted; no new native build was submitted.

## Release blockers and owner decisions

| Priority | Finding | Status / next step |
| --- | --- | --- |
| P0 | Account creation exists, but in-app account deletion does not. Email-only deletion does not satisfy the ordinary-app requirement. | Local-only implementation was authorized, then the owner requested retaining names instead of approving shared-content scrubbing. "90 days?" remains tentative; the operational owner is unset. No live deletion, destructive pipeline or published deadline. Resolve the [retention decisions](mobile-retention-review.md) before enabling erasure. [Apple guidance](https://developer.apple.com/help/app-review/guideline-reference/5-1-1-account-deletion). |
| P1 | Public privacy text omits mobile cache/photo/device-key details and a concrete retention/deletion policy. | Draft review only; public legal text was not silently changed. Publish an accurate owner-approved policy after the deletion workflow exists. |
| P1 | App Store Connect privacy labels, current age-rating answers, distribution/compliance answers and public screenshots were not certified. | Owner must review actual answers; native privacy manifests do not replace the App Store questionnaire. Use fictional/sample data for screenshots. [Privacy details](https://developer.apple.com/app-store/app-privacy-details/). |
| P1 | Google login; organizational-account exception awaits assessment. | Owner confirmed existing team-issued `@stuypulse.com` accounts and chose **Keep team-account login**. The [prepared review explanation](mobile-login-review-notes.md) requests guideline 4.8 assessment and discloses approved personal-email exceptions. App-profile creation alone does not rule out the exception. Apple has not accepted it; no Apple button, fake waiting page or login behavior change was added. [Review guidelines, 4.8](https://developer.apple.com/app-store/review/guidelines/#login-services). |
| P1 | Shared-content safeguards are not yet fully release-verified. | [Local safety workflow](mobile-content-safety.md) now includes offline-first reporting, private moderation status and reversible admin team-access suspension. Tests cover privacy, org isolation, retry identity, last-admin protection and role restoration. Migrations/API are not deployed. Filtering, any required personal blocking, response ownership and deployed end-to-end tests remain open; no claim of complete guideline 1.2 compliance. [Review guidelines, 1.2](https://developer.apple.com/app-store/review/guidelines/#user-generated-content). |
| P1 | Device and multi-device testing remains incomplete. | Test the final release binary on real iPhone/iPad, both landscape directions, large accessibility text, VoiceOver, software keyboard, camera denial/recovery, offline cold launch/reconnect and two-device signed QR relay. Android runtime remains a separate delivery gate. |
| P1 | Native permissions/privacy changed. | A new native build is needed; OTA cannot remove binary permissions. Inspect the final IPA/SDK/privacy manifests after EAS builds it. |
| P2 | HAL9000 branding and field-art redistribution rights were not verified. | Team must confirm asset permissions before public distribution. |

## Corrections completed locally

Follow-up fixes (October 18): staged-photo removal now unlinks its exact app-owned file, keeps its row on unlink failure for retry, and rejects paths outside the selection workspace. Moving a selection into the upload queue keeps its UUID so retrying cleanup cannot create duplicate uploads or reset a synced photo. Photo-screen callbacks are guarded by account/event generation and unmount state; rapid actions are locked. Large-text controls stack in login/settings/photo selection and match counters; action footers and the practice notice scroll rather than pinning over forms. Native Text remounts when font scale changes to avoid stale measured heights. The navigation Back control uses a labeled icon at large sizes rather than clipping oversized text.

Follow-up checks: 154 mobile tests passed, including file ownership, removal retry, photo queue idempotency/destination isolation and large-text footer geometry. A live iPhone 17 Pro/iOS 26.5 simulator check exposed stale text measurement at the largest text setting; after the remeasurement fix, Settings text wrapped and the Back control was visible without clipping. Text size was restored to its original value. This is a bounded Settings smoke test, not certification of every screen, VoiceOver or native file deletion/camera capture.

Final follow-up source checks: mobile TypeScript and `git diff --check` passed. Final iOS/Android Hermes and Expo-web exports passed at `/private/tmp/hal9000-store-fixes-final2-oct18`. Expo-web export is not a build or deployment of the separate Next.js website. Changes remain uncommitted and local; no new native binary was built or submitted.

- Declared account name/email/user ID, optional registered relay-device ID, photos and other authored content in the Expo iOS privacy manifest: linked to the account, app functionality only, no tracking.
- Removed unused microphone and Face ID declarations through their actual SDK config plugins, blocked Android microphone permission, and made the camera purpose string cover QR scanning and pit photography.
- Removed the global 1.35× cap on Dynamic Type; enlarged photo removal and Home/outbox targets.
- Scanner camera unmounts when its screen loses focus or the app backgrounds; torch is unavailable without permission. Permanent denial offers system Settings, and camera mount errors have recovery copy. Photo capture also offers Settings after denial.
- Added accessible support, policy and terms controls in Settings. Support remains `se@stuypulse.com`; no messages were sent.
- Backported the official 0.5.0 URL-decoder fix into CommonJS with upstream MIT attribution, and directed Metro to it. Regression tests exercise the resolver, query parser, malformed-input completion and bundled license notice.

## Dependency/security findings

`npm audit --omit=dev` reported 30 affected dependency nodes (19 high, 11 moderate), stemming from four advisories—not 30 independent app vulnerabilities. No force fix or Expo downgrade was applied.

| Advisory | Assessment |
| --- | --- |
| [URI decoder malformed-input denial of service](https://github.com/advisories/GHSA-vcc3-ghjq-m6fr) | Fixed in generated mobile bundles via the licensed CJS backport. Both exported source maps contain only `/vendor/decode-uri-component/index.cjs`, not the vulnerable npm decoder. Tooling's npm graph still contains the old dependency, so audit is not clean. |
| [braces nested-pattern exhaustion](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) | No published fixed version found; current registry latest 3.0.3 is affected. Build/tool dependency; absent from both native source maps. Keep development services private and monitor upstream. |
| [node-forge signature verification](https://github.com/advisories/GHSA-86w9-cpqp-85rv) | Registry latest 1.4.0 remains affected. Certificate/build tooling; absent from both native source maps. Use trusted signing inputs; reassess when patched. This does not certify native update signature verification. |
| [uuid buffer bounds](https://github.com/advisories/GHSA-w5hq-g745-h8pq) | Affected uuid 7 belongs to the Xcode-project generator. Do not force a major replacement into that tool without compatibility tests. The vulnerable npm package is absent from native source maps; Expo's separate uuid implementation is not that package. |

Mobile/shared source scan found no service-role/secret-key references matching the targeted patterns; this is not a complete secret-history or penetration audit. Roles remain server/RLS-derived and no privileged key was introduced.

## Verified this pass

- Mobile TypeScript, 144 mobile tests, 3 scene-delegate plugin tests and `git diff --check` passed. The decoder tests also verify that Metro watches the vendored files for development resolution.
- Both iOS and Android Hermes exports passed; maps prove the decoder redirect.
- Expo config introspection produced only camera/photo-library iOS purpose strings: no microphone or Face ID. Android microphone entry is a manifest removal rule, not a requested permission.
- Offline Expo dependency alignment check passed (uses SDK's bundled map, not the online version endpoint).
- App icon is PNG, 1024×1024, without alpha; listing field length/HTTPS tests pass.
- Public `/privacy`, `/terms` and `/api/mobile/capabilities` returned HTTP 200. Capability flags report configured; this is not role-by-role mutation testing.
- Reviewer account remains confirmed, with exactly one `strategist` membership in `HAL9000 App Review Demo`. No live-team membership or admin grant.
- Read-only EAS lookup: version 1.0.0 build 4 is in internal **and external beta testing**. No live App Store version, public review or pending release. That build does not contain these uncommitted fixes.
- Native iPhone 17 Pro/iOS 26.5 debug smoke test launched in isolated local practice; More → Settings exposed the new support/privacy controls and opened the bundled MIT notice. After adding the vendor watch folder and restarting Metro, native reload succeeded without the intermediate development-resolution error. This is not a test of the rebuilt permission manifest or live-account deletion.

## Native technical audit (provisional source assessment)

This is not Apple's scoring system, nor an on-device accessibility certification.

| Dimension | Score / 4 | Main limit |
| --- | --- | --- |
| Accessibility | 2 | Labels/native controls exist and scaling/targets improved; VoiceOver and maximum-size runtime checks remain. |
| Performance | 2 | Long tables/lists render many rows without virtualization; large real-event stress testing pending. |
| Appearance/theming | 3 | Shared light/dark semantic palette; some special-purpose hardcoded colors. |
| Platform conformance | 3 | Actual Expo/native navigation, not a WebView wrapper; review focus/Back/keyboard/permissions on final binary. |
| Adaptivity | 3 | Landscape corrections and geometry tests exist; full tablet/split-window/device matrix incomplete. |
| Total | 13 / 20 | Significant release-verification work remains. |

Recommended skill follow-through after owner decisions: `$impeccable harden` for lifecycle/error states, `$impeccable adapt` for final device matrix, `$impeccable audit` for screen-reader results, then `$impeccable polish`. These are recommended next passes, not claimed completed device tests.

## Public release checklist

- [x] Save owner-confirmed age and third-party content-rights answers. Age rating uses a 9+ override; seven-category privacy draft is saved but unpublished. See [questionnaire status](mobile-app-store-questionnaires.md).
- [ ] Approve retention policy, implement/delete disposable account with all associated data and files, test retries and reconnects.
- [ ] Resolve login-service exception/Apple-login decision and shared-content moderation requirements.
- [ ] Publish correct privacy text; complete App Store Connect privacy/age/compliance information without guessing.
- [ ] Capture actual app-in-use screenshots with sample identities on supported display classes.
- [ ] Verify asset rights and support ownership.
- [ ] Build with an Apple-accepted Xcode/SDK, inspect the resulting archive and privacy report, then finish device testing. Current minimum upload baseline is Xcode 26/iOS 26 SDK or later; verify it again at release time. [Apple requirement](https://developer.apple.com/news/upcoming-requirements/?id=04282026a).
- [ ] Populate review notes with current workflow instructions and isolated reviewer login in Apple's secure review form only. Never commit the password.
- [ ] Obtain approval to push/deploy/build/submit; do not equate successful export or TestFlight beta testing with public App Store approval.
