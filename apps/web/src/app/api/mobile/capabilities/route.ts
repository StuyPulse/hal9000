import { response } from "@/lib/mobile/http";

export async function GET() {
  const configured = Boolean(process.env.SUPABASE_SECRET_KEY && process.env.NEXT_PUBLIC_SUPABASE_URL);
  return response({ apiVersion: 1, configured, operations: {
    reportCorrection: configured, reportDeletion: configured,
    tbaStats: configured && Boolean(process.env.TBA_AUTH_KEY),
    tbaImport: configured && Boolean(process.env.TBA_AUTH_KEY),
    robotProfiles: configured,
    manualReportCorrection: configured,
    memberRoles: configured, invitations: configured && Boolean(process.env.NEXT_PUBLIC_SITE_URL?.startsWith("https://")), emailAccess: configured,
    masterRelay: configured, deviceRegistration: configured, eventActivation: configured,
  }, limitations: {
    reportCorrection: "Submitted v4 match and v2 pit/pre-scout reports; identity is immutable.",
    reportDeletion: "Requires transactional mobile_delete_report database migration; there is no unsafe fallback.",
    manualReportCorrection: "Requires transactional mobile_correct_manual_report database migration; old/new assignments reconcile atomically.",
    masterRelay: "Requires registered author-signed devices and the mobile database migration.",
    eventActivation: "Requires the transactional mobile_activate_event database migration.",
  } });
}
