-- Keep the StuyPulse domain restriction as the default and grant one audited
-- external exception. This trigger applies to password signup, invitations,
-- and first-time OAuth user creation.
create or replace function private.enforce_stuypulse_email()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.email is null
    or (
      right(lower(new.email), length('@stuypulse.com')) <> '@stuypulse.com'
      and lower(new.email) <> 'seb@sebastianw.tech'
    ) then
    raise exception 'HAL9000 is restricted to @stuypulse.com accounts and explicitly authorized exceptions.' using errcode = '22023';
  end if;
  return new;
end;
$$;
