-- A scout may open a scheduled match from the picker instead of its assignment
-- card. Completing that report must still remove only that exact match/team
-- assignment from their queue. Keeping this in the database makes the result
-- consistent for the scheduled picker and any manual report linked to a match.
create or replace function private.complete_matching_scout_assignments()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.entry_type <> 'match'
     or new.status <> 'submitted'
     or new.match_id is null then
    return new;
  end if;

  update public.scouting_assignments
  set status = 'complete',
      completed_at = coalesce(new.submitted_at, now())
  where match_id = new.match_id
    and team_id = new.team_id
    and scout_user_id = new.scout_user_id
    and status in ('pending', 'in_progress');

  return new;
end;
$$;

revoke all on function private.complete_matching_scout_assignments() from public;
revoke all on function private.complete_matching_scout_assignments() from anon;
revoke all on function private.complete_matching_scout_assignments() from authenticated;

drop trigger if exists complete_assignments_after_match_report on public.scouting_entries;
create trigger complete_assignments_after_match_report
after insert or update of status, match_id, team_id, scout_user_id, entry_type
on public.scouting_entries
for each row
execute procedure private.complete_matching_scout_assignments();

-- Reconcile reports that were submitted from the picker before this trigger
-- existed, without touching assignments for a different match or team.
update public.scouting_assignments assignment
set status = 'complete',
    completed_at = coalesce((
      select entry.submitted_at
      from public.scouting_entries entry
      where entry.entry_type = 'match'
        and entry.status = 'submitted'
        and entry.match_id = assignment.match_id
        and entry.team_id = assignment.team_id
        and entry.scout_user_id = assignment.scout_user_id
      order by entry.submitted_at desc nulls last
      limit 1
    ), assignment.completed_at, now())
where assignment.status in ('pending', 'in_progress')
  and exists (
    select 1
    from public.scouting_entries entry
    where entry.entry_type = 'match'
      and entry.status = 'submitted'
      and entry.match_id = assignment.match_id
      and entry.team_id = assignment.team_id
      and entry.scout_user_id = assignment.scout_user_id
  );
