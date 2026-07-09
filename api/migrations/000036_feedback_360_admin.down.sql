-- Reverse the admin-initiated 360° flow schema.
DROP TABLE IF EXISTS feedback_org_open_question_defaults;
DROP TABLE IF EXISTS feedback_cycle_open_questions;
DROP TABLE IF EXISTS feedback_cycle_behaviors;
DROP TABLE IF EXISTS feedback_cycle_participants;
DROP TABLE IF EXISTS feedback_org_quorum_defaults;
DROP TABLE IF EXISTS feedback_quorum_config;
DROP TABLE IF EXISTS competency_behaviors;

ALTER TABLE feedback_cycles DROP CONSTRAINT IF EXISTS feedback_cycles_status_check;
ALTER TABLE feedback_cycles ADD CONSTRAINT feedback_cycles_status_check
    CHECK (status IN ('draft','open','closed'));
ALTER TABLE feedback_cycles DROP COLUMN IF EXISTS locked_at;
ALTER TABLE feedback_cycles DROP COLUMN IF EXISTS initiated_by_role;
ALTER TABLE feedback_cycles DROP COLUMN IF EXISTS initiated_by_user_id;
ALTER TABLE feedback_cycles DROP COLUMN IF EXISTS name;
-- participant_id NOT NULL is intentionally NOT restored (admin cycles rely on it being nullable).
