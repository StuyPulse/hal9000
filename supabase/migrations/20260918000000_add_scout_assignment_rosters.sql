-- Reusable, organization-scoped groups for automatic match assignments.
create table public.scout_assignment_rosters (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  created_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table public.scout_assignment_roster_members (
  roster_id uuid not null references public.scout_assignment_rosters(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (roster_id, user_id)
);

create index scout_assignment_roster_members_user_idx
  on public.scout_assignment_roster_members(user_id, roster_id);

alter table public.scout_assignment_rosters enable row level security;
alter table public.scout_assignment_roster_members enable row level security;

create policy "assignment rosters visible to organization managers"
on public.scout_assignment_rosters for select to authenticated
using (private.has_organization_role(organization_id, array['admin','developer']::public.organization_role[]));

create policy "assignment rosters managed by organization managers"
on public.scout_assignment_rosters for all to authenticated
using (private.has_organization_role(organization_id, array['admin','developer']::public.organization_role[]))
with check (private.has_organization_role(organization_id, array['admin','developer']::public.organization_role[]));

create policy "assignment roster members visible to organization managers"
on public.scout_assignment_roster_members for select to authenticated
using (exists (
  select 1 from public.scout_assignment_rosters roster
  where roster.id = roster_id
    and private.has_organization_role(roster.organization_id, array['admin','developer']::public.organization_role[])
));

create policy "assignment roster members managed by organization managers"
on public.scout_assignment_roster_members for all to authenticated
using (exists (
  select 1 from public.scout_assignment_rosters roster
  where roster.id = roster_id
    and private.has_organization_role(roster.organization_id, array['admin','developer']::public.organization_role[])
))
with check (exists (
  select 1 from public.scout_assignment_rosters roster
  where roster.id = roster_id
    and private.has_organization_role(roster.organization_id, array['admin','developer']::public.organization_role[])
));

grant select, insert, update, delete on public.scout_assignment_rosters to authenticated;
grant select, insert, update, delete on public.scout_assignment_roster_members to authenticated;
grant all on public.scout_assignment_rosters to service_role;
grant all on public.scout_assignment_roster_members to service_role;
