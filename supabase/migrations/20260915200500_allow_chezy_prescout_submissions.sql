-- Chezy Champs is available for prescouting before it becomes the active event.
-- Keep this exception deliberately narrow: a signed-in organization member may
-- only self-submit a pre-scout report for a team actually registered at 2026cc.
create or replace function private.can_submit_chezy_prescout(
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
        and event.event_key = '2026cc'
        and event_team.team_id = target_team
    );
$$;

revoke all on function private.can_submit_chezy_prescout(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function private.can_submit_chezy_prescout(uuid, uuid, uuid) to authenticated;

drop policy if exists "members submit unassigned prescout entries" on public.scouting_entries;
create policy "members submit unassigned prescout entries"
on public.scouting_entries for insert to authenticated
with check (
  entry_type = 'pre_scout'
  and scout_user_id = (select auth.uid())
  and private.can_submit_chezy_prescout(organization_id, event_id, team_id)
);

drop policy if exists "authors update unassigned prescout drafts" on public.scouting_entries;
create policy "authors update unassigned prescout drafts"
on public.scouting_entries for update to authenticated
using (
  entry_type = 'pre_scout'
  and scout_user_id = (select auth.uid())
  and status = 'draft'
)
with check (
  entry_type = 'pre_scout'
  and scout_user_id = (select auth.uid())
  and private.can_submit_chezy_prescout(organization_id, event_id, team_id)
);
