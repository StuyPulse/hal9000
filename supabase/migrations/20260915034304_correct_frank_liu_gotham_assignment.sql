with gotham as (
  select id, organization_id
  from public.events
  where event_key = '2026nyn2'
), frank as (
  select profile.id
  from public.profiles profile
  join public.organization_members member on member.user_id = profile.id
  join gotham on gotham.organization_id = member.organization_id
  where private.normalize_scout_name(profile.display_name) = private.normalize_scout_name('Frank Liu')
), target as (
  select gotham.organization_id, gotham.id as event_id, event_team.team_id, frank.id as user_id
  from gotham
  join public.teams team on team.team_number = 4122
  join public.event_teams event_team on event_team.event_id = gotham.id and event_team.team_id = team.id
  join frank on true
), queued as (
  insert into private.pending_scout_team_assignments as pending (
    organization_id, event_id, team_id, expected_display_name, claimed_user_id, claimed_at
  )
  select organization_id, event_id, team_id, 'Frank Liu', user_id, now()
  from target
  on conflict (organization_id, event_id, team_id, expected_display_name) do update
  set claimed_user_id = coalesce(pending.claimed_user_id, excluded.claimed_user_id),
      claimed_at = coalesce(pending.claimed_at, excluded.claimed_at)
  returning event_id, team_id, claimed_user_id
)
insert into public.scouting_assignments (match_id, scout_user_id, team_id, assignment_type)
select match.id, queued.claimed_user_id, queued.team_id, 'objective'::public.assignment_type
from queued
join public.matches match
  on match.event_id = queued.event_id
 and queued.team_id = any(match.red_teams || match.blue_teams)
where queued.claimed_user_id is not null
on conflict (match_id, scout_user_id, team_id, assignment_type) do nothing;
