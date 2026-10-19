-- Local release candidate only. No retroactive rewrites or deletions.
-- This baseline protects shared text; photos and drawings need separate moderation.
begin;
create or replace function private.content_text_blocked(value text)
returns boolean language sql immutable security invoker set search_path = '' as $$
  select coalesce(
    translate(regexp_replace(lower(normalize(value, NFKC)), U&'[\200B-\200D\2060\FEFF]', '', 'g'), '013457@$', 'oieastas')
    ~ '(^|[^a-z0-9])(f[^a-z0-9]*u[^a-z0-9]*c[^a-z0-9]*k(ing|ed|er|ers|s)?|motherfuck(er|ers|ing)?|shit(s|ty|ting|ted)?|bullshit|bitch(es|ing|y)?|asshole(s)?|cunt(s)?|nigger(s)?|faggot(s)?)([^a-z0-9]|$)', false);
$$;

create or replace function private.content_json_blocked(value jsonb)
returns boolean language sql immutable security invoker set search_path = '' as $$
  select exists (
    select 1 from jsonb_path_query(value, 'strict $.** ? (@.type() == "string")') as item
    where private.content_text_blocked(item #>> '{}')
  );
$$;

create or replace function private.filter_shared_text()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare field text; incoming jsonb := to_jsonb(new); publishing boolean := false;
begin
  if tg_table_name = 'scouting_entries' and tg_op = 'UPDATE' then
    publishing := new.status = 'submitted' and old.status is distinct from new.status;
  end if;
  foreach field in array tg_argv loop
    -- A rank-only edit must not be blocked by an unchanged legacy note.
    if tg_op = 'UPDATE' then
      if not publishing and incoming -> field is not distinct from to_jsonb(old) -> field then continue; end if;
    end if;
    if private.content_json_blocked(incoming -> field) then
      raise exception using errcode = 'P0001', message = 'Content safety: revise inappropriate language before sharing. Your saved local work is retained.';
    end if;
  end loop;
  return new;
end;
$$;

-- Trigger functions do not need to be callable from the Data API. Helpers are
-- invoker-only, read no tables, and retain permissions needed inside triggers.
revoke all on function private.filter_shared_text() from public, anon, authenticated;
revoke all on function private.content_text_blocked(text) from public, anon;
revoke all on function private.content_json_blocked(jsonb) from public, anon;
grant usage on schema private to service_role;
grant execute on function private.content_text_blocked(text), private.content_json_blocked(jsonb) to authenticated, service_role;

create trigger filter_scouting_text before insert or update of payload, status on public.scouting_entries
for each row execute function private.filter_shared_text('payload');
create trigger filter_team_notes before insert or update of note on public.team_notes
for each row execute function private.filter_shared_text('note');
create trigger filter_shared_picklist_notes before insert or update of note on public.shared_picklist_rankings
for each row execute function private.filter_shared_text('note');
create trigger filter_personal_picklist_notes before insert or update of note on public.picklist_rankings
for each row execute function private.filter_shared_text('note');
create trigger filter_picklist_category_names before insert or update of name on public.picklist_categories
for each row execute function private.filter_shared_text('name');
create trigger filter_picklist_tag_names before insert or update of name on public.picklist_tags
for each row execute function private.filter_shared_text('name');
commit;
