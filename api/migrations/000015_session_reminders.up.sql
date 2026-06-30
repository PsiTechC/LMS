-- Add reminder_enabled flag to class_sessions
ALTER TABLE class_sessions ADD COLUMN IF NOT EXISTS reminder_enabled BOOLEAN NOT NULL DEFAULT FALSE;

-- Track sent reminders to avoid duplicates
CREATE TABLE IF NOT EXISTS session_reminders (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id   UUID NOT NULL REFERENCES class_sessions(id) ON DELETE CASCADE,
  remind_at    TIMESTAMPTZ NOT NULL,
  channel      VARCHAR(20) NOT NULL DEFAULT 'in_app', -- in_app | email
  sent_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_session_reminders_session ON session_reminders(session_id);
CREATE INDEX IF NOT EXISTS idx_session_reminders_remind_at ON session_reminders(remind_at) WHERE sent_at IS NULL;
