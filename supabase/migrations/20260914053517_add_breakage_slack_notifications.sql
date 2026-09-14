-- Post exactly one private Slack alert when a scout submits a match report
-- marking a robot as broken or disabled. The webhook URL is never stored here.
create extension if not exists pg_net;

create table if not exists public.breakage_slack_notifications (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null unique references public.scouting_entries(id) on delete cascade,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  delivered_at timestamptz,
  failure text,
  created_at timestamptz not null default now()
);

alter table public.breakage_slack_notifications enable row level security;
revoke all on public.breakage_slack_notifications from anon, authenticated;

-- The Edge Function requires BREAKAGE_NOTIFICATION_SECRET. Store the same
-- random value in Supabase Vault under this name; do not put the value in Git.
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
  scout_name text;
begin
  if new.entry_type <> 'match'
    or new.status <> 'submitted'
    or coalesce((new.payload ->> 'robot_broke')::boolean, false) is not true
    or (tg_op = 'UPDATE' and old.status = 'submitted') then
    return new;
  end if;

  select t.team_number, e.name, m.match_number, p.display_name
  into team_number, event_name, match_number, scout_name
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
      'scout_name', scout_name,
      'issues', coalesce(new.payload -> 'breakage_issues', '[]'::jsonb)
    ))
  )
  on conflict (entry_id) do nothing
  returning id into notification_id;

  if notification_id is null then
    return new;
  end if;

  select secret.decrypted_secret
  into function_secret
  from vault.decrypted_secrets as secret
  where secret.name = 'slack_breakage_notification_secret';

  if coalesce(function_secret, '') = '' then
    return new;
  end if;

  perform net.http_post(
    url := 'https://wutzpdkmlafwqqgxmqlh.supabase.co/functions/v1/slack-breakage-notify',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-breakage-notification-secret', function_secret
    ),
    body := jsonb_build_object('notification_id', notification_id)
  );

  return new;
end;
$$;

revoke all on function private.queue_slack_breakage_notification() from public, anon, authenticated;

drop trigger if exists scouting_entries_queue_slack_breakage_notification on public.scouting_entries;
create trigger scouting_entries_queue_slack_breakage_notification
after insert or update of status on public.scouting_entries
for each row execute function private.queue_slack_breakage_notification();
