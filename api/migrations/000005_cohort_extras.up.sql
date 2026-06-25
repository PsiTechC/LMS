-- Add department to users (used across cohort/enrollment views)
ALTER TABLE users ADD COLUMN IF NOT EXISTS department TEXT;

-- Add completion tracking and risk level to enrollments
ALTER TABLE enrollments
    ADD COLUMN IF NOT EXISTS completion_percent INT        NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS risk_level         TEXT       NOT NULL DEFAULT 'low',  -- low | medium | high
    ADD COLUMN IF NOT EXISTS nudged_at          TIMESTAMPTZ;

-- Add batch/label to cohorts for display
ALTER TABLE cohorts ADD COLUMN IF NOT EXISTS description TEXT;
