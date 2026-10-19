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
