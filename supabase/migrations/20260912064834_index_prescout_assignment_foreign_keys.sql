create index prescout_assignments_organization_idx
  on public.prescout_assignments(organization_id);

create index prescout_assignments_team_idx
  on public.prescout_assignments(team_id);

create index prescout_assignments_scout_idx
  on public.prescout_assignments(scout_user_id);
