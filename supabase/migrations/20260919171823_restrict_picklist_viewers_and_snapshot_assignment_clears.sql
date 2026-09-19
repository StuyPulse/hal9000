-- Restrict individual members from every shared-picklist read path without
-- changing their broader event or scouting access.
create table public.picklist_view_restrictions (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

alter table public.picklist_view_restrictions enable row level security;

create policy "organization managers manage picklist view restrictions"
on public.picklist_view_restrictions for all to authenticated
using (private.has_organization_role(organization_id, array['admin','developer']::public.organization_role[]))
with check (private.has_organization_role(organization_id, array['admin','developer']::public.organization_role[]));

create or replace function private.can_view_picklist(target_organization uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_organization_member(target_organization)
    and not exists (
      select 1
      from public.picklist_view_restrictions restriction
      where restriction.organization_id = target_organization
        and restriction.user_id = (select auth.uid())
    );
$$;

create or replace function public.can_view_picklist(target_organization uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.can_view_picklist(target_organization);
$$;

revoke all on function private.can_view_picklist(uuid) from public, anon;
grant execute on function private.can_view_picklist(uuid) to authenticated;
revoke all on function public.can_view_picklist(uuid) from public, anon;
grant execute on function public.can_view_picklist(uuid) to authenticated;

drop policy "organization members read shared picklist" on public.shared_picklist_rankings;
create policy "authorized members read shared picklist"
on public.shared_picklist_rankings for select to authenticated
using (private.can_view_picklist(organization_id));

drop policy "organization members read picklist change log" on public.picklist_change_log;
create policy "authorized members read picklist change log"
on public.picklist_change_log for select to authenticated
using (private.can_view_picklist(organization_id));

drop policy "organization members read picklist categories" on public.picklist_categories;
create policy "authorized members read picklist categories"
on public.picklist_categories for select to authenticated
using (private.can_view_picklist(organization_id));

drop policy "organization members read picklist tags" on public.picklist_tags;
create policy "authorized members read picklist tags"
on public.picklist_tags for select to authenticated
using (private.can_view_picklist(organization_id));

-- Give assignment clears a durable, per-event restore point. The server-side
-- admin action is the only application path that reads these snapshots.
create table public.assignment_clear_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  actor_user_id uuid not null references public.profiles(id) on delete restrict,
  objective_assignments jsonb not null default '[]'::jsonb check (jsonb_typeof(objective_assignments) = 'array'),
  prescout_assignments jsonb not null default '[]'::jsonb check (jsonb_typeof(prescout_assignments) = 'array'),
  created_at timestamptz not null default now(),
  restored_at timestamptz
);

create index assignment_clear_snapshots_event_created_idx
on public.assignment_clear_snapshots(event_id, created_at desc);

alter table public.assignment_clear_snapshots enable row level security;

create policy "organization managers manage assignment clear snapshots"
on public.assignment_clear_snapshots for all to authenticated
using (private.has_organization_role(organization_id, array['admin','developer']::public.organization_role[]))
with check (private.has_organization_role(organization_id, array['admin','developer']::public.organization_role[]));

revoke all on table public.assignment_clear_snapshots from anon, authenticated;

-- Targeted account correction requested by the organization administrator.
update public.profiles profile
set display_name = 'Sebastian Waldman', first_name = 'Sebastian', last_name = 'Waldman'
from auth.users account
where account.id = profile.id
  and lower(account.email) = 'seb@sebastianw.tech';

insert into public.picklist_view_restrictions (organization_id, user_id)
select member.organization_id, account.id
from auth.users account
join public.organization_members member on member.user_id = account.id
where lower(account.email) = 'seb@sebastianw.tech'
on conflict (organization_id, user_id) do nothing;
