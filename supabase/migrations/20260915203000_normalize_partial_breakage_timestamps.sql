-- Match timestamps are stored as M:SS. Repair values created while the
-- two-part input allowed either side of the colon to be left blank.
update public.scouting_entries entry
set payload = jsonb_set(
  entry.payload,
  '{breakage_issues}',
  (
    select jsonb_agg(
      case
        when issue ->> 'timestamp' ~ '^:[0-9]{1,2}$'
          then jsonb_set(issue, '{timestamp}', to_jsonb('0:' || lpad(substr(issue ->> 'timestamp', 2), 2, '0')), false)
        when issue ->> 'timestamp' ~ '^[0-9]:$'
          then jsonb_set(issue, '{timestamp}', to_jsonb((issue ->> 'timestamp') || '00'), false)
        else issue
      end
      order by position
    )
    from jsonb_array_elements(entry.payload -> 'breakage_issues') with ordinality as items(issue, position)
  ),
  false
)
where jsonb_typeof(entry.payload -> 'breakage_issues') = 'array'
  and exists (
    select 1
    from jsonb_array_elements(entry.payload -> 'breakage_issues') issue
    where issue ->> 'timestamp' ~ '^:[0-9]{1,2}$|^[0-9]:$'
  );

update public.scouting_entries
set payload = jsonb_set(
  payload,
  '{break_timestamp}',
  to_jsonb(
    case
      when payload ->> 'break_timestamp' ~ '^:[0-9]{1,2}$'
        then '0:' || lpad(substr(payload ->> 'break_timestamp', 2), 2, '0')
      when payload ->> 'break_timestamp' ~ '^[0-9]:$'
        then (payload ->> 'break_timestamp') || '00'
    end
  ),
  false
)
where payload ->> 'break_timestamp' ~ '^:[0-9]{1,2}$|^[0-9]:$';
