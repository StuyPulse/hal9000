-- Keep multiple scouts when they actually submitted reports, but remove stale
-- duplicate coverage. For an unscouted match/team, retain the oldest pending
-- assignment so it is still covered.
with submitted_reporters as (
  select match_id, team_id, scout_user_id, max(submitted_at) as submitted_at
  from public.scouting_entries
  where entry_type = 'match'
    and status = 'submitted'
    and match_id is not null
  group by match_id, team_id, scout_user_id
  union
  select match_id, team_id, scout_user_id, max(submitted_at) as submitted_at
  from public.match_submissions
  where status = 'submitted'
  group by match_id, team_id, scout_user_id
), reporters as (
  select match_id, team_id, scout_user_id, max(submitted_at) as submitted_at
  from submitted_reporters
  group by match_id, team_id, scout_user_id
)
update public.scouting_assignments assignment
set status = 'complete',
    completed_at = coalesce(reporters.submitted_at, assignment.completed_at, now())
from reporters
where assignment.assignment_type = 'objective'
  and assignment.status in ('pending', 'in_progress')
  and assignment.match_id = reporters.match_id
  and assignment.team_id = reporters.team_id
  and assignment.scout_user_id = reporters.scout_user_id;

with submitted_slots as (
  select distinct match_id, team_id
  from public.scouting_entries
  where entry_type = 'match'
    and status = 'submitted'
    and match_id is not null
  union
  select distinct match_id, team_id
  from public.match_submissions
  where status = 'submitted'
), ranked_pending as (
  select assignment.id,
         assignment.match_id,
         assignment.team_id,
         row_number() over (
           partition by assignment.match_id, assignment.team_id
           order by assignment.created_at, assignment.id
         ) as pending_rank
  from public.scouting_assignments assignment
  where assignment.assignment_type = 'objective'
    and assignment.status in ('pending', 'in_progress')
)
delete from public.scouting_assignments assignment
using ranked_pending pending
where assignment.id = pending.id
  and (
    exists (
      select 1
      from submitted_slots submitted
      where submitted.match_id = pending.match_id
        and submitted.team_id = pending.team_id
    )
    or pending.pending_rank > 1
  );
