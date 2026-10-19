# Retention and deletion policy review

October 18, 2026. **Draft for the team to decide, not a published policy or legal opinion.** The user explicitly chose policy review before account-deletion implementation. No deletion endpoint, account erasure, live migration or policy publication was performed.

Latest owner decisions: local-only deletion implementation was authorized, with **no live deletions**. In follow-up the owner proposed "90 days?" and asked to find a way to retain names; they did not approve the proposed shared-content scrubbing. The completion deadline and operational owner are still unsettled. No destructive pipeline or deadline was published. Retaining a real name is retaining personal data; a neutral "Deleted member" label is an alternative to assess, not an approved retention exception. Account deletion remains a release blocker. An initially created empty local migration was removed without being applied.

## Current gap

The public privacy page offers deletion by email, but there is no native account-deletion flow. Apple requires apps with account creation to offer in-app initiation; ordinary apps cannot require an email/support conversation instead. Deleting only the login or disabling membership is insufficient. [Apple account-deletion guidance](https://developer.apple.com/help/app-review/guideline-reference/5-1-1-account-deletion).

No legal requirement to retain HAL9000's personal records has been established in this review. Wanting to retain scouting history is not, by itself, evidence of such a requirement. A qualified advisor should resolve any legal exception before it is promised publicly.

## What the implementation actually stores

| Data | Current behavior/evidence | Decision needed |
| --- | --- | --- |
| Name, email, account identity and memberships | Supabase Auth/profiles and organization memberships. | Full deletion, including provider/session cleanup; not just sign-out. |
| Authored match/pit/pre-scout reports and drafts | Reports retain their author; live foreign keys restrict profile deletion. | Whether to delete the authored content on account deletion. Apple's guidance includes user-generated content; retaining a named or reversible "anonymous" copy is not a complete deletion. |
| Pit photos and photo staging | Private cloud objects plus database rows and local document files. | Delete actual objects, not only photo rows; define cache cleanup on the initiating device. |
| Shared picklists, tiers, tags, global-document links | Creator/editor references occur on shared records; some are restrictive foreign keys. | Decide how to remove personal content/attribution without silently erasing other members' work. Account deletion cannot simply cascade through shared boards. |
| Strategy drawings, assignments and registered relay keys | Personal drawings, roster/assignment membership and user-linked device keys. | Delete personal drawings/keys; reconcile assignments and revoke access. |
| History and clear/undo snapshots | Change logs and snapshots can retain historical values and author identifiers even after current rows change. | Scrub/delete personal historical content too; verify JSON snapshots, not just foreign keys. |
| Downloaded events, reports, queued edits and photos | SQLite, document files and secure storage; sign-out intentionally retains workspace data for offline reliability. | Account deletion needs a separate erasure path; ordinary sign-out should not unexpectedly destroy unsent work. |
| Backups, logs and exported/relayed copies | Actual provider backup/log settings and all recipients' devices were not inspected. | Verify real retention windows and restore procedures. Do not promise immediate removal of copies already exported or stored on an offline device. |
| New safety reports and suspension records | Local-only implementation adds reporter-owned concerns, admin resolutions and reversible suspension records. Account/profile foreign keys remove associated report/suspension rows on erasure. | Include the actual moderation data in erasure/retention tests; this new cascade alone is not an account-deletion implementation. |

The live database inspection was metadata-only: it confirmed restrictive references in `scouting_entries`, `scouting_assignments`, `match_submissions`, `shared_picklist_rankings`, `picklist_categories`, `event_global_documents`, and `assignment_clear_snapshots`. No production records were modified.

## Proposed direction for approval

1. Retain active-account data for team operations; do not introduce an arbitrary automatic expiry that loses competition history.
2. Provide an easy-to-find Settings → Delete account action, explicit scope/confirmation, and appropriate identity verification. Do not charge, require an admin conversation, or condition deletion on finding a replacement admin indefinitely.
3. Remove the account, associated personal data and authored content once the deletion request is confirmed. If retaining any genuinely non-personal statistics is desired, define the transformation and review its privacy/review implications first; do not assume replacing the author name is sufficient.
4. Define an owner-approved completion deadline, verify provider backup/log windows, and explain any actual exceptions. **No deadline or backup expiry is asserted here.**
5. Erase this account's local caches/keys after confirmed deletion. Define how other devices learn about deletion upon reconnecting and how deleted data is prevented from being re-uploaded or restored from backup. Offline copies cannot be remotely erased until the device communicates again.
6. Test against a disposable fixture containing reports, photos, snapshots, shared records and relay keys; never start with a live member's account. Finish by verifying both missing Auth access and missing associated objects/data.

## Approval needed before building deletion

- Authored report/photo deletion scope and shared-record treatment.
- Actual completion deadline and verified backup/log retention.
- Any documented legal exception and who maintains it.
- Operational owner for failed/deferred deletion jobs and confirmation to the user.

Once approved: implement the full flow, test failure/retry and cross-device behavior, update/publish the privacy page, and verify it before requesting public App Review. This document does not make the existing app compliant by itself.
