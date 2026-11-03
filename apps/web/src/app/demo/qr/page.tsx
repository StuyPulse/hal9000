import { AppShell, PageHeader } from "@/components/app-shell";
import { QrHandoff } from "@/components/qr-handoff";

// Illustrative IDs for trying QR handoff without an account. Everything stays in this browser.
const organizationId = "00000000-0000-4000-8000-000000000001", eventId = "00000000-0000-4000-8000-000000000002";
const teams = [{ id: "00000000-0000-4000-8000-000000000694", number: 694, name: "StuyPulse" }, { id: "00000000-0000-4000-8000-000000001678", number: 1678, name: "Citrus Circuits" }];

export default function DemoQrPage() {
  return <AppShell active="QR handoff"><PageHeader eyebrow="Preview, stays in this browser" title="QR handoff."/><QrHandoff organizationId={organizationId} eventId={eventId} role="strategist" teams={teams}/></AppShell>;
}
