create or replace function private.validate_match_report_source()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  source_match_key text;
begin
  if not exists (
    select 1
    from public.events event
    join public.event_teams event_team on event_team.event_id = event.id
    where event.id = new.event_id
      and event.organization_id = new.organization_id
      and event_team.team_id = new.team_id
  ) then
    raise exception 'Match report source must belong to this event and team.';
  end if;

  if new.selected_entry_id is null then
    return new;
  end if;

  select case
    when entry.match_id is not null then 'scheduled:' || entry.match_id::text
    when entry.payload->'manual_match' is not null
      and nullif(trim(entry.payload->'manual_match'->>'stage'), '') is not null
      and nullif(trim(entry.payload->'manual_match'->>'label'), '') is not null
      then 'manual:' || lower(trim(entry.payload->'manual_match'->>'stage')) || ':' || lower(trim(entry.payload->'manual_match'->>'label'))
    else 'report:' || entry.id::text
  end
  into source_match_key
  from public.scouting_entries entry
  where entry.id = new.selected_entry_id
    and entry.organization_id = new.organization_id
    and entry.event_id = new.event_id
    and entry.team_id = new.team_id
    and entry.entry_type = 'match'
    and entry.status = 'submitted';

  if source_match_key is distinct from new.match_key then
    raise exception 'Selected report must belong to this team and match.';
  end if;

  return new;
end;
$$;
