# Claude design consultation

The same conversation also received android-match.png and returned a visual critique. Labeled editable totals and full breakage-detail review were added. The source website's Scored/Ferried labels were preserved because they distinguish actual observations; compatibility totals were not relabeled as scoring.

Asked through the user's Claude desktop app on 2026-10-12. Claude chat: https://claude.ai/chat/ec3e251b-746b-44b6-823a-46ca14465f92

Claude evaluated a written description, not screenshots. Request was advice only; no project access or edits were delegated.

## Advice incorporated

- Make starting/resuming the next assignment the primary action.
- Put useful event, assignment, and delivery information above ornamental chrome.
- Replace paired plus/minus controls with a large tap-to-increment surface and separated Undo.
- Move manual phase selection into the bottom thumb zone.
- Distinguish local persistence from confirmed server delivery.
- Share the functional design language but use Android Material navigation indicators, back icons, shapes and switches alongside iOS conventions.
- Reserve red/blue primarily for alliance meaning; use a separate functional blue accent.

## Advice deliberately adjusted

- No assumed countdown or phase timer: imported schedules can change and timing was not a confirmed requirement.
- No forced phase advance or hold-to-submit: manually selected phases and a review step suit accessible, predictable entry.
- Locally saved data is protected on that device; cloud confirmation adds delivery assurance. The interface does not claim that local saves are worthless or that any simulated state proves production readiness.
- Default dark appearance is a review direction; light appearance remains selectable. Actual venue conditions and scout feedback must inform the production default.

## Second consultation: current website context

Sent a comprehensive brief verified against current repository files: README, AGENTS.md, sidebar navigation, architecture docs, shared form types, specialized REBUILT v4 form and IndexedDB queue. Included the canonical website URL, all navigation groups and role names, charcoal/burgundy identity, scheduled/manual match handling, TBA alias rules, actual scored/ferried semantics, no-show/field position/defense/multiple breakage fields, pit photo coverage, global shared-document behavior and strategist screens. No credentials, private user/event records or environment files were shared.

Claude recommended Today/Schedule/Outbox/More navigation, a pre-match step, separate scored/ferried tiles, structured defense and repeatable issues, explicit delivery states, and keeping administration on the web. It identified the generic demo's collection/climb fields as mismatched to the actual current form.

Implemented the field corrections in website-parity.js: Pre/Auto/Teleop/Details, field reference/starting positions/no-show, separate scored and ferried values, fouls, defense rating/teams, multiple issues/timestamps/comments, permanent local submission ID in review. Pit, pre-scout, global doc and strategy remain proposed future mobile screens, not implemented native features. No-show review displays zeroed scoring. Physical OS behavior and backend parity are still unverified.
