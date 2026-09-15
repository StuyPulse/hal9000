-- An assignment is meaningful only when its team is on the assigned match's
-- red or blue roster. Enforce that relationship for every write path,
-- including imports and future admin tooling.
create or replace function private.validate_assignment_match_team()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  is_scheduled_team boolean;
begin
  select new.team_id = any(match.red_teams || match.blue_teams)
  into is_scheduled_team
  from public.matches match
  where match.id = new.match_id;

  if is_scheduled_team is distinct from true then
    raise exception 'Assigned team must be scheduled in its match.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function private.validate_assignment_match_team() from public;
revoke all on function private.validate_assignment_match_team() from anon;
revoke all on function private.validate_assignment_match_team() from authenticated;

drop trigger if exists validate_assignment_match_team on public.scouting_assignments;
create trigger validate_assignment_match_team
before insert or update of match_id, team_id
on public.scouting_assignments
for each row
execute procedure private.validate_assignment_match_team();
