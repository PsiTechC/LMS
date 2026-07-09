-- Reverse the participant adaptation + external rater form schema.
DROP TABLE IF EXISTS feedback_open_responses;
DROP TABLE IF EXISTS feedback_behavior_responses;

ALTER TABLE feedback_raters DROP CONSTRAINT IF EXISTS feedback_raters_relationship_check;
ALTER TABLE feedback_raters ADD CONSTRAINT feedback_raters_relationship_check
    CHECK (relationship IN ('self','manager','peer','direct_report','skip_level'));

DROP INDEX IF EXISTS idx_fb_raters_participant;
ALTER TABLE feedback_raters DROP COLUMN IF EXISTS participant_id;
