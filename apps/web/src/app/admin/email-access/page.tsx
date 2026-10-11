import { notFound } from "next/navigation";
import { AppShell, PageHeader } from "@/components/app-shell";
import { EmailAccessForm } from "@/components/email-access-form";
import { canManageEmailAccess } from "@/lib/auth/email-access";
import { createClient } from "@/lib/supabase/server";

export default async function EmailAccessPage() {
  if (!await canManageEmailAccess()) notFound();
  const supabase = await createClient();
  const { data: emails, error } = await supabase.from("authorized_emails").select("email").order("email");
  return <AppShell active="Email access">
    <PageHeader title="Email access."/>
    <div className="admin-stack">
      <EmailAccessForm/>
      <section className="card">
        <div className="card-head"><h2>Authorized external emails</h2></div>
        {error ? <p role="alert">Couldn’t load authorized emails. Refresh to try again.</p> : emails?.length ? <ul className="email-access-list">{emails.map(({ email }) => <li key={email}>{email}</li>)}</ul> : <p className="muted">No external emails have been added.</p>}
      </section>
    </div>
  </AppShell>;
}
