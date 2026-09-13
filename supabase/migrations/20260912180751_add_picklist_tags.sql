begin;

-- Tags are defined once per organization and can be applied in any combination
-- to a team's shared ranking for an event.
create table public.picklist_tags (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 48),
  color text not null check (color ~ '^#[0-9A-Fa-f]{6}$'),
  sort_order integer not null default 0 check (sort_order >= 0),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

create index picklist_tags_organization_order_idx on public.picklist_tags(organization_id, sort_order, name);
create trigger picklist_tags_updated_at before update on public.picklist_tags for each row execute procedure public.set_updated_at();
alter table public.picklist_tags enable row level security;

create policy "organization members read picklist tags"
on public.picklist_tags for select to authenticated
using (private.is_organization_member(organization_id));

create policy "picklist collaborators create tags"
on public.picklist_tags for insert to authenticated
with check (
  created_by = (select auth.uid())
  and private.has_organization_role(
    organization_id,
    array['strategist','master','admin','developer','global_scout']::public.organization_role[]
  )
);

create policy "picklist collaborators update tags"
on public.picklist_tags for update to authenticated
using (private.has_organization_role(
  organization_id,
  array['strategist','master','admin','developer','global_scout']::public.organization_role[]
))
with check (private.has_organization_role(
  organization_id,
  array['strategist','master','admin','developer','global_scout']::public.organization_role[]
));

create policy "picklist collaborators delete tags"
on public.picklist_tags for delete to authenticated
using (private.has_organization_role(
  organization_id,
  array['strategist','master','admin','developer','global_scout']::public.organization_role[]
));

grant select, insert, update, delete on public.picklist_tags to authenticated;
alter publication supabase_realtime add table public.picklist_tags;

alter table public.shared_picklist_rankings
  add column tag_ids uuid[] not null default '{}';

create index shared_picklist_rankings_tag_ids_idx
on public.shared_picklist_rankings using gin(tag_ids);

-- Keep browser writes within the current organization even though tag IDs are
-- stored as an array for a single, atomic ranking update.
create function private.are_valid_picklist_tags(target_organization uuid, requested_tag_ids uuid[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
    select 1
    from unnest(coalesce(requested_tag_ids, '{}'::uuid[])) as requested_tag_id
    left join public.picklist_tags tag
      on tag.id = requested_tag_id
      and tag.organization_id = target_organization
    where tag.id is null
  );
$$;
revoke all on function private.are_valid_picklist_tags(uuid, uuid[]) from public, anon, authenticated;

drop policy "picklist collaborators create shared rankings" on public.shared_picklist_rankings;
create policy "picklist collaborators create shared rankings"
on public.shared_picklist_rankings for insert to authenticated
with check (
  updated_by = (select auth.uid())
  and private.are_valid_picklist_tags(organization_id, tag_ids)
  and private.has_organization_role(
    organization_id,
    array['strategist','master','admin','developer','global_scout']::public.organization_role[]
  )
);

drop policy "picklist collaborators update shared rankings" on public.shared_picklist_rankings;
create policy "picklist collaborators update shared rankings"
on public.shared_picklist_rankings for update to authenticated
using (private.has_organization_role(
  organization_id,
  array['strategist','master','admin','developer','global_scout']::public.organization_role[]
))
with check (
  updated_by = (select auth.uid())
  and private.are_valid_picklist_tags(organization_id, tag_ids)
  and private.has_organization_role(
    organization_id,
    array['strategist','master','admin','developer','global_scout']::public.organization_role[]
  )
);

-- Removing a tag removes it from every affected ranking and creates a normal
-- shared-history entry for the resulting change.
create function private.remove_picklist_tag_references()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.shared_picklist_rankings
  set tag_ids = array_remove(tag_ids, old.id)
  where old.id = any(tag_ids);
  return old;
end;
$$;
create trigger picklist_tag_cleanup
after delete on public.picklist_tags
for each row execute procedure private.remove_picklist_tag_references();
revoke execute on function private.remove_picklist_tag_references() from public, anon, authenticated;

-- Include tag edits in the existing, undoable shared picklist audit trail.
create or replace function private.log_shared_picklist_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  old_state jsonb;
  new_state jsonb;
begin
  if tg_op = 'INSERT' then
    new_state := jsonb_build_object(
      'rank', new.rank,
      'category_id', new.category_id,
      'note', new.note,
      'selected', new.selected,
      'tag_ids', new.tag_ids
    );
    insert into public.picklist_change_log (organization_id, event_id, team_id, actor_user_id, action, after_state)
      values (new.organization_id, new.event_id, new.team_id, auth.uid(), 'created', new_state);
    return new;
  end if;

  old_state := jsonb_build_object(
    'rank', old.rank,
    'category_id', old.category_id,
    'note', old.note,
    'selected', old.selected,
    'tag_ids', old.tag_ids
  );
  new_state := jsonb_build_object(
    'rank', new.rank,
    'category_id', new.category_id,
    'note', new.note,
    'selected', new.selected,
    'tag_ids', new.tag_ids
  );
  if old_state is distinct from new_state then
    insert into public.picklist_change_log (organization_id, event_id, team_id, actor_user_id, action, before_state, after_state)
      values (new.organization_id, new.event_id, new.team_id, auth.uid(), 'updated', old_state, new_state);
  end if;
  return new;
end;
$$;
revoke execute on function private.log_shared_picklist_change() from public, anon, authenticated;

-- These are a useful starting set. Organizations can add, recolor, reorder,
-- or remove tags from the picklist UI without a schema change.
insert into public.picklist_tags (organization_id, name, color, sort_order)
select organization.id, defaults.name, defaults.color, defaults.sort_order
from public.organizations organization
cross join (
  values
    ('First time driver', '#60A5FA', 0),
    ('Check in tomorrow', '#F59E0B', 1),
    ('Defense', '#A78BFA', 2)
) as defaults(name, color, sort_order)
on conflict (organization_id, name) do nothing;

commit;
