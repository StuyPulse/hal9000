import { AppShell, PageHeader } from "@/components/app-shell";
import { InviteMemberForm, OrganizationMemberList } from "@/components/admin-forms";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export default async function UsersPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: admin } = user ? await supabase.from("organization_members").select("organization_id").eq("user_id", user.id).in("role", ["admin", "developer"]).limit(1).maybeSingle() : { data: null };
  if (!admin) return <AppShell active="Users & roles"><PageHeader eyebrow="Administration" title="Users & roles."/><section className="card"><p className="muted">Admin access is required to view and manage team accounts.</p></section></AppShell>;
  const [{ data: members }, authResult] = await Promise.all([
    supabase.from("organization_members").select("user_id,role,created_at,profiles(display_name)").eq("organization_id", admin.organization_id).order("created_at"),
    createAdminClient().auth.admin.listUsers({ page: 1, perPage: 1000 }),
  ]);
  const usersById = new Map(authResult.data.users.map((account) => [account.id, account]));
  const memberRows = (members ?? []).map((member) => { const profile = member.profiles as unknown as { display_name: string } | null; const account = usersById.get(member.user_id); return { userId: member.user_id, name: profile?.display_name ?? "Unnamed member", email: account?.email ?? "Email unavailable", providers: [...new Set(account?.identities?.map((identity) => identity.provider) ?? [])].join(" + "), role: member.role }; });
  return <AppShell active="Users & roles"><PageHeader eyebrow="Administration" title="Users & roles."/><div className="admin-stack"><InviteMemberForm/><section className="card"><div className="card-head"><div><h2>Organization members</h2><p className="muted" style={{margin:"5px 0 0"}}>{members?.length ?? 0} active members · roles are enforced in the database</p></div></div>{memberRows.length ? <OrganizationMemberList members={memberRows}/> : <p className="muted">No organization members are visible yet.</p>}</section></div></AppShell>;
}
