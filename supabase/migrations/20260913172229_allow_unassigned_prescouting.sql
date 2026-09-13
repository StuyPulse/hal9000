-- Keep prescout assignments as optional coordination metadata. This policy is
-- deliberately limited to self-authored prescout entries for event teams.
create policy "members submit unassigned prescout entries"
on public.scouting_entries for insert to authenticated
with check (
  entry_type = 'pre_scout'
  and scout_user_id = (select auth.uid())
  and private.is_organization_member(organization_id)
  and exists (
    select 1
    from public.event_teams event_team
    where event_team.event_id = scouting_entries.event_id
      and event_team.team_id = scouting_entries.team_id
  )
);

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
  and private.is_organization_member(organization_id)
  and exists (
    select 1
    from public.event_teams event_team
    where event_team.event_id = scouting_entries.event_id
      and event_team.team_id = scouting_entries.team_id
  )
);
