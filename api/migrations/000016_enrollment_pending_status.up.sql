-- Add 'invited' to enrollment_status enum (sent invite, not yet registered).
ALTER TYPE enrollment_status ADD VALUE IF NOT EXISTS 'invited' BEFORE 'enrolled';

-- Migrate legacy status values: 'active'/'on_hold' → 'enrolled'
UPDATE enrollments SET status = 'enrolled' WHERE status IN ('active', 'on_hold');

-- Fix zero-time enrolled_at for rows inserted without a proper timestamp
UPDATE enrollments SET enrolled_at = NOW() WHERE enrolled_at < '2000-01-01';
