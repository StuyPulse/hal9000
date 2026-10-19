-- A private-to-reporter/admin moderation inbox; no source content is copied.
create table public.content_reports (
 id uuid primary key,
 organization_id uuid not null references public.organizations(id) on delete cascade,
 event_id uuid not null references public.events(id) on delete cascade,
 reporter_id uuid not null references auth.users(id) on delete cascade,
 target_kind text not null check (target_kind in ('report','photo','workspace')),
 target_id uuid,
 reason text not null check (reason in ('harassment','inappropriate','privacy','other')),
 details text not null check (char_length(details) between 1 and 2000),
 status text not null default 'open' check (status in ('open','action_taken','dismissed')),
 resolution text check (char_length(resolution) between 1 and 1000),
 reviewed_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),
 reviewed_at timestamptz,
 check ((target_kind='workspace' and target_id is null) or (target_kind<>'workspace' and target_id is not null)),
 check ((status='open' and resolution is null and reviewed_at is null and reviewed_by is null) or
        (status<>'open' and resolution is not null and reviewed_at is not null))
);
alter table public.content_reports enable row level security;
revoke all on public.content_reports from public,anon,authenticated;
grant select on public.content_reports to authenticated;
grant all on public.content_reports to service_role;
create index content_reports_inbox_idx on public.content_reports(organization_id,status,created_at desc,id);
create policy "Reporters and organization managers read safety reports"
 on public.content_reports for select to authenticated
 using (private.is_organization_member(organization_id) and
   (reporter_id=(select auth.uid()) or private.has_organization_role(organization_id,array['admin','developer']::public.organization_role[])));
-- Mutations go through the authenticated mobile API: target/event scope and
-- immutable retry identity are checked there. No client INSERT/UPDATE grants.

-- Serialize each reporter's submissions so concurrent requests cannot bypass
-- the resource limit. Stored source content is never scanned or copied here.
create function private.limit_content_reports() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.reporter_id::text,0));
 if (select count(*) from public.content_reports where reporter_id=new.reporter_id
     and created_at>now()-interval '24 hours')>=50 then
  raise exception 'Safety report rate limit' using errcode='23514';
 end if;
 return new;
end;
$$;
revoke all on function private.limit_content_reports() from public,anon,authenticated;
grant execute on function private.limit_content_reports() to service_role;
create trigger content_reports_limit before insert on public.content_reports
 for each row execute function private.limit_content_reports();
