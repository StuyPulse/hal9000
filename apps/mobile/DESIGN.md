---
name: HAL9000 native
description: Current native scouting interface, extracted from implementation
colors:
  light-bg: "#f8f9fb"
  light-surface: "#ffffff"
  light-panel: "#eef2f7"
  light-text: "#171d28"
  light-muted: "#626e7e"
  light-line: "#dce2e9"
  light-tint: "#244bc1"
  light-on-tint: "#ffffff"
  light-selection: "#e6edff"
  light-success: "#237443"
  light-warning: "#895214"
  light-danger: "#ac2038"
  light-red: "#a92438"
  light-blue: "#24589f"
  dark-bg: "#10151d"
  dark-surface: "#1b222d"
  dark-panel: "#202b3a"
  dark-text: "#f2f5fa"
  dark-muted: "#a2adbd"
  dark-line: "#303947"
  dark-tint: "#b9cbff"
  dark-on-tint: "#15284d"
  dark-selection: "#253653"
  dark-success: "#84d8a8"
  dark-warning: "#f0c377"
  dark-danger: "#ff9caa"
  dark-red: "#ff9daa"
  dark-blue: "#9fbfff"
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

This records the existing React Native implementation, not a proposed replacement identity. Source authority is `src/core/context.tsx`, `src/components/ui.tsx`, `src/components/Screen.tsx`, native route layouts and the match-capture screen. `PRODUCT.md` records user-confirmed platform and brand constraints. No new metaphor or qualitative direction has been invented.

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
