create table public.strategy_drawings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  strokes jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, user_id),
  constraint strategy_drawings_strokes_array check (jsonb_typeof(strokes) = 'array')
);

create index strategy_drawings_event_user_idx on public.strategy_drawings(event_id, user_id);
create trigger strategy_drawings_updated_at before update on public.strategy_drawings for each row execute procedure public.set_updated_at();

alter table public.strategy_drawings enable row level security;

create policy "members read their strategy drawings"
on public.strategy_drawings for select to authenticated
using (user_id = (select auth.uid()) and private.is_organization_member(organization_id));

create policy "members create their strategy drawings"
on public.strategy_drawings for insert to authenticated
with check (user_id = (select auth.uid()) and private.is_organization_member(organization_id));

create policy "members update their strategy drawings"
on public.strategy_drawings for update to authenticated
using (user_id = (select auth.uid()) and private.is_organization_member(organization_id))
with check (user_id = (select auth.uid()) and private.is_organization_member(organization_id));

create policy "members delete their strategy drawings"
on public.strategy_drawings for delete to authenticated
using (user_id = (select auth.uid()) and private.is_organization_member(organization_id));

grant select, insert, update, delete on public.strategy_drawings to authenticated;
