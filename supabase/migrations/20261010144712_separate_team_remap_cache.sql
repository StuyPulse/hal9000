-- Keep live alias caching independent of admin event metadata imports.
alter table public.events add column tba_team_remaps_etag text;
update public.events set tba_team_remaps_etag = tba_etag where tba_team_remaps is not null;
