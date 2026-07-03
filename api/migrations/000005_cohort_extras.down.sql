ALTER TABLE enrollments
    DROP COLUMN IF EXISTS completion_percent,
    DROP COLUMN IF EXISTS risk_level,
    DROP COLUMN IF EXISTS nudged_at;

ALTER TABLE cohorts DROP COLUMN IF EXISTS description;
ALTER TABLE users   DROP COLUMN IF EXISTS department;
