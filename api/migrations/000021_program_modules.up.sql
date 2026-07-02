-- Program Design Studio v2: phase types + modules with pre/post-work element slots.
-- A "module" groups activities into PRE-WORK / POST-WORK columns within a phase
-- (e.g. a classroom session with pre-reading and a post-session quiz).
-- Activity-only phases (pre-enrolment, post-program) skip modules entirely —
-- their activities attach directly to the phase (module_id stays NULL).

ALTER TABLE program_phases
  ADD COLUMN IF NOT EXISTS phase_type TEXT NOT NULL DEFAULT 'custom',
  ADD COLUMN IF NOT EXISTS delivery_mode TEXT NOT NULL DEFAULT '';

ALTER TABLE program_phases
  ADD CONSTRAINT chk_program_phases_phase_type CHECK (phase_type IN (
    'pre-enrolment', 'orientation', 'module-virtual', 'module-in-person',
    'coaching', 'capstone', 'post-program', 'custom'
  ));

CREATE TABLE IF NOT EXISTS program_modules (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  phase_id      UUID NOT NULL REFERENCES program_phases(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  delivery_mode TEXT NOT NULL DEFAULT 'virtual', -- virtual | in-person
  session_date  DATE,
  sort_order    INT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_program_modules_phase_id ON program_modules(phase_id);

-- Activities gain: optional module_id (grouping), slot (pre/post work within a module).
-- Activities with module_id = NULL attach directly to the phase (activity-phase cards).
ALTER TABLE activities
  ADD COLUMN IF NOT EXISTS module_id UUID REFERENCES program_modules(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS slot TEXT NOT NULL DEFAULT '';

ALTER TABLE activities
  ADD CONSTRAINT chk_activities_slot CHECK (slot IN ('', 'pre', 'post'));

CREATE INDEX IF NOT EXISTS idx_activities_module_id ON activities(module_id);
