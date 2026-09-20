-- Automatically attach manual reports only when their event, team, stage, and
-- numeric label point to one current official TBA match. Any ambiguity stays
-- unlinked for a human to review.
create or replace function private.link_manual_match_reports(
  p_event_id uuid,
  p_entry_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  linked_count integer := 0;
begin
  with candidate_matches as (
    select
      entry.id as entry_id,
      scheduled_match.id as match_id,
      count(*) over (partition by entry.id) as candidate_count
    from public.scouting_entries entry
    join public.matches scheduled_match
      on scheduled_match.event_id = entry.event_id
     and entry.team_id = any(scheduled_match.red_teams || scheduled_match.blue_teams)
     and case lower(trim(entry.payload #>> '{manual_match,stage}'))
       when 'practice' then scheduled_match.tba_match_key ~ ('_pm' || (entry.payload #>> '{manual_match,label}') || '$')
       when 'qualification' then scheduled_match.tba_match_key ~ ('_qm' || (entry.payload #>> '{manual_match,label}') || '$')
       when 'quarterfinal' then scheduled_match.tba_match_key ~ ('_qf' || (entry.payload #>> '{manual_match,label}') || 'm1$')
       when 'semifinal' then scheduled_match.tba_match_key ~ ('_sf' || (entry.payload #>> '{manual_match,label}') || 'm1$')
       when 'final' then scheduled_match.tba_match_key ~ ('_f1m' || (entry.payload #>> '{manual_match,label}') || '$')
       else false
     end
    where entry.event_id = p_event_id
      and (p_entry_id is null or entry.id = p_entry_id)
      and entry.entry_type = 'match'
      and entry.status = 'submitted'
      and entry.match_id is null
      and jsonb_typeof(entry.payload -> 'manual_match') = 'object'
      and coalesce(entry.payload #>> '{manual_match,label}', '') ~ '^[0-9]+$'
  ), linked as (
    update public.scouting_entries entry
    set match_id = candidate_matches.match_id
    from candidate_matches
    where entry.id = candidate_matches.entry_id
      and candidate_matches.candidate_count = 1
    returning entry.id
  )
  select count(*) into linked_count from linked;

  return linked_count;
end;
$$;

create or replace function public.reconcile_manual_match_reports(p_event_id uuid)
returns integer
language sql
security definer
set search_path = ''
as $$
  select private.link_manual_match_reports(p_event_id);
$$;

revoke all on function public.reconcile_manual_match_reports(uuid) from public, anon, authenticated;
grant execute on function public.reconcile_manual_match_reports(uuid) to service_role;

create or replace function private.auto_link_submitted_manual_match_report()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.entry_type = 'match'
    and new.status = 'submitted'
    and new.match_id is null
    and jsonb_typeof(new.payload -> 'manual_match') = 'object'
    and coalesce(new.payload #>> '{manual_match,label}', '') ~ '^[0-9]+$' then
    perform private.link_manual_match_reports(new.event_id, new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists auto_link_submitted_manual_match_report on public.scouting_entries;
create trigger auto_link_submitted_manual_match_report
after insert or update of status, payload, team_id, match_id on public.scouting_entries
for each row
when (new.match_id is null)
execute function private.auto_link_submitted_manual_match_report();

-- Reconcile the existing safe matches once so this improvement also removes
-- any currently-linkable backlog without touching ambiguous reports.
select public.reconcile_manual_match_reports(id)
from public.events
where is_manual is false;

-- The automatic linker is an AFTER trigger. Read the persisted report row
-- when queueing an alert so a simultaneous breakage alert receives its new
-- official match key rather than the pre-link value from NEW.
create or replace function private.queue_slack_breakage_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  notification_id uuid;
  function_secret text;
  team_number integer;
  event_name text;
  match_number integer;
  match_type public.match_type;
  match_tba_key text;
  scout_name text;
begin
  if new.entry_type <> 'match'
    or new.status <> 'submitted'
    or coalesce((new.payload ->> 'robot_broke')::boolean, false) is not true
    or (tg_op = 'UPDATE' and old.status = 'submitted') then
    return new;
  end if;

  select t.team_number, e.name, m.match_number, m.match_type, m.tba_match_key, p.display_name
  into team_number, event_name, match_number, match_type, match_tba_key, scout_name
  from public.teams t
  join public.events e on e.id = new.event_id
  left join public.scouting_entries persisted_entry on persisted_entry.id = new.id
  left join public.matches m on m.id = coalesce(persisted_entry.match_id, new.match_id)
  join public.profiles p on p.id = new.scout_user_id
  where t.id = new.team_id;

  insert into public.breakage_slack_notifications (entry_id, payload)
  values (
    new.id,
    jsonb_strip_nulls(jsonb_build_object(
      'event_name', event_name,
      'team_number', team_number,
      'match_number', match_number,
      'match_type', match_type,
      'tba_match_key', match_tba_key,
      'manual_match', new.payload -> 'manual_match',
      'scout_name', scout_name,
      'issues', coalesce(new.payload -> 'breakage_issues', '[]'::jsonb)
    ))
  )
  on conflict (entry_id) do nothing
  returning id into notification_id;

  if notification_id is null then return new; end if;

  select secret.decrypted_secret into function_secret
  from vault.decrypted_secrets as secret
  where secret.name = 'slack_breakage_notification_secret';
  if coalesce(function_secret, '') = '' then return new; end if;

  perform net.http_post(
    url := 'https://wutzpdkmlafwqqgxmqlh.supabase.co/functions/v1/slack-breakage-notify',
    headers := jsonb_build_object('Content-Type', 'x-breakage-notification-secret', function_secret),
    body := jsonb_build_object('notification_id', notification_id)
  );
  return new;
end;
$$;
