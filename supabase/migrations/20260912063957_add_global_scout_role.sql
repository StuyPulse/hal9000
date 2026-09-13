-- Kept separate because PostgreSQL cannot safely use a newly added enum value
-- in policies until the transaction that adds it has committed.
alter type public.organization_role add value if not exists 'global_scout';
