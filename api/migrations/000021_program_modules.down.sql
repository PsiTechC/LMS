ALTER TABLE activities DROP CONSTRAINT IF EXISTS chk_activities_slot;
ALTER TABLE activities DROP COLUMN IF EXISTS slot;
ALTER TABLE activities DROP COLUMN IF EXISTS module_id;

DROP TABLE IF EXISTS program_modules;

ALTER TABLE program_phases DROP CONSTRAINT IF EXISTS chk_program_phases_phase_type;
ALTER TABLE program_phases DROP COLUMN IF EXISTS delivery_mode;
ALTER TABLE program_phases DROP COLUMN IF EXISTS phase_type;
