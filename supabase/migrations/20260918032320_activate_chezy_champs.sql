-- Keep the competition event in sync for deployments and preview databases.
-- The unique active-event index requires this two-step transition.
with target as (
  select organization_id
  from public.events
  where event_key = '2026cc'
)
update public.events
set status = 'upcoming'::public.event_status
where organization_id = (select organization_id from target)
  and status = 'active'::public.event_status;

update public.events
set status = 'active'::public.event_status
where event_key = '2026cc';
