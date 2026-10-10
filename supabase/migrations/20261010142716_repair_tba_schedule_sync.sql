-- TBA serves practice matches separately from qualifications/playoffs. Keep
-- their ETag independent so either schedule can update without over-fetching.
alter table public.events add column if not exists tba_practice_matches_etag text;

-- The former Vercel domain redirects to the custom domain. HTTP clients drop
-- Authorization on that cross-host redirect, causing every scheduled sync to
-- return 401. Change only the URL; retain the job, schedule, and Vault secret.
do $$
declare
  sync_job record;
begin
  for sync_job in
    select jobid, command from cron.job
    where jobname = 'wildcard-pulse-live-event-sync'
  loop
    perform cron.alter_job(sync_job.jobid, command := replace(
      sync_job.command,
      'https://wildcard-pulse-web.vercel.app/api/live-event/sync',
      'https://hal9000.stuypulse.com/api/live-event/sync'
    ));
  end loop;
end;
$$;
