create table public.match_report_sources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  match_key text not null check (char_length(match_key) between 1 and 160),
  selected_entry_id uuid references public.scouting_entries(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, team_id, match_key)
);

create index match_report_sources_event_team_idx on public.match_report_sources(event_id, team_id);
create trigger match_report_sources_updated_at before update on public.match_report_sources for each row execute procedure public.set_updated_at();

create or replace function private.validate_match_report_source()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  source_match_key text;
begin
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

create trigger validate_match_report_source_before_write
before insert or update on public.match_report_sources
for each row execute procedure private.validate_match_report_source();

alter table public.match_report_sources enable row level security;

create policy "members read match report sources"
on public.match_report_sources for select to authenticated
using (private.is_organization_member(organization_id));

create policy "members create match report sources"
on public.match_report_sources for insert to authenticated
with check (private.is_organization_member(organization_id));

create policy "members update match report sources"
on public.match_report_sources for update to authenticated
using (private.is_organization_member(organization_id))
with check (private.is_organization_member(organization_id));

create policy "members delete match report sources"
on public.match_report_sources for delete to authenticated
using (private.is_organization_member(organization_id));

grant select, insert, update, delete on public.match_report_sources to authenticated;
alter publication supabase_realtime add table public.match_report_sources;
