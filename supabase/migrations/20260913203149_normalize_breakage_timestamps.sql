-- Persist compact match timestamps as M:SS, matching the scouting input.
update public.scouting_entries
set payload = jsonb_set(
  payload,
  '{breakage_issues}',
  (
    select jsonb_agg(
      case when issue ->> 'timestamp' ~ '^[0-9]{2,3}$'
        then jsonb_set(issue, '{timestamp}', to_jsonb(substr(issue ->> 'timestamp', 1, 1) || ':' || substr(issue ->> 'timestamp', 2)), false)
        else issue
      end
    )
    from jsonb_array_elements(payload -> 'breakage_issues') as issue
  ),
  false
)
where payload ? 'breakage_issues';

update public.scouting_entries
set payload = jsonb_set(
  payload,
  '{break_timestamp}',
  to_jsonb(substr(payload ->> 'break_timestamp', 1, 1) || ':' || substr(payload ->> 'break_timestamp', 2)),
  false
)
where payload ->> 'break_timestamp' ~ '^[0-9]{2,3}$';
