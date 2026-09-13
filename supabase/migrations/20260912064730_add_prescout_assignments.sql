create table public.prescout_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  scout_user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (event_id, team_id, scout_user_id)
);

create index prescout_assignments_event_scout_idx
  on public.prescout_assignments(event_id, scout_user_id, team_id);

alter table public.prescout_assignments enable row level security;

create policy "prescout assignments visible to assignees and managers"
on public.prescout_assignments for select to authenticated
using (
  scout_user_id = (select auth.uid())
  or private.can_manage_event(event_id)
  or private.has_organization_role(
    organization_id,
    array['global_scout']::public.organization_role[]
  )
);

create policy "prescout assignments managed by admins"
on public.prescout_assignments for insert to authenticated
with check (private.can_manage_event(event_id));

create policy "prescout assignments removed by admins"
on public.prescout_assignments for delete to authenticated
using (private.can_manage_event(event_id));

grant select, insert, delete on public.prescout_assignments to authenticated;

-- Existing general scouting-entry policies allowed every member to submit a
-- pre-scout report. Preserve their match/pit behavior, but require an explicit
-- assignment for ordinary Scouts. Admins, developers, and Global Scouts keep
-- their event-wide access.
drop policy "members and admins insert scouting entries" on public.scouting_entries;
create policy "members and admins insert scouting entries"
on public.scouting_entries for insert to authenticated
with check (
  private.has_organization_role(
    organization_id,
    array['admin','developer','global_scout']::public.organization_role[]
  )
  or (
    scout_user_id = (select auth.uid())
    and private.is_organization_member(organization_id)
    and (
      entry_type <> 'pre_scout'
      or exists (
        select 1
        from public.prescout_assignments assignment
        where assignment.event_id = scouting_entries.event_id
          and assignment.team_id = scouting_entries.team_id
          and assignment.scout_user_id = (select auth.uid())
      )
    )
  )
);

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
  or (
    scout_user_id = (select auth.uid())
    and private.is_organization_member(organization_id)
    and (
      entry_type <> 'pre_scout'
      or exists (
        select 1
        from public.prescout_assignments assignment
        where assignment.event_id = scouting_entries.event_id
          and assignment.team_id = scouting_entries.team_id
          and assignment.scout_user_id = (select auth.uid())
      )
    )
  )
);

-- Keep prior free-form entries valid while enforcing the new numeric rule for
-- all new or updated pre-scout reports.
alter table public.scouting_entries
  add constraint scouting_entries_prescout_average_pieces_numeric_check
  check (
    entry_type <> 'pre_scout'
    or not (payload ? 'average_pieces')
    or payload ->> 'average_pieces' ~ '^[0-9]{1,3}$'
  ) not valid;
