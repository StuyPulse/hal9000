# Native privacy disclosures — review draft

October 18, 2026. **Not published and not legal advice.** A seven-category App Store Connect privacy draft is now saved but unpublished; [questionnaire status](mobile-app-store-questionnaires.md) records the separate saved age/content-rights answers and outstanding gates. Keep the existing public policy unchanged until the owner approves accurate retention/deletion commitments and the corresponding implementation is verified.

## Facts to explain in the policy

- HAL9000 Scout supports StuyPulse's authorized robotics-team scouting work. Existing team-issued accounts are the intended access model; approved personal-email exceptions also exist.
- Account information includes name, email and account identifier. Authentication uses Supabase and, when chosen, Google. Database organization membership determines team access; a display name or editable profile does not grant a role.
- Scouting reports, comments, pit photos, drawings, picklist edits and associated author information are shared with authorized workspace members according to their permissions. Scouting drafts are not promised to be visible only to their author.
- Optional registered QR-relay signing devices have a device identifier and public key associated with the account. The private signing key stays in the device's secure storage. QR reports/exports can be given to other people; signing proves origin/integrity, not confidentiality.
- Content-safety reports contain a content/event reference, chosen reason and the user's explanation. They do not automatically attach the underlying report or photo. The new workflow limits access to the reporter and authorized organization administrators/developers, plus necessary service operators. Admin review adds a status, explanation, reviewer and time. This new backend/migration is local and must be deployed and tested before describing it as live.
- Reversible team-access suspension records the member, prior role, reason, administrator and dates. Suspension removes that team's membership, not the account or authored scouting data. It is not account deletion. Offline devices cannot be instantly erased or blocked from already downloaded data without reconnecting.
- The app stores downloaded events/team data, reports, unsent work and photos in app-local storage so competition workflows continue offline. Account/organization scoping separates workspaces. Tokens and relay signing secrets use secure device storage. Do not promise application-level encryption of the SQLite database; it is not implemented here.
- Ordinary sign-out retains downloaded workspace data and pending work on that device. It is not an erasure action. A confirmed server membership denial clears the automatic workspace-reopening pointer but preserves stored work; this must not be described as deleting the account's local files.
- Camera access is optional for QR scanning and pit photography. The system image picker is used for choosing photos. The app's revised configuration does not request microphone, location or Face ID access. Final binary permissions must still be inspected.
- App configuration declares no tracking and no advertising purpose. Verify actual SDK/provider logging and collection before certifying App Store answers; declarations alone are not a network/privacy audit.
- Support contact currently listed by the project: `se@stuypulse.com`. The owner must confirm that someone monitors safety and deletion concerns; an email address alone does not establish a response process.

## Retention and deletion decisions still needed

The owner authorized local-only implementation, proposed "90 days?", and asked about retaining names. No final deadline or legal retention exception was established. Keeping a real name remains personal-data retention; a neutral "Deleted member" label and genuinely non-personal aggregates are alternatives to review, not permission to retain all authored content.

Before publishing, approve the exact deletion scope, shared-record treatment, completion deadline, failed-request owner, actual provider backup/log retention, restore-time erasure procedure, and reconnection cleanup. Explain limitations of copies exported to others or held on offline devices without promising immediate remote erasure. Do not publish an unverified 90-day promise or claim in-app deletion is implemented.

## App Store privacy worksheet

Existing native manifest categories to reconcile with actual collection: Name, Email Address, User ID, optional relay Device ID, Photos/Videos and Other User Content (including scouting and safety-report explanations). Declared use is app functionality, linked to the account, not tracking. Verify the exact App Store questionnaire categories and provider logs before final submission; the manifest is not the questionnaire.

Also confirm current age-rating answers for shared text/photos, whether the app targets children, distribution settings, asset rights, support ownership and sample-data screenshots. Do not infer those legal/editorial answers from a successful build.
