-- Add timeline positioning columns to phases and activities
-- start_day / end_day on phases (1-based, relative to program start date)
-- start_day / duration_days on activities

ALTER TABLE program_phases
    ADD COLUMN IF NOT EXISTS start_day INT NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS end_day   INT NOT NULL DEFAULT 14;

ALTER TABLE activities
    ADD COLUMN IF NOT EXISTS start_day     INT NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS duration_days INT NOT NULL DEFAULT 3;
