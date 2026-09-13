-- Global Scouts are event-wide scouting collaborators. They do not receive
-- administrative setup, user-management, or form-configuration permissions.
create or replace function private.can_access_event(target_event uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.events e
    where e.id = target_event
      and (
        (e.status = 'active' and private.is_organization_member(e.organization_id))
        or private.has_organization_role(
          e.organization_id,
          array['admin','strategist','developer','global_scout']::public.organization_role[]
        )
        or exists (
          select 1
          from public.scouting_assignments a
          join public.matches m on m.id = a.match_id
          where m.event_id = e.id and a.scout_user_id = (select auth.uid())
        )
      )
  );
$$;

create or replace function private.can_read_submission(target_submission uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.match_submissions s
    join public.events e on e.id = s.event_id
    where s.id = target_submission
      and (
        s.scout_user_id = (select auth.uid())
        or private.has_organization_role(
          e.organization_id,
          array['admin','strategist','developer','global_scout']::public.organization_role[]
        )
      )
  );
$$;

revoke all on function private.can_access_event(uuid) from public;
revoke all on function private.can_read_submission(uuid) from public;
grant execute on function private.can_access_event(uuid), private.can_read_submission(uuid) to authenticated;

-- Global Scouts can see every assignment so they can open any scheduled team.
create policy "global scouts read all assignments"
on public.scouting_assignments for select to authenticated
using (
  exists (
    select 1
    from public.matches m
    join public.events e on e.id = m.event_id
    where m.id = scouting_assignments.match_id
      and private.has_organization_role(
        e.organization_id,
        array['global_scout']::public.organization_role[]
      )
  )
);

-- Members already create and read their own current reports. This grants the
-- Global Scout role the missing ability to correct any event-wide report.
create policy "global scouts update scouting entries"
on public.scouting_entries for update to authenticated
using (
  private.has_organization_role(
    organization_id,
    array['global_scout']::public.organization_role[]
  )
)
with check (
  private.has_organization_role(
    organization_id,
    array['global_scout']::public.organization_role[]
  )
);

-- Extend only the shared strategy board and its tier manager, not personal or
-- legacy picklists. Existing policies keep their current permissions intact.
drop policy "picklist collaborators create shared rankings" on public.shared_picklist_rankings;
create policy "picklist collaborators create shared rankings"
on public.shared_picklist_rankings for insert to authenticated
with check (
  updated_by = (select auth.uid())
  and private.has_organization_role(
    organization_id,
    array['strategist','master','admin','developer','global_scout']::public.organization_role[]
  )
);

drop policy "picklist collaborators update shared rankings" on public.shared_picklist_rankings;
create policy "picklist collaborators update shared rankings"
on public.shared_picklist_rankings for update to authenticated
using (private.has_organization_role(organization_id, array['strategist','master','admin','developer','global_scout']::public.organization_role[]))
with check (
  updated_by = (select auth.uid())
  and private.has_organization_role(organization_id, array['strategist','master','admin','developer','global_scout']::public.organization_role[])
);

drop policy "picklist collaborators delete shared rankings" on public.shared_picklist_rankings;
create policy "picklist collaborators delete shared rankings"
on public.shared_picklist_rankings for delete to authenticated
using (private.has_organization_role(organization_id, array['strategist','master','admin','developer','global_scout']::public.organization_role[]));

drop policy "picklist collaborators create categories" on public.picklist_categories;
create policy "picklist collaborators create categories"
on public.picklist_categories for insert to authenticated
with check (
  created_by = (select auth.uid())
  and private.has_organization_role(organization_id, array['strategist','master','admin','developer','global_scout']::public.organization_role[])
);

drop policy "picklist collaborators update categories" on public.picklist_categories;
create policy "picklist collaborators update categories"
on public.picklist_categories for update to authenticated
using (private.has_organization_role(organization_id, array['strategist','master','admin','developer','global_scout']::public.organization_role[]))
with check (private.has_organization_role(organization_id, array['strategist','master','admin','developer','global_scout']::public.organization_role[]));

drop policy "category owners and admins delete categories" on public.picklist_categories;
create policy "category owners, global scouts, and admins delete categories"
on public.picklist_categories for delete to authenticated
using (
  created_by = (select auth.uid())
  or private.has_organization_role(organization_id, array['admin','developer','global_scout']::public.organization_role[])
);
