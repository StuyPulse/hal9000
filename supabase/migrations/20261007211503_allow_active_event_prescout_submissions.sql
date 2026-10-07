-- Prescouting follows the organization's active event, not a specific TBA key.
-- Renaming preserves the existing policy dependencies and authenticated-only
-- grants. Keep the existing private helper's scoped membership/event/team check.
alter function private.can_submit_chezy_prescout(uuid, uuid, uuid)
  rename to can_submit_active_event_prescout;

create or replace function private.can_submit_active_event_prescout(
  target_organization uuid,
  target_event uuid,
  target_team uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_organization_member(target_organization)
    and exists (
      select 1
      from public.events event
      join public.event_teams event_team on event_team.event_id = event.id
      where event.id = target_event
        and event.organization_id = target_organization
        and event.status = 'active'
        and event_team.team_id = target_team
    );
$$;

revoke all on function private.can_submit_active_event_prescout(uuid, uuid, uuid)
  from public, anon;
grant execute on function private.can_submit_active_event_prescout(uuid, uuid, uuid)
  to authenticated;
