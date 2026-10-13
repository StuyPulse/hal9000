# HAL9000 native

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

## Users and Purpose

StuyPulse scouts capture FRC observations in competition stands. Strategists use those reports for comparison, picklists and match strategy. Master operators retain QR receipts when connectivity is poor.

## Stack and Operating Context

React Native, Expo, TypeScript, SQLite and the existing Supabase backend. Native controls for both iOS and Android. This is the real mobile implementation; `docs/mobile-design` is the earlier interaction study.

## Confirmed Constraints

- One workflow online and offline; preserve reports locally before networking, with permanent UUIDs.
- Both platforms are first-class targets, with native navigation, safe areas and font scaling.
- Match, pit, pre-scout, photos and strategist features follow current website source. Do not substitute obsolete architecture prose for current schema.
- User explicitly requested implementation of missing features and two-way Claude collaboration. Setup tools extend the previous initial-release scope.
- Database roles and RLS are authoritative. No service key or unverified Master upload authority in the app.
- Local practice is labeled and isolated from live organization data.
- Do not push, deploy, or change live database state without further authorization.

## Brand Commitments

HAL9000 and StuyPulse identity; system typography and platform-aware controls. Blue is the action tint; red and blue identify alliances.

## Evidence

Current website and migrations, `docs/mobile-feature-matrix.md`, native source, and the user-confirmed iOS/Android interaction study. Build/test success is not evidence of live auth, camera or two-device QR reliability.
