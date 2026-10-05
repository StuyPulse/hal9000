alter table public.event_teams
  add column is_manual boolean not null default false;

comment on column public.event_teams.is_manual is
  'True when an administrator added the team locally. TBA roster refreshes preserve these links until the team is listed officially.';
