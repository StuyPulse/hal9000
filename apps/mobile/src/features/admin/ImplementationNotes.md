# Native administration parity

Implemented source, October 13, 2026. This document does not claim production or device verification.

- Events: create manual event, edit name/start/end/status, organization activation through transactional server endpoint, delete unused nonselected events with scouting-data guards.
- Teams: add event membership, display aliases without changing permanent identity, remove manual-event team only when schedule/reports/photos do not depend on it.
- Matches: create local manual matches on manual or official events; edit number/round/alliances/scheduled timestamp; save scores and mark played; delete only manual matches without submitted reports. Local retained reports protect identity changes/deletes.
- Objective assignments: add scout, remove eligible pending assignment; completed/submitted assignments stay assigned.
- Prescout: add/remove eligible scout per team; submitted reports protect removals.
- Rosters: create/rename/delete roster, add/remove eligible members, preview round-robin generation before confirmation. Generation rechecks current roster and occupied slots on server.
- Clear/undo: snapshots are saved before deletions; clear removes only captured prescout IDs, preserving concurrent additions; undo preserves newly occupied objective slots. Partial server results retain undo and show the server's error rather than claim success.
- Accounts: current members/profile fallback; authenticated server email listing, role changes with last-admin protection, explicit invitation confirmation and partial invitation/role failure reporting.
- Email access: separate `/admin/email-access` route works for designated managers irrespective of admin role. RPC/server permission decides access; no invitation is sent by authorization.
- Forms: structured title/year/field editor, types/sections/required/options/help text, reorder/remove, preview, new immutable version publishing. Duplicate IDs and invalid choices rejected. Generic definitions deliberately do not pretend to replace website-specialized REBUILT v4 / manual v2 forms.
- TBA: event-key validation and explicit import confirmation, private server TBA key. No import simulation in practice.

Online writes persist a scoped local intent first and verify returned rows. Setup intents are not silently replayed in background. Practice changes remain in namespaced SQLite/localStorage and never invoke live setup methods.

Server paths are `/api/mobile/admin/members`, `/email-access`, `/activation`, `/tba-import`, `/assignments`. All are local source only until explicitly deployed; activation also requires its reviewed migration. Missing endpoints produce honest deployment errors. No live roles/invites/assignments/events/configuration were mutated during implementation.

Verification: mobile and web TypeScript pass; 7 native setup validation/planning tests and 8 server assignment tests pass. Authenticated live operations and native UI verification are separate parent-agent tasks.

Remaining caveat: assignment clear/restore retain the website's multi-statement sequencing, not a transaction; failures report partial outcome and undo point. Full competition workflow testing and concurrent-device testing remain required.
