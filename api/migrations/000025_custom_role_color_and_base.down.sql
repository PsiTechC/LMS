ALTER TABLE custom_roles DROP COLUMN IF EXISTS color;
-- base_role is left as TEXT on rollback (safe superset of the enum).
