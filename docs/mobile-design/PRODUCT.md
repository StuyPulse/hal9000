# HAL9000 mobile

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

## Stack

React Native, Expo, TypeScript; reuse the existing Supabase backend and packages/shared. This folder contains a browser-based interaction prototype for reviewing the native design, not the production mobile app.

## Users

StuyPulse match scouts enter observations during FRC matches. Master operators collect offline submissions through QR relay. Strategists consume the synchronized data on the existing website.

## Product Purpose

Capture accurate scouting data quickly and retain it through connectivity loss, app restarts, and relay to another device.

## Operating Context

Competition stands; attention is primarily on the field. Devices download the event package and sign in before going offline. Online and offline use share one workflow.

## Capabilities and Constraints

- Local SQLite saves precede networking; permanent client UUIDs survive retries and relay.
- Dynamic, versioned forms reuse shared validation; season controls do not become permanent database columns.
- Master access is authorized through database roles. QR checksums detect corruption but are not proof of scout identity; the production relay requires server authorization and provenance validation.
- Photos upload separately from QR data.
- No live database writes, real camera scanning, or cloud synchronization occur in this design prototype. All example event, match, and count values are illustrative.
- Confirmed: native mobile appearance for BOTH iOS and Android, with controls suitable for mobile use. Android is a first-class target.
- Assumption for this design: include Scout and Master flows.

## Brand Commitments

Current repository name is HAL9000. Preserve StuyPulse identity through the HAL red eye. Use blue for actions and reserve red/blue primarily for alliance labels. Use native platform navigation and system typography on both iOS and Android.

## Product Principles

- Preserve work before asking the scout to move on.
- Keep match and team identity visible during entry.
- Distinguish saved on device, received by Master, and confirmed in the cloud.
- Make routine match entry reachable with few taps.
- Keep administrators' setup work on the existing website for the initial mobile release.
