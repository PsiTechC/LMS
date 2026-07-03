-- Stores pre-program vs current competency scores per cohort
-- Populated by faculty/PM after competency assessments
CREATE TABLE cohort_competency_scores (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cohort_id     UUID NOT NULL REFERENCES cohorts(id) ON DELETE CASCADE,
    competency_id UUID NOT NULL REFERENCES competencies(id) ON DELETE CASCADE,
    pre_program_pct DECIMAL(5,2) NOT NULL DEFAULT 0,
    current_pct     DECIMAL(5,2) NOT NULL DEFAULT 0,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (cohort_id, competency_id)
);

CREATE INDEX idx_cohort_competency_scores_cohort ON cohort_competency_scores(cohort_id);
