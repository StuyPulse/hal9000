drop policy "members create match report sources" on public.match_report_sources;
drop policy "members update match report sources" on public.match_report_sources;
drop policy "members delete match report sources" on public.match_report_sources;

create policy "admins create match report sources"
on public.match_report_sources for insert to authenticated
with check (private.has_organization_role(organization_id, array['admin']::public.organization_role[]));

create policy "admins update match report sources"
on public.match_report_sources for update to authenticated
using (private.has_organization_role(organization_id, array['admin']::public.organization_role[]))
with check (private.has_organization_role(organization_id, array['admin']::public.organization_role[]));

create policy "admins delete match report sources"
on public.match_report_sources for delete to authenticated
using (private.has_organization_role(organization_id, array['admin']::public.organization_role[]));
