-- Extend users table with faculty profile fields
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS specialization  TEXT,
  ADD COLUMN IF NOT EXISTS bio             TEXT,
  ADD COLUMN IF NOT EXISTS phone           TEXT,
  ADD COLUMN IF NOT EXISTS location        TEXT,
  ADD COLUMN IF NOT EXISTS linkedin_url    TEXT,
  ADD COLUMN IF NOT EXISTS certifications  TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS onboarding_status TEXT NOT NULL DEFAULT 'active';

-- L1 reaction scores per faculty per program cohort (aggregated from session feedback)
CREATE TABLE IF NOT EXISTS faculty_l1_scores (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  faculty_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  program_id      UUID NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  cohort_id       UUID REFERENCES cohorts(id) ON DELETE SET NULL,
  session_title   TEXT,
  avg_score       NUMERIC(4,2) NOT NULL DEFAULT 0,
  response_count  INT NOT NULL DEFAULT 0,
  recorded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_faculty_l1_faculty ON faculty_l1_scores(faculty_user_id);
CREATE INDEX IF NOT EXISTS idx_faculty_l1_program ON faculty_l1_scores(program_id);

-- L2 learning delta per cohort (pre/post assessment %)
CREATE TABLE IF NOT EXISTS faculty_l2_scores (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  faculty_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  program_id      UUID NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  cohort_id       UUID REFERENCES cohorts(id) ON DELETE SET NULL,
  pre_score_pct   NUMERIC(5,2) NOT NULL DEFAULT 0,
  post_score_pct  NUMERIC(5,2) NOT NULL DEFAULT 0,
  delta_pct       NUMERIC(5,2) GENERATED ALWAYS AS (post_score_pct - pre_score_pct) STORED,
  response_count  INT NOT NULL DEFAULT 0,
  recorded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_faculty_l2_faculty ON faculty_l2_scores(faculty_user_id);

-- L3 behavior survey results (90d, multi-rater)
CREATE TABLE IF NOT EXISTS faculty_l3_scores (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  faculty_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  program_id      UUID NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  cohort_id       UUID REFERENCES cohorts(id) ON DELETE SET NULL,
  behavior_pct    NUMERIC(5,2) NOT NULL DEFAULT 0,
  response_count  INT NOT NULL DEFAULT 0,
  recorded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_faculty_l3_faculty ON faculty_l3_scores(faculty_user_id);

-- L4 business results (180d, business sponsor)
CREATE TABLE IF NOT EXISTS faculty_l4_scores (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  faculty_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  program_id      UUID NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  cohort_id       UUID REFERENCES cohorts(id) ON DELETE SET NULL,
  results_pct     NUMERIC(5,2) NOT NULL DEFAULT 0,
  response_count  INT NOT NULL DEFAULT 0,
  recorded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_faculty_l4_faculty ON faculty_l4_scores(faculty_user_id);
