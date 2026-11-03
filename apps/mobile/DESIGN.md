---
name: HAL9000 native
description: Current native scouting interface, extracted from implementation
colors:
  light-bg: "#eceef1"
  light-surface: "#ffffff"
  light-panel: "#e1e5ea"
  light-text: "#14171c"
  light-muted: "#5a6270"
  light-line: "#d5dae1"
  light-tint: "#14171c"
  light-on-tint: "#ffffff"
  light-selection: "#e1e5ea"
  light-success: "#007a3d"
  light-warning: "#9a5b00"
  light-danger: "#c4122f"
  light-red: "#d5001f"
  light-blue: "#0a4bdc"
  dark-bg: "#121418"
  dark-surface: "#1c1f25"
  dark-panel: "#262a31"
  dark-text: "#f2f4f7"
  dark-muted: "#9aa3b0"
  dark-line: "#2e333b"
  dark-tint: "#f2f4f7"
  dark-on-tint: "#14171c"
  dark-selection: "#2e333b"
  dark-success: "#4cc38a"
  dark-warning: "#f0b45a"
  dark-danger: "#ff7a8a"
  dark-red: "#ff5c6c"
  dark-blue: "#7aa2ff"
  light-graphite: "#2b3038"
  dark-graphite: "#3a404a"
  alliance-red-fill: "#d5001f"
  alliance-blue-fill: "#0a4bdc"
typography:
  heading:
    fontFamily: system
    fontSize: "20px"
    fontWeight: 700
    letterSpacing: "-0.3px"
  body:
    fontFamily: system
    fontSize: "15px"
    lineHeight: "22px"
  button:
    fontFamily: system
    fontSize: "16px"
    fontWeight: 700
rounded:
  input-choice: "12px"
  button-ios: "13px"
  card: "16px"
  button-android: "28px"
spacing:
  small: "8px"
  group: "12px"
  control: "14px"
  card: "16px"
  screen: "20px"
components:
  button-primary-light:
    backgroundColor: "{colors.light-tint}"
    textColor: "{colors.light-on-tint}"
    typography: "{typography.button}"
    padding: "14px"
  button-secondary-light:
    backgroundColor: "{colors.light-panel}"
    textColor: "{colors.light-tint}"
    typography: "{typography.button}"
    padding: "14px"
  card-light:
    backgroundColor: "{colors.light-surface}"
    rounded: "{rounded.card}"
    padding: "16px"
---

# Design System: HAL9000 native

## Overview

This records the React Native implementation after the Bumper redesign: team numbers are padded bumper tags (`TeamTag`), counters are alliance-coloured tiles where the whole tile adds one, and near-black ink is the action colour so red and blue only mean an alliance. Source authority is `src/core/context.tsx`, `src/components/ui.tsx`, `src/components/Screen.tsx`, native route layouts and the match-capture screen. `PRODUCT.md` records user-confirmed platform and brand constraints. No new metaphor or qualitative direction has been invented.

The interface is task-oriented: native navigation, system typography, blue action tint, readable form groups and large scoring controls. The earlier browser study in `docs/mobile-design` is reference material, not the native runtime.

## Colors

Primary actions use the `tint`/`onTint` pair; secondary actions use `panel` with tint text. Text, backgrounds, separators, selection and status colors come from the light/dark `Palette` objects. `red` and `blue` communicate alliance membership, not generic emphasis. QR content uses an explicit white background for scanner contrast.

The palette supports system, light and dark appearance. It is a fixed app palette, not automatic iOS increased-contrast colors or Android wallpaper-derived Dynamic Color; do not claim those integrations exist.

## Typography

The implementation leaves `fontFamily` unset, retaining platform system fonts. Frontmatter sizes are the source's React Native logical sizes, expressed in portable token notation; they are not a request to use fixed physical pixels.

Shared section headings, labels and button text use the roles above. Inputs and row titles use 16; row subtitles use 13 with line-height 19; input labels and choices use 14. Feature titles commonly use 26. Match totals use 54, weight 800 and tabular numerals. React Native font scaling is not disabled by these shared primitives. Large accessibility sizes still require runtime layout checks.

## Layout

The phone shell has four destinations: Today, Schedule, Outbox and More. Child tasks use Expo Router native stacks; the master scanner is modal. Screen content normally scrolls with 20 horizontal padding, 12 content gap and bottom padding derived from safe-area insets. Shared sections add 22 top spacing and 12 gap.

Match capture separates a scrolling form from a persistent bottom step selector/action. Auto and teleop use two equal-width scoring columns. Choice groups generally wrap. Comparison tables intentionally scroll horizontally rather than squeezing all values into phone-width columns. These are observed patterns, not verified tablet adaptation: iOS tablet support is disabled and app orientation is portrait.

## Elevation & Depth

Shared cards and controls are flat. Depth comes from the background/surface/panel layers, selection fills and hairline dividers rather than custom drop shadows or glass effects. Navigation transitions and header materials are supplied by the native navigation library.

## Shapes

Cards use rounded rectangles; inputs and choices share gentler corners. Primary/secondary buttons have a rounded iOS treatment and a more pill-shaped Android treatment. Native row dividers are hairlines. Exact reused radii are in the frontmatter.

## Components

- Buttons: minimum height 52, 14 padding, optional icon, Android ripple, press opacity 0.8 and disabled opacity 0.45. Labels and button role are exposed to assistive technology. Large-text wrapping remains a review item.
- Choices: minimum height 52, 12 padding, one-point border; selected fill and border use `selection`/`tint`. Selected state and label are explicit.
- Cards: surface fill, 16 padding/radius, 12 internal gap; no shared shadow.
- Inputs: labeled native TextInput, surface fill, line border and tint selection. Minimum height 52; multiline fields start at 100 and align text at the top.
- Rows: minimum height 68, 14 vertical padding, title/subtitle hierarchy and optional trailing content. Interactive rows expose a button role.
- Navigation: four native tabs, native stack headers/back navigation, platform-specific Ionicons/MaterialIcons. Icons are not currently SF Symbols.
- Scoring: large +1 tiles, separate scored/ferried totals, +10 actions, direct numeric correction and bounded undo. Saved-on-device feedback is distinct from network availability.
- Drawing: normalized field coordinates, native Gesture Handler canvas, explicit pen selection and Undo/Clear controls. Actual gesture behavior is a separate runtime verification requirement.

## Do's and Don'ts

- Do reuse `Palette` roles and shared native controls rather than adding unrelated one-off colors.
- Do preserve separate scored/ferried values and permanent report identities.
- Do retain native navigation, safe-area spacing, font scaling and explicit local/practice/backup states.
- Do distinguish local persistence, draft backup and confirmed cloud delivery in copy.
- Don't substitute a WebView or the old HTML prototype for this native app.
- Don't turn alliance red/blue into decorative button themes.
- Don't infer camera, accessibility, large-text, Android or live-backend correctness from static screenshots or exports.

No `.impeccable/design.json` preview sidecar was generated in this bounded documentation pass; the requested deliverable is factual native Markdown, not synthetic web component previews or invented tonal ramps.
