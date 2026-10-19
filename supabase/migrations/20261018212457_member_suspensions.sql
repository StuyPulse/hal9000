create table public.member_suspensions (
 organization_id uuid not null references public.organizations(id) on delete cascade,
 user_id uuid not null references public.profiles(id) on delete cascade,
 previous_role public.organization_role not null,
 reason text not null check (char_length(reason) between 1 and 500),
 suspended_by uuid references auth.users(id) on delete set null,
 suspended_at timestamptz not null default now(),
 restored_at timestamptz,
 primary key(organization_id,user_id)
);
alter table public.member_suspensions enable row level security;
revoke all on public.member_suspensions from public,anon,authenticated;
grant select on public.member_suspensions to authenticated;
grant all on public.member_suspensions to service_role;
create policy "Managers read team suspensions" on public.member_suspensions
 for select to authenticated using (private.has_organization_role(organization_id,array['admin','developer']::public.organization_role[]));

-- Service-only transport. Caller identity is verified from Bearer auth by the
-- mobile API; permissions are rechecked inside this transaction, never metadata.
create function public.mobile_set_member_suspension(target_organization uuid,caller_user uuid,target_user uuid,restore_access boolean,suspension_reason text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare member_role public.organization_role; archived public.member_suspensions%rowtype;
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(target_organization::text,1));
 if caller_user=target_user or not exists(select 1 from public.organization_members where organization_id=target_organization and user_id=caller_user and role in ('admin','developer')) then
  return jsonb_build_object('code','forbidden');
 end if;
 select * into archived from public.member_suspensions where organization_id=target_organization and user_id=target_user for update;
 if restore_access then
  if archived.user_id is null then return jsonb_build_object('code','unavailable');end if;
  if archived.restored_at is null then
   insert into public.organization_members(organization_id,user_id,role) values(target_organization,target_user,archived.previous_role) on conflict(organization_id,user_id) do nothing;
   update public.member_suspensions set restored_at=now() where organization_id=target_organization and user_id=target_user;
  end if;
  return jsonb_build_object('suspended',false);
 end if;
 if suspension_reason is null or char_length(btrim(suspension_reason)) not between 1 and 500 then
  return jsonb_build_object('code','invalid_reason');
 end if;
 select role into member_role from public.organization_members where organization_id=target_organization and user_id=target_user for update;
 if member_role is null then
  if archived.user_id is not null and archived.restored_at is null then return jsonb_build_object('suspended',true);end if;
  return jsonb_build_object('code','unavailable');
 end if;
 -- The established last-admin trigger also applies; failure rolls back archive and deletion.
 insert into public.member_suspensions(organization_id,user_id,previous_role,reason,suspended_by)
 values(target_organization,target_user,member_role,btrim(suspension_reason),caller_user)
 on conflict(organization_id,user_id) do update set previous_role=excluded.previous_role,reason=excluded.reason,suspended_by=excluded.suspended_by,suspended_at=now(),restored_at=null;
 delete from public.organization_members where organization_id=target_organization and user_id=target_user;
 return jsonb_build_object('suspended',true);
end;
$$;
revoke all on function public.mobile_set_member_suspension(uuid,uuid,uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.mobile_set_member_suspension(uuid,uuid,uuid,boolean,text) to service_role;
