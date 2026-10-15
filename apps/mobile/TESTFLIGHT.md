# HAL9000 Scout — beta release

## October 14 release record

- Version 1.0.0, iOS build 4; native source includes main e05fac5.
- Expo build: https://expo.dev/accounts/stuypulseit/projects/hal9000/builds/595b985b-d43c-4162-b5e7-00650dfad7b4
- Scheduled submission: https://expo.dev/accounts/stuypulseit/projects/hal9000/submissions/e1b844dc-b1e2-4e21-be30-d60a21ef6f89
- Public metadata was uploaded and read back successfully. Title, subtitle, description, keywords, promotional text, marketing/support/privacy URLs, and categories persisted.
- Expo's optional automatic TestFlight changelog rejected the current plan (Enterprise-only). The same build was submitted without that option; no upgrade or duplicate build was started. Tester notes remain below.
- Build/submission completion and Apple processing must be checked separately; scheduling is not availability.

App Store Connect app: 6822367941. Expo project: @stuypulseit/hal9000.
Release uses production EAS Build followed by EAS Submit; no public App Store review/release is requested.

## Existing assets

Reuse assets/icon.png: 1024 × 1024 PNG with no alpha. Keep the existing Android adaptive foreground/background, splash artwork, and favicon. The store icon is delivered inside the native binary, not through EAS Metadata.

## What to test

Updated mobile interface, offline workspace reliability, and landscape support.

1. Sign in while connected and allow the active event to download. Confirm teams, matches, assignments, and existing reports appear.
2. Disconnect, reopen the app, switch between previously downloaded events, and create/reopen match and pit drafts. Never sign out or delete the app to test offline access.
3. Submit an offline report and edit picklist notes/order. Reconnect and verify delivery without duplicates or disappearing reports. Conflicting shared changes must remain queued with an explanation.
4. Let pit photos download online, then reopen them offline. New photos upload after reconnecting.
5. Rotate the phone both landscape directions with system Rotation Lock off; check forms, Summary tables, and Picklist. Also test an iPad if available.
6. Review updated navigation, team photos, embedded global document, backup export, and last successful sync time. Third-party documents require connectivity.

Send problems to se@stuypulse.com with device, iOS version, screen, steps, and whether a connection was available. Do not send passwords or private scouting exports.

## Known beta verification limits

Automated checks and platform exports are not device certification. Authenticated offline cold launch/reconnect, persistent cloud-photo reopening, two-device signed QR relay, and Android runtime remain explicit test gates. Picklist conflict checks are preflight checks, not atomic server compare-and-swap.

## Store metadata

store.config.json contains public listing copy only. Existing legal/advisory answers, review contacts/credentials, tester groups, and automatic-release settings are intentionally not changed. Public App Store screenshots and complete privacy/age-rating declarations are separate from TestFlight binary upload and must be verified before any public release. The support URL currently uses the public privacy/contact page, which lists se@stuypulse.com.
