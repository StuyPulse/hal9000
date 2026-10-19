# Team-account login review notes

October 18, 2026. Local preparation only; not submitted to Apple.

The owner confirmed that StuyPulse issues `@stuypulse.com` organizational accounts and chose to retain team-account login, requesting assessment under guideline 4.8 rather than adding Sign in with Apple. This supersedes the briefly proposed Apple-sign-in/approval implementation; no authentication code was changed.

## Accurate product explanation

HAL9000 Scout is a robotics-team scouting workspace. Access to cloud scouting data requires organization membership, authorized by database roles. Email/password and Google authentication identify the member; Google login does not itself grant team access. Local practice is available without signing in and does not write to a team workspace. A separate review-demo workspace is used for Apple reviewers; credentials belong only in Apple's secure review form.

## Guideline 4.8 assessment

[Apple's current guideline](https://developer.apple.com/app-store/review/guidelines/#login-services), checked October 18, includes an exception for education/enterprise/business apps requiring an existing education or enterprise account. The team's existing organization-issued accounts provide a reasonable basis to request that assessment. Creating a HAL9000 application profile does not by itself establish or rule out the exception: the underlying organizational-account requirement is what matters.

Explicitly approved personal email addresses also exist. They must be disclosed; do not claim that every account uses organizational SSO, that there are no external-email exceptions, or that there is no in-app signup. Those exceptions leave the applicability for Apple to assess. Email/password alone is not the qualifying alternative while Google login remains present and no exception has been accepted.

## Prepared App Review explanation

> HAL9000 Scout is an operational scouting tool for StuyPulse, FRC Team 694. It is intended for authorized robotics-team participants, not general public social sign-in. StuyPulse issues existing @stuypulse.com organizational accounts to its members. Google Sign-In is used to authenticate those team accounts, and access to cloud scouting workspaces is governed by organization membership and database roles.
>
> The app also supports email/password authentication and explicitly authorized personal-email exceptions for team access. These are controlled exceptions, not unrestricted public access. Creating a HAL9000 application profile does not itself establish a new StuyPulse organizational account.
>
> We request assessment under guideline 4.8's exception for education, enterprise, or business apps requiring an existing education or enterprise account. Please assess the disclosed organizational access model, including its authorized exceptions. Local practice is available without login and does not access or modify cloud team data. An isolated review-demo workspace is provided through the review credentials in App Store Connect.

This text is prepared locally for review, not submitted or accepted. Before submission, verify the access model against the final binary and current server configuration, provide current reviewer instructions and credentials through Apple's secure form, and retain the personal-email disclosure. Do not mark the login issue resolved until Apple accepts the actual model or an equivalent qualifying login is implemented.

No provider configuration, entitlements, login methods, membership rules, public listing or live review notes were changed. The account-deletion hold is separate from the login-service decision and still blocks public submission.

## Guideline 1.2 (user-generated content) — prepared App Review explanation

October 19, 2026. The profanity/shared-text filter was removed at the owner's request (database triggers dropped, app and API checks deleted). Do not claim the app filters or blocks objectionable text. Describe the controls that exist, and be ready to add a flag-only filter if Apple asks for an automated measure.

> HAL9000 Scout is a closed, invitation-only tool for the members of one robotics team (StuyPulse, FRC Team 694), not a public social or content-sharing service. Nothing is visible to the public or to other organizations. Team members enter scouting observations, comments, robot photos and picklist notes that are shared only with the other approved members of the same team workspace, and access to a workspace requires organization membership granted and revocable by team administrators.
>
> The app provides the following safeguards for that content:
> - **Reporting:** any member can report a scouting report, a robot photo or the workspace from within the app (Settings → Content safety and reports). Reports are saved on the device first, so they are not lost offline, and are delivered to team administrators when a connection is available.
> - **Review and removal:** administrators review reports privately, record a resolution, and can remove or correct the content.
> - **Blocking abusive users:** administrators can suspend a member's access to the team workspace, and can reverse the suspension. A suspended member can no longer view or add shared content.
> - **Contact:** concerns can also be sent to se@stuypulse.com, which is published in the privacy policy and app listing materials.
>
> We do not use an automated word filter, because the content is short factual robot-scouting notes from vetted team members, but we are glad to add one if App Review requires it.

Before submission: confirm the admin review, resolution and suspension flows work with real accounts on the final binary, confirm the in-app path text above matches the shipped navigation, and confirm the contact address is monitored. Do not state a response-time commitment the team has not agreed to. Paste this into the App Review notes field in App Store Connect; it has not been submitted.
