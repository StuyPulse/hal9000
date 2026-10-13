# Native verification and finish review

Recorded October 13, 2026. Scope: source review plus the saved iOS screenshots; this document does not certify production readiness. No deployment, hosted migration or live data mutation was performed by this review.

## Evidence levels

| Area | Evidence | What it establishes |
| --- | --- | --- |
| Native type safety | `npm run mobile:typecheck` passed during queue integration | Current native source typechecks; not runtime correctness |
| Pure logic | `npm run mobile:test`: 72 passed, zero failed during that integration | Revision guards, queue eligibility, relay signatures/frames, auth models, setup models and feature computations have automated coverage |
| Bundling | Main implementation reports successful iOS, Android and web Expo exports from earlier checkpoints | Those checkpoints bundled; final exports must follow subsequent edits |
| iOS local capture | Main implementation observed Expo Go on iPhone 17 Pro / iOS 26.5: score correction to 7, ferried 1, review, local submit and reopened saved report | The tested local-practice capture path persisted one permanent ID |
| Saved images | `ios-auto.png`, `ios-report-qr.png`, inspected in this review | Light-mode native capture layout and report/QR section at one phone size; not all screens or font sizes |
| Migration | Server agent reports isolated PostgreSQL/PGlite migration tests | Local SQL behavior only; the migration remains unapplied to hosted Supabase |

The local-practice report observed by the main implementation had permanent ID `76fd8bba-c09c-4909-bc5d-d2b20eb526d5`. Practice is explicitly labeled and does not upload to production. Screenshot content predates some current signed-relay copy and navigation changes.

## Native conformance verdict

The inspected app is a React Native interface, not a website in a wrapper. Native stacks/tabs, safe-area handling, TextInput, platform icons and large capture targets establish a credible mobile foundation. Full conformance remains provisional: this pass did not drive the simulator, screen reader, font settings or Android runtime.

Source-informed scores, not device measurements:

| Dimension | Score / 4 | Finding |
| --- | --- | --- |
| Accessibility | 2 | Shared controls have labels/roles and scaling is enabled; long-label wrapping, canvas accessibility and VoiceOver/TalkBack remain unverified |
| Performance | 2 | Local-first queues are bounded by scope/revisions; feature lists render inside ScrollView rather than virtualized lists, with no measured frame/startup profile |
| Appearance/theming | 3 | Coherent light/dark role palettes; dark screenshot and increased-contrast testing still missing |
| Platform conformance | 3 | Native navigation/controls; Android color-picker targets fall below 48dp |
| Adaptivity | 2 | Phone safe areas and horizontal comparisons exist; narrow-width QR layout and large-text headers require correction/testing |
| Total | 12 / 20 | Source-only assessment: significant release verification remains |

## Prioritized findings

1. **P1 — QR can exceed narrow phone content width.** `apps/mobile/app/submission/[id].tsx` uses QR size 265 plus 32 container padding and the Screen's 40 horizontal padding: total required width 337. At 320 logical width this does not fit. Measure the card's available width and preserve a white quiet zone; confirm a complete readable code on the narrowest supported phone. This is a source-derived width calculation, not a reproduced scan failure. Suggested pass: Impeccable adapt.
2. **P2 — Raw payload dump buries the handoff task.** The same report screen maps every key, including null compatibility fields and JSON objects, ahead of QR. The saved report screenshot visibly shows several empty rows before QR starts. Show a meaningful scouting summary and move raw payload to an expandable/exportable detail area without dropping information. Suggested pass: Impeccable clarify/layout.
3. **P2 — Long names/large text have unconstrained horizontal layouts.** `src/components/ui.tsx` places Button text in a horizontal row without shrink/wrapping constraints. `app/match/[id].tsx` places an unconstrained team title beside the REBUILT label. Long team names, long action labels or accessibility font sizes can exhaust available width. Add wrapping/shrinkable text and preserve growing height; verify with large fonts rather than disabling scaling. Suggested pass: Impeccable adapt.
4. **P2 — Android color choices have undersized hit areas.** `src/features/StrategyViews.tsx` tier/tag color picker uses 44×44 targets. Increase interactive footprint to at least 48×48 on Android while retaining the intended visible swatch. Suggested pass: Impeccable harden.
5. **P2 — Long event lists have no virtualization.** Feature Page/Screen wrappers use ScrollView and team/report sections map children eagerly. Measure realistic full-event rosters/history on a low-end Android device before deciding which lists should use FlatList; avoid claiming measured jank from source alone. Suggested pass: Impeccable optimize.

No P0 was reproduced. Two screenshots cannot establish the absence of other blockers. Shared 52-height buttons/choices/inputs, 68-height rows, explicit selected labels, separate scoring totals, local-save notices and practice isolation are patterns to preserve. Finish with one bounded Impeccable polish confirmation after the actionable fixes.

## Still unverified / release gates

- Final iOS/Android/web exports after all agents' changes; final full native/web tests and typechecks.
- Android emulator/device runtime, system/predictive Back, IME behavior and low-end performance.
- Dark mode, narrow phone widths, long team names, maximum font scaling, VoiceOver/TalkBack order/states and increased contrast.
- Offline cold launch/reopen after event download, airplane-mode capture and reconnect delivery using an authenticated test account.
- Real Google OAuth/custom native redirect, account creation/recovery, account/organization switching and role-by-role permissions.
- Dedicated installed native build rather than Expo Go for custom-scheme OAuth and distribution behavior.
- Camera/photo permission denial/recovery, physical-device capture and private-photo upload/download behavior.
- Registered-device signed relay with two devices, all frames, tampering/revocation rejection and exactly one server record after retry.
- Drawing gestures in pit/strategy after scroll gesture arbitration changes. Pure SVG/stroke tests alone are insufficient.
- Live bearer-auth mobile endpoints, submitted corrections/deletion, manual-match identity edits, setup/invites/email-access and TBA imports after approved deployment.
- Hosted application of the new migration and Auth redirect configuration after authorization; no service key belongs in native code.
- TestFlight/internal Android installation, real app icon/distribution credentials, and dependency vulnerability review.

Implementation progress is tracked in `docs/mobile-feature-matrix.md`; initial feasibility tags there are not proof of a completed or deployed feature.
