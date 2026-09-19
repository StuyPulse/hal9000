-- The public RPC only delegates to the private, narrowly scoped access check;
-- it does not need its own elevated privileges.
alter function public.can_view_picklist(uuid) security invoker;
