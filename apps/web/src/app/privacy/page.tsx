import Link from "next/link";

export const metadata = { title: "Privacy | HAL9000" };

export default function PrivacyPage() {
  return (
    <main className="auth-page">
      <section className="auth-card space-y-4" style={{ maxWidth: 760 }} aria-labelledby="privacy-title">
        <p className="eyebrow">HAL9000</p>
        <h1 id="privacy-title">Privacy policy</h1>
        <p>Last updated October 18, 2026.</p>
        <p>This policy covers the HAL9000 website and HAL9000 Scout mobile app operated by Stuyvesant Robotics Team Inc. (StuyPulse, FRC Team 694). They support authorized robotics-team scouting. Available features depend on your app version and team permissions.</p>

        <h2>Account and team information</h2>
        <p>We collect your name, email address, account identifier, team membership, role, and assignments. Sign-in uses Supabase Authentication and Google if you choose Google sign-in. Team-issued accounts are the usual access method; explicitly approved personal-email exceptions also exist. Creating an account does not itself grant team-workspace access.</p>

        <h2>Scouting content and support</h2>
        <p>We store the scouting reports, comments, robot photos, drawings, picklist changes, document links, and other competition information you provide, together with author/editor identifiers and relevant dates. This information supports assignments, scouting review, and match strategy. Cloud drafts may be visible to authorized team members; do not assume they are private notes.</p>
        <p>Support requests and content-safety reports, where available, can include your explanation, a reference to the content concerned, and review decisions. Staff handling those requests and the service operators needed to maintain the application may access that information. Please do not include unnecessary personal or sensitive information about yourself or others in scouting content.</p>

        <h2>Photos and device permissions</h2>
        <p>Camera access is optional for QR scanning and robot photography. You can also choose photos with the system picker. New photos are saved locally and queued for upload; they can be shared with authorized workspace members after delivery. The mobile app does not request microphone or device-location access. Denying camera access does not prevent ordinary scouting forms from working.</p>

        <h2>Offline copies and QR sharing</h2>
        <p>The mobile app saves downloaded events, teams, schedules, reports, queued changes, and photos on your device so you can work without internet. Signing out ordinarily retains these local copies and unsent work; it is not a deletion action. Tokens and QR signing secrets use the device&apos;s secure storage. The app does not add its own encryption to the local scouting database.</p>
        <p>If you register a signed-relay device, we store its generated device identifier, public key, and supplied device name with your account. The private signing key stays on the device. QR codes and exports can contain report content and author identifiers. A signature verifies origin and integrity; it does not conceal the report. Anyone you give an export or QR code to may keep a copy.</p>

        <h2>Service providers and team sharing</h2>
        <p>Supabase provides authentication, database, photo storage, and related server services. Vercel hosts the website and mobile server routes. Expo provides mobile build/distribution services and app-update delivery. Google processes sign-in and linked Google documents when you use those features. Our services may process information outside your country.</p>
        <p>Where team breakage alerts are enabled, the scout&apos;s name, event/match information, and reported robot issues are sent to the configured team Slack workspace. Its members may retain those messages. Linked Google documents are hosted separately from HAL9000; viewing them can send Google the document request, IP address, browser/device information, and existing Google cookies. The Blue Alliance supplies official competition information; following its external links is subject to its own privacy practices.</p>

        <h2>Technical logs and website analytics</h2>
        <p>Our infrastructure providers process request and authentication information, which can include IP addresses, user agents, requested routes, timestamps, account identifiers, and success/error information, to deliver and secure the service. Expo update requests include app/platform information, a generated installation identifier, and update information needed to deliver updates. The update system can also send a previous fatal-error message and failed-update identifiers to diagnose launch or update failures. These operational records are separate from the scouting reports you submit.</p>
        <p>The website includes Vercel Web Analytics for aggregate usage information such as page views, referring pages, browser/device type, and approximate region. These website measurements are not the same as device-location permission or a native advertising identifier. The native scouting app does not include a dedicated advertising or behavioral-analytics SDK. Provider logging and web content can still process technical information.</p>
        <p>We do not sell personal information, use it for advertising, or intentionally combine it with activity from other companies&apos; apps for advertising tracking. See the providers&apos; information about <a href="https://supabase.com/privacy">Supabase privacy</a>, <a href="https://vercel.com/docs/analytics/privacy-policy">Vercel Web Analytics privacy</a>, <a href="https://expo.dev/privacy-explained">Expo end-user data</a>, and <a href="https://policies.google.com/privacy">Google privacy</a>.</p>

        <h2>Retention and your choices</h2>
        <p>Account and competition records currently have no automatic expiry. We retain them for team operations and history; logs and backups have separate provider-dependent retention. Removing team access does not itself delete an account or its authored content.</p>
        <p>To request access to, correction of, or deletion of your account and associated personal information, contact <a href="mailto:se@stuypulse.com">se@stuypulse.com</a>. We may need to verify your identity. This support contact is not a claim that an in-app account-deletion workflow is available.</p>
        <p>Deleting a server record or changing permissions cannot immediately erase copies already exported, sent to another service, or downloaded by a device that is offline. Backups and operational logs are not necessarily erased at the same time as active records. Ask us about the handling and applicable retention of the information in your request.</p>

        <h2>Questions and policy changes</h2>
        <p>Contact <a href="mailto:se@stuypulse.com">se@stuypulse.com</a> about privacy or content-safety concerns. Changes to this policy will appear here with an updated date.</p>
        <p><Link href="/auth/login">Back to sign in</Link> · <Link href="/terms">Terms of service</Link></p>
      </section>
    </main>
  );
}
