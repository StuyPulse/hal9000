# HAL9000 website audit — 2026-10-11

Scope: current main checkout, server actions/authentication, dependency advisories, match statistics/imports, and read-only production UI/database checks. Fixes are local, not deployed. This is a targeted audit, not a guarantee that every feature is bug-free. No production scouting data was created, edited, or deleted during testing.

## Verified findings and local fixes

1. **Data-loss safeguards missed the current reports table.** Event deletion checked legacy `match_submissions` while current `scouting_entries` can cascade on event deletion. Manual-event match deletion could detach submitted reports, and team edits could change their match identity. Actions now check current and legacy reports, protect event drafts/photos and completed assignments during lineup edits, fail closed on lookup errors, and detect zero-row mutations. Match edits preserve scores and completion. Team removal protects existing reports/photos. Evidence: action/FK inspection; alliance identity regression tests. No destructive live proof was attempted.
2. **Auth redirects discarded updated cookies.** Callback failures and proxy redirects created a new response instead of retaining cookies written by Supabase. Redirects now copy refresh/cleared cookies and remove one-time codes and untrusted return-query values. Evidence: two redirect-response tests, including cookie-clear attributes. Real Google sign-in/session expiry was not exercised.
3. **Scored fuel totals included ferrying and had inconsistent legacy fallbacks.** Headline totals now use scored fuel, with ferry metrics separate; explicit zero remains zero even with stale legacy fields. Tests cover modern and legacy values and competitive scheduled/manual filtering versus practice.
4. **Published TBA scores could still display scheduled status.** Both nonnegative alliance scores now mark a match played even when result timestamps are missing. A zero-zero regression test covers this case. Existing tests also cover idempotent imports and preserving manual results when TBA only has a schedule.
5. **Dependency advisories.** Patched Next.js and its ESLint config to 16.3.8, Sharp to 0.35.5, and compatible source-map-js/brace-expansion lockfile versions. Production dependency audit is now zero findings. Published RCE/SSRF prerequisites were not found in the application; this is advisory remediation, not evidence of exploitation. Sources: https://github.com/vercel/next.js/security/advisories/GHSA-vcvr-r3jv-pc5j and https://github.com/lovell/sharp/security/advisories/GHSA-wq5f-xc86-pv6w.

These application findings were verified as correctness/data-integrity failures, not demonstrated unauthorized attacker exploits; exploit CVSS scores are therefore not assigned.

## Verification

- All 35 tests passed (28 existing plus 7 added).
- Production build and TypeScript checks passed with Next.js 16.3.8.
- ESLint: zero errors, 180 existing warnings; warnings are not represented as fixed.
- `git diff --check` passed.
- `npm audit --omit=dev`: zero vulnerabilities.
- Full dependency audit: nine affected developer-tooling package nodes remain (seven high, two moderate); these are not nine demonstrated website exploits.
- Live database checks: active event NYC Robo Replay has 25 teams and 56 matches; zero negative saved final scores, zero scouting entries missing their event-team link, zero cross-event match-entry references.
- Signed-in production Email access page renders its form and existing exceptions. Latest pre-audit deployment completed successfully. These local fixes are not present in that deployment.
- Destructive admin actions and real form submissions were not exercised in production; mocked/pure tests and source review do not replace a full staging submission test.

## Remaining risks / follow-up

- **Concurrent submission race:** report preflight checks and match/event mutations are separate database calls. A submission arriving between them could still race. Transactional database guards/RPCs and concurrency tests are needed for atomic protection; current action safeguards do not eliminate this window.
- **Developer dependencies:** braces has no published patch; Tailwind 3's selector-parser chain needs a separately tested major toolchain migration. Avoid force-fixing/downgrading framework dependencies. Advisory: https://github.com/advisories/GHSA-vfj7-8cjw-p6xm.
- **Supabase configuration:** advisors warn that leaked-password protection is disabled and pg_net is installed in public. Investigate feature availability and extension relocation compatibility before changing auth/network infrastructure. Private authorization tables and the Slack notification queue intentionally have no client policies.
- Broad legacy `any` types, ordinary image elements, and other lint warnings remain maintenance work. Mobile drawing, upload compression, Slack delivery, and every role/form combination were not fully retested in this targeted pass.
