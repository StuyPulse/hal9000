# Native landscape corrections — October 17, 2026

Scope: native Expo app, not the old browser prototype. No website, schema, permissions, sync contracts or production records changed.

## Findings and fixes

| Finding | Correction |
| --- | --- |
| Both screen implementations ignored horizontal safe areas. | One shared native screen shell applies left/right cutout insets, consistent gutters and keyboard avoidance using the actual navigation header height. |
| Persistent action footers consumed scarce landscape height. | On short windows, form actions join the scroll flow; portrait retains the persistent action. |
| Width-only breakpoints squeezed controls beside cutouts and at larger font sizes. | Layout uses safe width and font scaling, with a separate compact-height rule. |
| Match starting-position field stretched to an arbitrary 300-point height; labels overlapped. | Preserve field aspect ratio, bound its height, and pair numbered markers with full-size labeled selection buttons. The stored position values are unchanged. |
| Auto and teleop wasted landscape width. | Two columns when safe width and font scaling permit; single column on narrow windows. |
| Drawing fields grew with screen width beyond a short window. | Fit the actual measured container and available height, preserving the field ratio and normalized drawing coordinates. |
| Memoized drawing gestures captured stale persistence callbacks. | Invoke current callbacks through refs so rerenders do not save using an old closure. |
| Summary toolbars could leave a zero-height table. | Short windows scroll the whole screen and retain a bounded, independently scrollable table/card area. |
| Rotating a horizontally scrolled table could leave its header past the new scroll limit. | Clamp the horizontal offset on resize/column changes and scale row/header heights with text size. |
| Large landscape robot photos dominated the screen. | Bound pager height and contain the complete robot image. Photo-grid widths now account for gaps explicitly. |
| Scanner preview pushed its controls below a short window. | Height-bounded preview; camera and controls are side by side when usable width permits. |
| Global-document link editor was in a non-scrolling screen. | Scroll the editor, including with the keyboard open; retain the flex document reader otherwise. |
| Login had fixed portrait top spacing. | Use the actual top safe area and shorter spacing in compact-height windows. |

## Verification

- Pure geometry tests cover compact portrait/landscape, both cutouts, tablet widths, split windows, font scaling and field proportions.
- `npm run mobile:test`: 137 passed, 0 failed. `npm run mobile:typecheck` and `git diff --check`: passed. Expo iOS and Android Hermes bundle exports: passed.
- Native iPhone 17 Pro / iOS 26.5: home renders in landscape, match capture scrolls to Submit, auto/teleop controls render side by side, and an incremented practice score survives rotation. Test increment was restored afterward.
- Summary table rendered in portrait and landscape with reachable filter and metric controls.
- Native test harness: existing local debug binary with its simulator-only plist corrected to match the project's current landscape/tablet support. This is not a newly built or distributed release binary.
- Changes are local. No EAS update, TestFlight submission, commit or push is implied by these checks.
- iPad simulator attempts were held up by first-boot OS migration and app installation; no tablet runtime success is claimed. No Android emulator was available in the current tool path.

## Remaining device gates

- Android hardware/emulator, iPad runtime, split-screen OS behavior, accessibility text sizes, and software-keyboard behavior require device verification. Geometry tests and bundle exports do not certify them.
- Real camera/QR handoff and drawing gestures across rotation require hands-on checks; no claim of full multi-device QA.
- Before distribution, test both landscape directions, rotate with a partially completed pit/match report, then reconnect and confirm the same report ID and values.
