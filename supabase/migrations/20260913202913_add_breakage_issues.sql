-- Store every match-breakage incident as structured JSON within the existing
-- versioned scouting payload. The legacy fields remain for older readers.
update public.scouting_entries
set payload = jsonb_set(
  payload,
  '{breakage_issues}',
  jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
    'timestamp', nullif(payload ->> 'break_timestamp', ''),
    'issue', nullif(payload ->> 'break_tag', '')
  ))),
  true
)
where entry_type = 'match'
  and coalesce(payload ->> 'robot_broke', 'false') = 'true'
  and not payload ? 'breakage_issues'
  and (nullif(payload ->> 'break_timestamp', '') is not null or nullif(payload ->> 'break_tag', '') is not null);

alter table public.scouting_entries
  add constraint scouting_entries_breakage_issues_array_check
  check (
    not payload ? 'breakage_issues'
    or jsonb_typeof(payload -> 'breakage_issues') = 'array'
  );
