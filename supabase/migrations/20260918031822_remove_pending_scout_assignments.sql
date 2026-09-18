-- Pending account assignment was a Gotham-specific bootstrap. Assignments are
-- now managed only for existing accounts, so remove both the stale records and
-- the signup/match hooks that maintained them.
drop trigger if exists assign_claimed_scout_teams_after_match_change on public.matches;

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

  return new;
end;
$$;

drop function if exists private.assign_claimed_scout_teams_for_match();
drop function if exists private.claim_pending_scout_assignments(uuid, uuid, text);
drop function if exists private.normalize_scout_name(text);
drop table if exists private.pending_scout_team_assignments;

revoke all on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.handle_new_user() to supabase_auth_admin;
