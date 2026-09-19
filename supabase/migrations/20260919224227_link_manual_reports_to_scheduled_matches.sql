-- A report entered through the manual fallback is still a report for the
-- scheduled match when its event, team, round, and numeric match number make
-- that identity unambiguous. Linking it lets the schedule, reports list, and
-- team statistics all use the same source of truth. Ambiguous or free-form
-- manual reports deliberately stay unlinked.
with candidates as (
  select
    entry.id as entry_id,
    scheduled_match.id as match_id,
    count(*) over (partition by entry.id) as candidate_count
  from public.scouting_entries entry
  join public.matches scheduled_match
    on scheduled_match.event_id = entry.event_id
   and (entry.team_id = any(scheduled_match.red_teams) or entry.team_id = any(scheduled_match.blue_teams))
   and scheduled_match.match_number = (entry.payload #>> '{manual_match,label}')::integer
   and scheduled_match.match_type = case lower(trim(entry.payload #>> '{manual_match,stage}'))
     when 'qualification' then 'qualification'
     when 'practice' then 'practice'
     when 'quarterfinal' then 'playoff'
     when 'semifinal' then 'playoff'
     when 'final' then 'playoff'
   end
  where entry.entry_type = 'match'
    and entry.match_id is null
    and jsonb_typeof(entry.payload -> 'manual_match') = 'object'
    and coalesce(entry.payload #>> '{manual_match,label}', '') ~ '^[0-9]+$'
)
update public.scouting_entries entry
set match_id = candidates.match_id
from candidates
where entry.id = candidates.entry_id
  and candidates.candidate_count = 1;
