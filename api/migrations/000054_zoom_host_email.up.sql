-- Add optional zoom_host_email override column to users.
-- When set (by Super Admin only), meetings are created at
-- /users/{zoom_host_email}/meetings instead of the faculty's LMS email.
-- Falls back to users.email when NULL.
ALTER TABLE users ADD COLUMN IF NOT EXISTS zoom_host_email CITEXT;
