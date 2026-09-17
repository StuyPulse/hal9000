alter table public.event_teams
  add column if not exists drivetrain_type text,
  add column if not exists shooter_type text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'event_teams_drivetrain_type_check'
  ) then
    alter table public.event_teams
      add constraint event_teams_drivetrain_type_check
      check (drivetrain_type is null or drivetrain_type in ('Swerve', 'Tank'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'event_teams_shooter_type_check'
  ) then
    alter table public.event_teams
      add constraint event_teams_shooter_type_check
      check (shooter_type is null or shooter_type in ('Single Turret', 'Single Fixed Shooter', 'Double Wide Shooter', 'Dumper', 'No Shooter', 'Triple Wide Shooter', 'Dual Fixed Shooters', 'Double Turret'));
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'event_teams'
  ) then
    alter publication supabase_realtime add table public.event_teams;
  end if;
end $$;
