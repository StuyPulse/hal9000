-- This helper runs inside the shared-ranking RLS policy.  It is a
-- SECURITY DEFINER function, but Postgres still requires the calling role to
-- have EXECUTE permission before it can be evaluated by that policy.
grant execute on function private.are_valid_picklist_tags(uuid, uuid[]) to authenticated;
