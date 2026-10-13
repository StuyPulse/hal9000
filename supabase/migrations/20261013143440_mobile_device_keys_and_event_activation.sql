-- Local-only until separately approved. No secret/private signing keys are stored.
create table public.mobile_device_keys (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  public_key text not null check (public_key ~ '^[A-Za-z0-9+/]{43}=$'),
  name text not null check (length(name) between 1 and 80),
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
alter table public.mobile_device_keys enable row level security;
-- Registration/revocation is server-only after getUser(token) verification.
-- Device owners may read their own key registrations; other members cannot.
grant select on public.mobile_device_keys to authenticated;
grant select, insert, update, delete on public.mobile_device_keys to service_role;
revoke insert, update, delete on public.mobile_device_keys from anon, authenticated;
create policy "owners read mobile device registrations" on public.mobile_device_keys
for select to authenticated using (user_id = (select auth.uid()));
create index mobile_device_keys_user_id_idx on public.mobile_device_keys(user_id);

-- A single transaction preserves the previous active event if activation fails.
-- Advisory locking serializes competing changes within one organization.
create or replace function public.mobile_activate_event(target_event_id uuid)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare target_org uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select e.organization_id into target_org from public.events e
  join public.organization_members m on m.organization_id = e.organization_id
  where e.id = target_event_id and m.user_id = auth.uid() and m.role::text in ('admin','developer');
  if target_org is null then raise exception 'Admin access required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(target_org::text, 694));
  update public.events set status = 'upcoming'
    where organization_id = target_org and status = 'active' and id <> target_event_id;
  update public.events set status = 'active' where id = target_event_id and organization_id = target_org;
  if not found then raise exception 'Selected event is unavailable'; end if;
  return target_event_id;
end;
$$;
revoke all on function public.mobile_activate_event(uuid) from public, anon;
grant execute on function public.mobile_activate_event(uuid) to authenticated;

-- Server-only atomic deletion. The caller identity is verified by Auth in the
-- API and independently checked against current membership inside this RPC.
create or replace function public.mobile_delete_report(
  target_entry_id uuid, target_organization_id uuid, target_event_id uuid,
  caller_user_id uuid, expected_updated_at timestamptz
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare report public.scouting_entries%rowtype; reopened integer := 0;
begin
  select * into report from public.scouting_entries
    where id = target_entry_id and organization_id = target_organization_id
      and event_id = target_event_id for update;
  if not exists (select 1 from public.organization_members m
    where m.organization_id = target_organization_id and m.user_id = caller_user_id) then
    return jsonb_build_object('code','forbidden');
  end if;
  if report.id is null then return jsonb_build_object('deleted',true,'alreadyDeleted',true); end if;
  if report.scout_user_id <> caller_user_id and not exists (
    select 1 from public.organization_members m where m.organization_id = target_organization_id
      and m.user_id = caller_user_id and m.role::text in ('admin','developer')
  ) then return jsonb_build_object('code','forbidden'); end if;
  if report.updated_at is distinct from expected_updated_at then
    return jsonb_build_object('code','conflict');
  end if;
  if report.entry_type = 'match' and report.match_id is not null then
    -- Locks serialize the existing completion trigger with reopening. A new
    -- report committed afterward runs its trigger against the reopened row.
    perform 1 from public.scouting_assignments a
      where a.match_id = report.match_id and a.team_id = report.team_id
        and a.scout_user_id = report.scout_user_id and a.assignment_type = 'objective'
      order by a.id for update;
  end if;
  delete from public.scouting_entries where id = report.id;
  if report.entry_type = 'match' and report.match_id is not null then
    update public.scouting_assignments a set status = 'pending', completed_at = null
      where a.match_id = report.match_id and a.team_id = report.team_id
        and a.scout_user_id = report.scout_user_id and a.assignment_type = 'objective'
        and not exists (select 1 from public.scouting_entries other
          where other.organization_id = target_organization_id
            and other.entry_type = 'match' and other.status = 'submitted'
            and other.match_id = a.match_id and other.team_id = a.team_id
            and other.scout_user_id = a.scout_user_id);
    get diagnostics reopened = row_count;
  end if;
  return jsonb_build_object('deleted',true,'assignmentReopened',reopened > 0);
end;
$$;
revoke all on function public.mobile_delete_report(uuid, uuid, uuid, uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.mobile_delete_report(uuid, uuid, uuid, uuid, timestamptz) to service_role;

-- Move an existing manual report and reconcile both assignment slots atomically.
create or replace function public.mobile_correct_manual_report(
  target_entry_id uuid, target_organization_id uuid, target_event_id uuid,
  caller_user_id uuid, expected_updated_at timestamptz,
  corrected_team_id uuid, corrected_match_id uuid, corrected_payload jsonb
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare report public.scouting_entries%rowtype; confirmed public.scouting_entries%rowtype;
begin
  select * into report from public.scouting_entries
    where id = target_entry_id and organization_id = target_organization_id
      and event_id = target_event_id for update;
  if report.id is null or report.entry_type <> 'match' or report.form_version <> 4
    or report.status <> 'submitted' or jsonb_typeof(report.payload -> 'manual_match') is distinct from 'object' then
    return jsonb_build_object('code','manual_report_unavailable');
  end if;
  if not exists (select 1 from public.organization_members m
    where m.organization_id = target_organization_id and m.user_id = caller_user_id
      and (report.scout_user_id = caller_user_id or m.role::text in ('admin','developer'))) then
    return jsonb_build_object('code','forbidden');
  end if;
  if report.updated_at is distinct from expected_updated_at then return jsonb_build_object('code','conflict'); end if;
  if not exists (select 1 from public.event_teams t where t.event_id = target_event_id and t.team_id = corrected_team_id) then
    return jsonb_build_object('code','invalid_team');
  end if;
  if corrected_match_id is not null and not exists (select 1 from public.matches m
    where m.id = corrected_match_id and m.event_id = target_event_id
      and corrected_team_id = any(case corrected_payload #>> '{manual_match,alliance}'
        when 'red' then m.red_teams when 'blue' then m.blue_teams else array[]::uuid[] end)) then
    return jsonb_build_object('code','invalid_match');
  end if;
  -- Consistent lock order for both slots serializes concurrent submission
  -- completion triggers with the old-slot NOT EXISTS reopening decision.
  perform 1 from public.scouting_assignments a where a.scout_user_id = report.scout_user_id
    and a.assignment_type = 'objective' and (
      (a.match_id = report.match_id and a.team_id = report.team_id)
      or (a.match_id = corrected_match_id and a.team_id = corrected_team_id)
    ) order by a.id for update;
  update public.scouting_entries set payload = corrected_payload,
    team_id = corrected_team_id, match_id = corrected_match_id,
    last_edited_by = caller_user_id where id = report.id;
  -- The existing completion/link triggers run within this same transaction.
  if report.match_id is not null and (report.match_id is distinct from corrected_match_id or report.team_id is distinct from corrected_team_id) then
    update public.scouting_assignments a set status = 'pending', completed_at = null
      where a.match_id = report.match_id and a.team_id = report.team_id
        and a.scout_user_id = report.scout_user_id and a.assignment_type = 'objective'
        and not exists (select 1 from public.scouting_entries other
          where other.organization_id = target_organization_id
            and other.entry_type = 'match' and other.status = 'submitted'
            and other.match_id = a.match_id and other.team_id = a.team_id
            and other.scout_user_id = a.scout_user_id);
  end if;
  select * into confirmed from public.scouting_entries where id = report.id;
  return jsonb_build_object('entry',to_jsonb(confirmed));
end;
$$;
revoke all on function public.mobile_correct_manual_report(uuid, uuid, uuid, uuid, timestamptz, uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.mobile_correct_manual_report(uuid, uuid, uuid, uuid, timestamptz, uuid, uuid, jsonb) to service_role;
