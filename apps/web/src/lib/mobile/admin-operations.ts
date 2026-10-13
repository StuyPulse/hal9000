import { z } from "zod";
import { organizationRoleSchema } from "@wildcard/shared";
import { MobileError, type Actor, type MobileDatabase } from "./operations";

export function requireManager(actor: Actor) {
  if (actor.role !== "admin" && actor.role !== "developer") throw new MobileError(403, "forbidden", "Admin access is required.");
}
export async function setRole(database: MobileDatabase, actor: Actor, input: unknown) {
  requireManager(actor);
  const parsed = z.object({ userId: z.string().uuid(), role: organizationRoleSchema }).strict().parse(input);
  const result = await database.from("organization_members").update({ role: parsed.role }).eq("organization_id", actor.organizationId).eq("user_id", parsed.userId).select("role").maybeSingle();
  if (result.error || !result.data) throw new MobileError(409, "role_update_failed", "That member is unavailable or the final admin cannot be demoted.");
  return { role: result.data.role };
}
export async function invite(database: MobileDatabase, actor: Actor, input: unknown) {
  requireManager(actor);
  const parsed = z.object({ email: z.string().trim().email().max(254).toLowerCase(), role: organizationRoleSchema }).strict().parse(input);
  if (!parsed.email.endsWith("@stuypulse.com")) {
    const access = await database.from("authorized_emails").select("email").eq("email", parsed.email).maybeSingle();
    if (access.error || !access.data) throw new MobileError(422, "email_not_authorized", "Authorize this email before sending an invitation.");
  }
  const origin = process.env.NEXT_PUBLIC_SITE_URL;
  if (!origin || !/^https:\/\//.test(origin)) throw new MobileError(503, "site_url_required", "A secure website callback URL must be configured before invitations can be sent.");
  const result = await (database.auth as any).admin.inviteUserByEmail(parsed.email, { redirectTo: `${origin.replace(/\/$/, "")}/auth/callback` });
  if (result.error || !result.data?.user) throw new MobileError(503, "invitation_failed", "The invitation could not be sent.");
  const member = await database.from("organization_members").upsert({ organization_id: actor.organizationId, user_id: result.data.user.id, role: parsed.role });
  // The email has already been sent; report that partial result honestly.
  return { invitationSent: true, roleAssigned: !member.error, ...(member.error ? { warning: "Invitation sent, but the role assignment failed. An admin must assign the role on the website." } : {}) };
}
