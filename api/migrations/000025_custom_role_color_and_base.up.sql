-- Custom-role wizard support: a display color, and base_role widened from the
-- user_role enum to TEXT so it can also carry "none" (no permission inheritance).
ALTER TABLE custom_roles ADD COLUMN IF NOT EXISTS color TEXT NOT NULL DEFAULT '#EF4E24';
ALTER TABLE custom_roles ALTER COLUMN base_role TYPE TEXT USING base_role::text;
ALTER TABLE custom_roles ALTER COLUMN base_role SET DEFAULT 'participant';
