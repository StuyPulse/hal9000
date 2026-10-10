-- Run as postgres against a populated database with a scout membership and
-- slack_breakage_notification_secret configured in Vault. Everything rolls
-- back, including pg_net requests, so no test alerts are delivered.
begin;

do $test$
declare
  fixture record;
  report_id uuid;
  notification_id uuid;
  request_count integer;
  broken boolean;
  manual boolean;
begin
  select e.id as event_id, e.organization_id, t.id as team_id,
    m.id as match_id, om.user_id as scout_user_id
  into strict fixture
  from public.events e
  join public.matches m on m.event_id = e.id
  join public.teams t on t.id = any(m.red_teams || m.blue_teams)
    and t.organization_id = e.organization_id
  join public.organization_members om on om.organization_id = e.organization_id
    and om.role = 'scout'
  order by e.starts_at desc nulls last, m.match_number, t.team_number
  limit 1;

  if not exists (
    select 1 from vault.decrypted_secrets
    where name = 'slack_breakage_notification_secret'
      and coalesce(decrypted_secret, '') <> ''
  ) then
    raise exception 'Configure the notification secret before running this regression';
  end if;

  -- Cover healthy and broken reports, both scheduled and manual, with the
  -- same INSERT and upsert-by-ID draft-finalization paths used by the web app.
  foreach broken in array array[false, true] loop
    foreach manual in array array[false, true] loop
      report_id := gen_random_uuid();
      perform set_config('request.jwt.claim.sub', fixture.scout_user_id::text, true);
      perform set_config('role', 'authenticated', true);

      insert into public.scouting_entries (
        id, organization_id, event_id, team_id, match_id, scout_user_id,
        entry_type, form_version, payload, status
      ) values (
        report_id, fixture.organization_id, fixture.event_id, fixture.team_id,
        case when manual then null else fixture.match_id end, fixture.scout_user_id,
        'match', 4,
        jsonb_build_object(
          'robot_broke', broken,
          'breakage_issues', '[{"timestamp":"0:00","issue":"Regression: robot did not move"}]'::jsonb,
          'manual_match', case when manual then '{"stage":"Other / exception","label":"header-regression"}'::jsonb else null end
        ), 'draft'
      );

      perform set_config('role', 'postgres', true);
      if exists (select 1 from public.breakage_slack_notifications where entry_id = report_id) then
        raise exception 'Drafts must not queue breakage alerts';
      end if;

      perform set_config('role', 'authenticated', true);
      insert into public.scouting_entries (
        id, organization_id, event_id, team_id, match_id, scout_user_id,
        entry_type, form_version, payload, status, submitted_at
      )
      select id, organization_id, event_id, team_id, match_id, scout_user_id,
        entry_type, form_version, payload, 'submitted', now()
      from public.scouting_entries where id = report_id
      on conflict (id) do update
        set status = excluded.status, submitted_at = excluded.submitted_at;

      perform set_config('role', 'postgres', true);
      if not exists (select 1 from public.scouting_entries where id = report_id and status = 'submitted') then
        raise exception 'Draft finalization did not save the report';
      end if;

      -- Retrying a finalized report must not create another alert.
      update public.scouting_entries set status = 'submitted' where id = report_id;
      select id into notification_id from public.breakage_slack_notifications where entry_id = report_id;
      if broken <> (notification_id is not null) then
        raise exception 'Only broken submitted reports should queue an alert';
      end if;
      if notification_id is not null then
        select count(*) into request_count
        from net.http_request_queue request
        where convert_from(request.body, 'UTF8')::jsonb = jsonb_build_object('notification_id', notification_id)
          and request.headers ->> 'Content-Type' = 'application/json'
          and request.headers ->> 'x-breakage-notification-secret' = (
            select decrypted_secret from vault.decrypted_secrets
            where name = 'slack_breakage_notification_secret'
          );
        if request_count <> 1 then
          raise exception 'Expected exactly one request with valid JSON and secret headers';
        end if;
      end if;
    end loop;
  end loop;

  -- Also exercise submitting a broken report directly, without saving a draft.
  report_id := gen_random_uuid();
  perform set_config('role', 'authenticated', true);
  insert into public.scouting_entries (
    id, organization_id, event_id, team_id, match_id, scout_user_id,
    entry_type, form_version, payload, status, submitted_at
  ) values (
    report_id, fixture.organization_id, fixture.event_id, fixture.team_id,
    fixture.match_id, fixture.scout_user_id, 'match', 4,
    '{"robot_broke":true,"breakage_issues":[{"timestamp":"0:00","issue":"Regression: direct submission"}]}'::jsonb,
    'submitted', now()
  );
  perform set_config('role', 'postgres', true);
  if not exists (select 1 from public.breakage_slack_notifications where entry_id = report_id) then
    raise exception 'Direct submission did not queue the breakage alert';
  end if;
end;
$test$;

rollback;
select 'Passed: authenticated submissions, draft finalization, healthy/manual reports, valid headers, and one alert per report; all writes rolled back' as result;
