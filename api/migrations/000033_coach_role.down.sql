-- Postgres cannot drop a value from an enum, so user_role/org_member_role keep
-- 'coach'. Only the coaches table is reversible.
DROP TABLE IF EXISTS coaches;
