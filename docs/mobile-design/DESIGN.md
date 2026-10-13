# HAL9000 mobile design — revision 2

Final interaction checks passed for editable scored/ferried totals after reload, last-action Undo, full category/timestamp/description breakage review, no-show, local persistence, and simulated delivery. Both iOS/Android and light/dark renders were inspected. A separate finish review marked the count-correction and breakage-review findings resolved.

Native mobile design for BOTH iOS and Android. The user rejected the initial sparse iOS-only direction. Revision 2 uses a compact scouting console and platform-aware components.

## Visual direction

System typography, compact assignment information, large capture controls. The HAL eye carries brand red; red and blue identify alliances. Blue drives functional actions. Light and dark appearances are independently designed. No assumed timers or automatic phase advancement.

iOS dark tokens: background #10151d, surface #1b222d, panel #202b3a, text #f2f5fa, secondary #a2adbd, divider #303947, action #b9cbff. Android dark: background #12141b, surface #20232e, panel #262b38, selected #303e60, action #bacaff. Light: background #f8f9fb, surface #fff, panel #eef2f7 (Android #eef0f7), text #171d28, secondary #626e7e, divider #dce2e9, action #244bc1.

## Platform differences

iOS uses text-plus-chevron Back, compact tab icons, filled period segments and iOS switches. Android uses arrow Back, Material-style navigation indicators, underline tabs, rounder filled buttons/tonal surfaces, outlined switches and 48px touch targets. Preview platform/appearance controls are available at desktop and phone widths. Real OS Back, cutout/keyboard insets, native symbols, haptics and font scaling require Expo implementation.

## Capture design

The next assignment is dominant: qualification label, team, explicit alliance/station, form version, Start/Resume. Compact upcoming rows and event readiness follow. Match entry retains identity, local-save state and connection state. Big tap-to-add tiles, batch additions and separated Undo support quick entry. The last five capture changes can be undone during this browser session. Manual phases sit in the bottom thumb zone. Review precedes local save.

## Current product alignment

The actual web REBUILT v4 form distinguishes scored and ferried counts in BOTH Auto and Teleop. It includes pre-match starting position/no-show, fouls, defense level/defended teams, multiple breakage issues with timestamps and comments. It does not have collection source or tower climb. website-parity.js now presents these actual field meanings through Setup/Auto/Teleop/Details, uses the existing field reference image, and shows the permanent prototype UUID in review. Current website source saves scouting_entries, while older architecture prose still references match_submissions. This remains a design study rather than a production payload implementation.

## Delivery and limits

Prototype drafts persist in browser localStorage; camera, relay QR and cloud acknowledgment are simulated. Local save, pending delivery, Master receipt and cloud-confirmed revision are different states. Edits clear stale acknowledgment. The native app requires SQLite-first transactions, shared versioned form contracts, server-authorized relay provenance, revision conflict handling and private separate photo queues.

Use apps/mobile React Native + Expo + TypeScript and packages/shared. Verify live schema/authorization before connecting production. Sync on foreground/reconnect/manual retry; neither OS guarantees background delivery. Protect cached data on sign-out/account switch, pin form versions and retain unsynced work through event updates. Run two-device airplane-mode/restart/relay/reconnect checks plus actual screen-reader, font scaling, keyboard and Back tests.

## Claude consultation

Claude's initial advice was based on a written description. It has now received a fuller website brief verified from current source: navigation, actual v4 fields, queue behavior, roles, shared contracts, TBA identity rules, pit/photo coverage, global document and strategist workflows. No credentials or private production records were sent. See CLAUDE-ADVICE.md for the consultation link.
