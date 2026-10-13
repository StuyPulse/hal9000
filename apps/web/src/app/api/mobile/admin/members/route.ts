import { body, protectedOperation } from "@/lib/mobile/http";
import { invite, setRole, requireManager } from "@/lib/mobile/admin-operations";
import { MobileError } from "@/lib/mobile/operations";

export async function GET(request: Request) {
  return protectedOperation(request, async (database, actor) => {
    requireManager(actor);
    const result = await database.from("organization_members").select("user_id,role,profiles(display_name)").eq("organization_id", actor.organizationId);
    if (result.error) throw new MobileError(503, "database_unavailable", "Organization members could not be loaded.");
    const members = [];
    // Only fetch Auth emails for IDs in the verified organization, in bounded batches.
    for (let start = 0; start < (result.data ?? []).length; start += 10) {
      const batch = await Promise.all(result.data.slice(start, start + 10).map(async (member: any) => {
        const user = await (database.auth as any).admin.getUserById(member.user_id);
        if (user.error) throw new MobileError(503, "member_lookup_failed", "Member email information could not be loaded.");
        return { id: member.user_id, role: member.role, name: member.profiles?.display_name ?? "Scout", email: user.data?.user?.email ?? "" };
      }));
      members.push(...batch);
    }
    return { members };
  });
}

export async function PATCH(request: Request) { return protectedOperation(request, async (database, actor) => setRole(database, actor, await body(request))); }
export async function POST(request: Request) { return protectedOperation(request, async (database, actor) => invite(database, actor, await body(request))); }
