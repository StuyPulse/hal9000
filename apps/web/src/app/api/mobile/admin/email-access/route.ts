import { z } from "zod";
import { body, protectedOperation } from "@/lib/mobile/http";
import { mobileUserClient } from "@/lib/mobile/user-client";
import { MobileError } from "@/lib/mobile/operations";

async function manager(request: Request) {
  const client = mobileUserClient(request);
  const permission = await client.rpc("can_manage_email_access");
  if (permission.error || permission.data !== true) throw new MobileError(403, "forbidden", "You do not have access to manage authorized emails.");
  return client;
}
export async function GET(request: Request) {
  return protectedOperation(request, async () => {
    const client = await manager(request);
    const result = await client.from("authorized_emails").select("email").order("email");
    if (result.error) throw new MobileError(503, "database_unavailable", "Authorized emails could not be loaded.");
    return { emails: result.data ?? [] };
  });
}
export async function POST(request: Request) {
  return protectedOperation(request, async () => {
    const client = await manager(request);
    const input = z.object({ email: z.string().trim().email().max(254).toLowerCase() }).strict().parse(await body(request));
    if (input.email.endsWith("@stuypulse.com")) return { authorized: true, alreadyAuthorized: true };
    const result = await client.from("authorized_emails").insert({ email: input.email });
    if (result.error && result.error.code !== "23505") throw new MobileError(503, "database_unavailable", "This email could not be authorized.");
    return { authorized: true, alreadyAuthorized: result.error?.code === "23505", invitationSent: false };
  });
}
