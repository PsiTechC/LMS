-- Add email verification fields to users table
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS is_verified          BOOLEAN     NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS verification_token   TEXT        UNIQUE,
    ADD COLUMN IF NOT EXISTS verification_expires_at TIMESTAMPTZ;

-- Superadmin and existing seeded accounts are pre-verified so they can log in immediately
UPDATE users SET is_verified = true WHERE role = 'superadmin';
