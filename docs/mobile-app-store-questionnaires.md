# App Store Connect questionnaire status

Verified in Chrome Beta on October 18, 2026 for HAL9000 Scout, Apple ID `6822367941`. No App Review submission, build selection/upload, release, price change, legal-agreement acceptance or privacy-label publication was performed.

## Saved: age rating

- Parental controls: no. Age assurance: no.
- User-generated content: yes. Social media, social media disabled under 13, messaging/chat and advertising: no.
- Unrestricted web browsing: no; current native document preview restricts navigation to Google/gstatic hosts, with external links opening outside the app. Recheck this answer if that navigation policy changes.
- Profanity/crude humor: **none**, explicitly confirmed by the owner. Other mature/medical/sexual/violent/chance-based content: none; wellness, gambling and loot boxes: no.
- Apple calculated **4+** after the profanity answer was corrected. The owner approved a **9+** questionnaire, so a deliberate **9+ higher-rating override** was selected. Not enrolled in Made for Kids.
- Final App Information visibly showed 9+ in 172 countries/regions, with regional exceptions (including Vietnam 12+ and Korea ALL). These are Apple's calculated regional results, not a promise of universal 9+ availability.

## Saved: content rights

The owner explicitly confirmed the necessary rights to third-party content, including TBA data and linked team documents. Saved: “Yes, this app has the necessary rights to its third-party content.” No license/rights audit was independently performed; this declaration relies on the owner's confirmation.

## Saved but unpublished: privacy draft

Seven collected data types are configured: Name, Email Address, Photos or Videos, Customer Support, Other User Content, User ID and Device ID. Each is marked **App Functionality**, **linked to the user's identity**, and **not used for tracking**. Device ID refers to optional QR-relay device registration, not IDFA. Support includes the new safety-report workflow intended for the next release.

The final privacy page showed every category configured and an enabled **Publish** button. **Publish was not clicked.** Existing policy URL remains `https://hal9000.stuypulse.com/privacy`; no user-privacy-choices URL was invented.

Before publication, reconcile provider/SDK logging and retained diagnostic/usage/IP data, deploy and verify the described next-release safety workflow, update the public privacy policy for offline caches/relay devices/moderation, and obtain final owner approval. This is a code-informed draft, not a completed network/privacy audit or a declaration that undeployed features are live.

## Still unresolved

- App Store Connect flags an updated Apple Developer Program License Agreement requiring the Account Holder to review/accept it. The agent did not accept it.
- EU Digital Services Act trader status remains unset. Nonprofit status alone was not used to guess this legal classification.
- Encryption/export classification remains subject to review. No documentation uploaded or declaration changed in this pass; signing-only Ed25519 and platform transport encryption must be classified accurately.
- Accessibility labels are not certified. Complete the required device/assistive-technology checks before selecting supported features.
- Account deletion/retention, image moderation, staffed safety response, current screenshots and final binary/device tests remain release gates. Photo auto-upload behavior is unchanged.

References: [Apple age-rating setup](https://developer.apple.com/help/app-store-connect/manage-app-information/set-an-app-age-rating/), [App privacy details](https://developer.apple.com/app-store/app-privacy-details/), [Review guidelines](https://developer.apple.com/app-store/review/guidelines/).
