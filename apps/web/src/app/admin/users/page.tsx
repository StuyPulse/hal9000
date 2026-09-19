import { AppShell, PageHeader } from "@/components/app-shell";
import { InviteMemberForm, MemberRoleEditor } from "@/components/admin-forms";
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
  return <AppShell active="Users & roles"><PageHeader eyebrow="Administration" title="Users & roles."/><div className="admin-stack"><InviteMemberForm/><section className="card"><div className="card-head"><div><h2>Organization members</h2><p className="muted" style={{margin:"5px 0 0"}}>{members?.length ?? 0} active members · roles are enforced in the database</p></div></div>{members?.length ? members.map((member) => { const profile = member.profiles as unknown as { display_name: string } | null; const account = usersById.get(member.user_id); const providers = [...new Set(account?.identities?.map((identity) => identity.provider) ?? [])].join(" + "); return <div className="list-row" key={member.user_id}><div><strong>{profile?.display_name ?? "Unnamed member"}</strong><div className="muted">{account?.email ?? "Email unavailable"}{providers ? ` · ${providers}` : ""}</div></div><MemberRoleEditor userId={member.user_id} role={member.role}/></div>; }) : <p className="muted">No organization members are visible yet.</p>}</section></div></AppShell>;
}
