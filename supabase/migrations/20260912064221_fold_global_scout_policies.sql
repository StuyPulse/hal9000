-- Keep each hot table to one permissive policy per action. This preserves the
-- Global Scout role while avoiding extra RLS work on every assignment/report.
drop policy "assignments visible to scout or managers" on public.scouting_assignments;
create policy "assignments visible to scout or managers"
on public.scouting_assignments for select to authenticated
using (
  scout_user_id = (select auth.uid())
  or private.can_manage_event((select m.event_id from public.matches m where m.id = match_id))
  or exists (
    select 1
    from public.matches m
    join public.events e on e.id = m.event_id
    where m.id = scouting_assignments.match_id
      and private.has_organization_role(
        e.organization_id,
        array['strategist','global_scout']::public.organization_role[]
      )
  )
);
drop policy "global scouts read all assignments" on public.scouting_assignments;

drop policy "authors and admins update scouting entries" on public.scouting_entries;
create policy "authors and admins update scouting entries"
on public.scouting_entries for update to authenticated
using (
  private.has_organization_role(
    organization_id,
    array['admin','developer','global_scout']::public.organization_role[]
  )
  or (scout_user_id = (select auth.uid()) and status = 'draft')
)
with check (
  private.has_organization_role(
    organization_id,
    array['admin','developer','global_scout']::public.organization_role[]
  )
  or (scout_user_id = (select auth.uid()) and private.is_organization_member(organization_id))
);
drop policy "global scouts update scouting entries" on public.scouting_entries;
