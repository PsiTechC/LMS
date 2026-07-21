-- Engagement/Speed/Quality activity scoring model (leaderboard v2).
--
-- This is a SEPARATE table from leaderboard_awards (000052), not an ALTER of
-- it. leaderboard_awards is an immutable, append-only ledger (unique key
-- includes source_record_id, callers INSERT ... ON CONFLICT DO NOTHING - a
-- row is never updated once written). The new scoring model requires the
-- opposite: exactly one row per (participant, enrollment, activity) that is
-- recalculated and UPSERTED whenever the underlying signal changes (regrade,
-- deadline change, progress update) - see requirement #8. Reusing
-- leaderboard_awards for this would silently break its documented
-- immutability contract for every existing caller (activity progress,
-- assessments, submissions, discussions, coaching sessions). A new table
-- keeps this additive and fully isolated from the live scoring path.
--
-- NOTE: per api/CLAUDE.md's "Database Migrations" section, this .sql file is
-- a historical paper-trail copy only - it is NOT executed automatically by
-- any tool in this repo (no golang-migrate wiring, no schema_migrations
-- table). The actual schema application mechanism is the idempotent Go
-- function in api/internal/leaderboard/schema_activity_scores.go, which must
-- be explicitly wired into main.go by a developer after this is reviewed -
-- see that file's doc comment for the exact steps.

CREATE TABLE IF NOT EXISTS activity_scores (
    id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id    UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    participant_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    enrollment_id      UUID NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
    program_id         UUID REFERENCES programs(id) ON DELETE SET NULL,
    cohort_id          UUID REFERENCES cohorts(id) ON DELETE SET NULL,
    activity_id        UUID NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
    engagement_score   INTEGER NOT NULL CHECK (engagement_score >= 0),
    speed_score        INTEGER NOT NULL CHECK (speed_score >= 0),
    quality_score      INTEGER NOT NULL CHECK (quality_score >= 0),
    earned_total       INTEGER NOT NULL CHECK (earned_total >= 0),
    maximum_total      INTEGER NOT NULL CHECK (maximum_total > 0),
    calculation_reason TEXT NOT NULL,
    calculated_at      TIMESTAMPTZ NOT NULL,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Idempotency key per requirement #6: org + learner + enrollment + activity.
    -- enrollment_id (not just program/cohort) so a participant who re-enrolls
    -- in the same program in a later cohort gets a distinct score row for
    -- that new enrollment, rather than colliding with an old one.
    UNIQUE (organization_id, participant_id, enrollment_id, activity_id)
);

CREATE INDEX IF NOT EXISTS idx_activity_scores_participant_program ON activity_scores (participant_id, program_id);
CREATE INDEX IF NOT EXISTS idx_activity_scores_org_program        ON activity_scores (organization_id, program_id);
CREATE INDEX IF NOT EXISTS idx_activity_scores_cohort             ON activity_scores (cohort_id);
CREATE INDEX IF NOT EXISTS idx_activity_scores_enrollment         ON activity_scores (enrollment_id);
