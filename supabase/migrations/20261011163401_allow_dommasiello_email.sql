-- Keep existing StuyPulse and external access; authorize one additional account.
create or replace function private.enforce_stuypulse_email()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.email is null
    or (
      right(lower(new.email), length('@stuypulse.com')) <> '@stuypulse.com'
      and lower(new.email) not in ('seb@sebastianw.tech', 'dommasiello27@gmail.com')
    ) then
    raise exception 'HAL9000 is restricted to @stuypulse.com accounts and explicitly authorized exceptions.' using errcode = '22023';
  end if;
  return new;
end;
$$;
