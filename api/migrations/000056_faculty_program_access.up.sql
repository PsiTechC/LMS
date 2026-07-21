-- faculty_program_access: PROGRAM-level faculty access intent, independent
-- of any specific activity. activity_faculty alone can't represent "this
-- faculty has access to program X" when the program has zero activities
-- yet (activity_id is NOT NULL there). A pending row here is materialized
-- into a real activity_faculty row the first time an activity is created
-- for that program.
--
-- Historical record only - the actual idempotent apply path is
-- api/internal/faculty_management/repository.go's fixSchema(), per
-- CLAUDE.md's Database Migrations convention.

CREATE TABLE IF NOT EXISTS faculty_program_access (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    program_id      UUID NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
    faculty_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role            VARCHAR(50) NOT NULL DEFAULT 'Lead',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(program_id, faculty_user_id)
);

CREATE INDEX idx_faculty_program_access_program ON faculty_program_access(program_id);
CREATE INDEX idx_faculty_program_access_user    ON faculty_program_access(faculty_user_id);
