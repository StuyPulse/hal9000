-- Manager identities are resolved from verified Auth accounts, not editable names.
create table private.email_access_managers (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table private.email_access_managers enable row level security;
revoke all on private.email_access_managers from public, anon, authenticated;
insert into private.email_access_managers (user_id)
select id from auth.users
where lower(email) in ('tahmid.islam@stuypulse.com', 'mekot.sarder@stuypulse.com', 'joe.blay@stuypulse.com')
  and email_confirmed_at is not null;
do $$ begin
  if (select count(*) from private.email_access_managers) <> 3 then
    raise exception 'All three email-access managers must have verified accounts before migration.';
  end if;
end $$;

create function private.can_manage_email_access() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from private.email_access_managers where user_id = auth.uid()
  );
$$;
revoke all on function private.can_manage_email_access() from public;
grant execute on function private.can_manage_email_access() to authenticated;

create function public.can_manage_email_access() returns boolean
language sql stable security invoker set search_path = '' as $$
  select private.can_manage_email_access();
$$;
revoke all on function public.can_manage_email_access() from public;
grant execute on function public.can_manage_email_access() to authenticated;

create table public.authorized_emails (
  email text primary key check (email = lower(btrim(email)) and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
alter table public.authorized_emails enable row level security;
revoke all on public.authorized_emails from anon, authenticated;
grant select, insert on public.authorized_emails to authenticated;
grant all on public.authorized_emails to service_role;
create policy "Only email access managers can view exceptions"
  on public.authorized_emails for select to authenticated
  using ((select private.can_manage_email_access()));
create policy "Only email access managers can add exceptions"
  on public.authorized_emails for insert to authenticated
  with check ((select private.can_manage_email_access()) and created_by = (select auth.uid()));
insert into public.authorized_emails (email, created_by)
values ('seb@sebastianw.tech', null), ('dommasiello27@gmail.com', null);

create or replace function private.enforce_stuypulse_email()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.email is null or (
    right(lower(new.email), length('@stuypulse.com')) <> '@stuypulse.com'
    and not exists (select 1 from public.authorized_emails where email = lower(new.email))
  ) then
    raise exception 'HAL9000 is restricted to @stuypulse.com accounts and explicitly authorized exceptions.' using errcode = '22023';
  end if;
  return new;
end;
$$;
