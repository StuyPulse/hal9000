-- Queue team ownership before a scout has created an account. The auth trigger
-- claims matching rows on first sign-in, then creates one objective assignment
-- for every scheduled match involving that team.
create table if not exists private.pending_scout_team_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  expected_display_name text not null check (char_length(trim(expected_display_name)) between 1 and 80),
  claimed_user_id uuid references public.profiles(id) on delete set null,
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, event_id, team_id, expected_display_name)
);

create index if not exists pending_scout_team_assignments_claim_lookup_idx
  on private.pending_scout_team_assignments (organization_id, expected_display_name)
  where claimed_user_id is null;

create or replace function private.normalize_scout_name(value text)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select lower(pg_catalog.regexp_replace(pg_catalog.btrim(coalesce(value, '')), '[[:space:]]+', ' ', 'g'));
$$;

create or replace function private.claim_pending_scout_assignments(
  target_user_id uuid,
  target_organization_id uuid,
  target_display_name text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  with claimed as (
    update private.pending_scout_team_assignments
    set claimed_user_id = target_user_id,
        claimed_at = now()
    where organization_id = target_organization_id
      and claimed_user_id is null
      and private.normalize_scout_name(expected_display_name) = private.normalize_scout_name(target_display_name)
    returning event_id, team_id
  )
  insert into public.scouting_assignments (match_id, scout_user_id, team_id, assignment_type)
  select match.id, target_user_id, claimed.team_id, 'objective'::public.assignment_type
  from claimed
  join public.matches match
    on match.event_id = claimed.event_id
   and claimed.team_id = any(match.red_teams || match.blue_teams)
  on conflict (match_id, scout_user_id, team_id, assignment_type) do nothing;
end;
$$;

create or replace function private.assign_claimed_scout_teams_for_match()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.scouting_assignments (match_id, scout_user_id, team_id, assignment_type)
  select new.id, pending.claimed_user_id, pending.team_id, 'objective'::public.assignment_type
  from private.pending_scout_team_assignments pending
  where pending.event_id = new.event_id
    and pending.claimed_user_id is not null
    and pending.team_id = any(new.red_teams || new.blue_teams)
  on conflict (match_id, scout_user_id, team_id, assignment_type) do nothing;
  return new;
end;
$$;

drop trigger if exists assign_claimed_scout_teams_after_match_change on public.matches;
create trigger assign_claimed_scout_teams_after_match_change
after insert or update of red_teams, blue_teams on public.matches
for each row execute procedure private.assign_claimed_scout_teams_for_match();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_first_name text;
  new_last_name text;
  new_display_name text;
  stuy_pulse_organization_id uuid;
begin
  new_first_name := nullif(left(coalesce(new.raw_user_meta_data ->> 'first_name', new.raw_user_meta_data ->> 'given_name', ''), 40), '');
  new_last_name := nullif(left(coalesce(new.raw_user_meta_data ->> 'last_name', new.raw_user_meta_data ->> 'family_name', ''), 60), '');
  new_display_name := coalesce(
    nullif(trim(concat_ws(' ', new_first_name, new_last_name)), ''),
    nullif(left(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''), 80), ''),
    nullif(left(split_part(new.email, '@', 1), 80), ''),
    'PulseCrew'
  );

  insert into public.profiles (id, display_name, first_name, last_name)
  values (new.id, new_display_name, new_first_name, new_last_name);

  select default_organization_id into stuy_pulse_organization_id
  from private.wildcard_configuration
  where setting_key = 'default_organization';
  if stuy_pulse_organization_id is null then
    raise exception 'HAL9000 has no configured default organization.' using errcode = '23514';
  end if;

  insert into public.organization_members (organization_id, user_id, role)
  values (stuy_pulse_organization_id, new.id, 'scout')
  on conflict (organization_id, user_id) do nothing;

  perform private.claim_pending_scout_assignments(new.id, stuy_pulse_organization_id, new_display_name);
  return new;
end;
$$;

-- Seed Gotham Regional ownership. Existing accounts are claimed immediately;
-- everyone else is claimed automatically on their first HAL9000 sign-in.
with seed (expected_display_name, team_number) as (
  values
    ('David Hu', 334), ('Bennett Zheng', 335), ('Evan Wang', 358),
    ('Jason Chen', 516), ('Aiden Zhang', 694), ('Hudson Chang', 1155),
    ('Taryn Huang', 1156), ('Eugene Bae', 1796), ('Jayden Chen', 1880),
    ('Bikalpa Lamichhane', 2265), ('Adrian Li', 2869), ('Kabir Madan', 2875),
    ('Daniel Manita', 3158), ('Ryan Bergman', 3193), ('Lucas O', 3646),
    ('Louis Lee', 3760), ('Louis Lee', 10045), ('Nathaniel Lasher', 3950),
    ('Maximus Tsung', 4027), ('Frank Liu', 4127), ('Hayden Low', 4571),
    ('Ruicheng Qin', 6024), ('Murphy Lin', 6348), ('Philip Levinsky', 6402),
    ('James Ruan', 6880), ('Si Xuan Lin', 6911), ('Nicole', 7272),
    ('Nabila Rahman', 7551), ('Linda Liu', 7636), ('Clayton Zhong', 7840),
    ('Clayton Zhong', 8393), ('Eric Lin', 8011), ('Eric Lin', 9030),
    ('Christopher Fernandes', 8267), ('Linda Liu', 8739),
    ('Christopher Fernandes', 9642),
    ('Ryan Bergman', 10262), ('Murphy Lin', 11313)
), gotham as (
  select id, organization_id
  from public.events
  where event_key = '2026nyn2'
)
insert into private.pending_scout_team_assignments as pending (
  organization_id,
  event_id,
  team_id,
  expected_display_name,
  claimed_user_id,
  claimed_at
)
select
  gotham.organization_id,
  gotham.id,
  event_team.team_id,
  seed.expected_display_name,
  member.user_id,
  case when member.user_id is null then null else now() end
from seed
join gotham on true
join public.teams team on team.team_number = seed.team_number
join public.event_teams event_team on event_team.event_id = gotham.id and event_team.team_id = team.id
left join public.profiles profile
  on private.normalize_scout_name(profile.display_name) = private.normalize_scout_name(seed.expected_display_name)
left join public.organization_members member
  on member.organization_id = gotham.organization_id
 and member.user_id = profile.id
on conflict (organization_id, event_id, team_id, expected_display_name) do update
set claimed_user_id = coalesce(pending.claimed_user_id, excluded.claimed_user_id),
    claimed_at = coalesce(pending.claimed_at, excluded.claimed_at);

insert into public.scouting_assignments (match_id, scout_user_id, team_id, assignment_type)
select match.id, pending.claimed_user_id, pending.team_id, 'objective'::public.assignment_type
from private.pending_scout_team_assignments pending
join public.matches match
  on match.event_id = pending.event_id
 and pending.team_id = any(match.red_teams || match.blue_teams)
where pending.claimed_user_id is not null
on conflict (match_id, scout_user_id, team_id, assignment_type) do nothing;

revoke all on table private.pending_scout_team_assignments from public, anon, authenticated;
revoke all on function private.normalize_scout_name(text) from public, anon, authenticated;
revoke all on function private.claim_pending_scout_assignments(uuid, uuid, text) from public, anon, authenticated;
revoke all on function private.assign_claimed_scout_teams_for_match() from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.handle_new_user() to supabase_auth_admin;
