ALTER TABLE program_phases DROP COLUMN IF EXISTS start_day, DROP COLUMN IF EXISTS end_day;
ALTER TABLE activities     DROP COLUMN IF EXISTS start_day, DROP COLUMN IF EXISTS duration_days;
