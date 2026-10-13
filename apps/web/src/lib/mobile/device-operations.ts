import { z } from "zod";
import { MobileError, type Actor, type MobileDatabase } from "./operations";

export async function registerDevice(database: MobileDatabase, actor: Actor, input: unknown) {
  const parsed = z.object({ deviceId: z.string().uuid(), publicKey: z.string().regex(/^[A-Za-z0-9+/]{43}=$/), name: z.string().trim().min(1).max(80) }).strict().parse(input);
  const existing = await database.from("mobile_device_keys").select("*").eq("id", parsed.deviceId).maybeSingle();
  if (existing.error) throw new MobileError(503, "device_registration_unavailable", "Device registration requires the mobile database migration.");
  if (existing.data) {
    if (existing.data.user_id !== actor.userId || existing.data.organization_id !== actor.organizationId || existing.data.public_key !== parsed.publicKey || existing.data.revoked_at) throw new MobileError(409, "device_identity_conflict", "This device ID is already registered or revoked. Generate a new device ID.");
    return { registered: true, deviceId: parsed.deviceId, alreadyRegistered: true };
  }
  const result = await database.from("mobile_device_keys").insert({ id: parsed.deviceId, public_key: parsed.publicKey, user_id: actor.userId, organization_id: actor.organizationId, name: parsed.name });
  if (result.error) throw new MobileError(503, "device_registration_failed", "Device registration failed. Retry without changing the device ID.");
  return { registered: true, deviceId: parsed.deviceId };
}
export async function revokeDevice(database: MobileDatabase, actor: Actor, input: unknown) {
  const parsed = z.object({ deviceId: z.string().uuid() }).strict().parse(input);
  const result = await database.from("mobile_device_keys").update({ revoked_at: new Date().toISOString() }).eq("id", parsed.deviceId).eq("user_id", actor.userId).eq("organization_id", actor.organizationId).select("id").maybeSingle();
  if (result.error) throw new MobileError(503, "device_registration_unavailable", "Device revocation is unavailable.");
  if (!result.data) throw new MobileError(404, "device_unavailable", "This device registration is unavailable.");
  return { revoked: true, deviceId: result.data.id };
}
