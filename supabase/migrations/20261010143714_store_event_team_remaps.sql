-- Cache event-scoped aliases without changing teams or any historical references.
alter table public.events add column tba_team_remaps jsonb
  check (tba_team_remaps is null or jsonb_typeof(tba_team_remaps) = 'object');
