-- Allow the two field-map trench locations to be stored in match scouting payloads.
alter table public.scouting_entries
  drop constraint if exists scouting_entries_match_payload_shape_check;

alter table public.scouting_entries
  add constraint scouting_entries_match_payload_shape_check
  check (
    entry_type <> 'match'
    or (
      not (payload ? 'shifts')
      and not (payload ? 'climb')
      and (
        not (payload ? 'starting_spot')
        or payload ->> 'starting_spot' is null
        or payload ->> 'starting_spot' in (
          'line-1', 'depot', 'depot-bump', 'hub', 'outpost-bump', 'outpost', 'line-2',
          'depot-trench', 'outpost-trench'
        )
      )
    )
  );
