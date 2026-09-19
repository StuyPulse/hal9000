-- Pit reports are a shared event record: any signed-in organization member can
-- correct their contents. A trigger keeps immutable report identity fields
-- (including the original scout) from being reassigned through direct writes.
alter table public.scouting_entries
  add column last_edited_by uuid references public.profiles(id) on delete set null;

create policy "members update pit scouting entries"
on public.scouting_entries for update to authenticated
using (
  entry_type = 'pit'
  and private.is_organization_member(organization_id)
)
with check (
  entry_type = 'pit'
  and private.is_organization_member(organization_id)
);

create or replace function private.preserve_pit_scouting_entry_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.organization_id is distinct from old.organization_id
    or new.event_id is distinct from old.event_id
    or new.team_id is distinct from old.team_id
    or new.match_id is distinct from old.match_id
    or new.assignment_id is distinct from old.assignment_id
    or new.scout_user_id is distinct from old.scout_user_id
    or new.entry_type is distinct from old.entry_type
    or new.created_at is distinct from old.created_at
  then
    raise exception 'Pit scouting reports keep their original identity.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function private.preserve_pit_scouting_entry_identity() from public, anon, authenticated;

create trigger preserve_pit_scouting_entry_identity_before_update
before update on public.scouting_entries
for each row
when (old.entry_type = 'pit')
execute function private.preserve_pit_scouting_entry_identity();

create or replace function private.record_pit_scouting_entry_editor()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    new.last_edited_by = auth.uid();
  end if;

  return new;
end;
$$;

revoke all on function private.record_pit_scouting_entry_editor() from public, anon, authenticated;

create trigger record_pit_scouting_entry_editor_before_update
before update on public.scouting_entries
for each row
when (old.entry_type = 'pit')
execute function private.record_pit_scouting_entry_editor();
