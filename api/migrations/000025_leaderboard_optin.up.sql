-- Gamification / Leaderboard.
-- Points are DERIVED from real activity signals (module completions, assessments,
-- discussions, reflections, coaching) at read time — no separate ledger. The
-- only stored state is the participant's leaderboard privacy preference.

ALTER TABLE enrollments
    ADD COLUMN IF NOT EXISTS show_on_leaderboard BOOLEAN NOT NULL DEFAULT TRUE;
