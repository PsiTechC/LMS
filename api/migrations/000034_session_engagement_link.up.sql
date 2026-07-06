-- Link a class_session to the coaching engagement it belongs to. Coaching
-- sessions resolve their coach (engagement.coach_id) and coachee(s) (engagement
-- participants) through the engagement, powering the dedicated coach dashboard.
-- NULL = a normal (non-coaching) classroom session.
--
-- NOTE: this repo applies schema via Go on startup (coaching.InitSchema); this
-- file is the historical record and does not run automatically.
ALTER TABLE class_sessions
    ADD COLUMN IF NOT EXISTS engagement_id UUID REFERENCES coaching_engagements(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_class_sessions_engagement ON class_sessions(engagement_id);
