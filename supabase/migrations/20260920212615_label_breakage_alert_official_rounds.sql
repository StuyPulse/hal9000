-- Store the official TBA round key so breakage alerts can name the actual playoff round.
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
  left join public.matches m on m.id = new.match_id
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
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-breakage-notification-secret', function_secret),
    body := jsonb_build_object('notification_id', notification_id)
  );
  return new;
end;
$$;
