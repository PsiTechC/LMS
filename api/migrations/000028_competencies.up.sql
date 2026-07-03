-- Competency framework
CREATE TABLE competencies (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    title       TEXT NOT NULL,
    description TEXT,
    category    TEXT NOT NULL DEFAULT 'leadership',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Activity ↔ Competency mapping
CREATE TABLE activity_competencies (
    activity_id   UUID NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
    competency_id UUID NOT NULL REFERENCES competencies(id) ON DELETE CASCADE,
    level         TEXT NOT NULL DEFAULT 'intermediate', -- beginner | intermediate | advanced
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (activity_id, competency_id)
);

-- Program template library
CREATE TABLE program_templates (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id         UUID REFERENCES organizations(id) ON DELETE CASCADE, -- NULL = system template
    title          TEXT NOT NULL,
    description    TEXT,
    category       TEXT NOT NULL DEFAULT 'leadership',
    duration_weeks INT  NOT NULL DEFAULT 12,
    structure_json JSONB NOT NULL DEFAULT '{}',
    is_system      BOOLEAN NOT NULL DEFAULT FALSE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_competencies_org_id             ON competencies(org_id);
CREATE INDEX idx_activity_competencies_activity  ON activity_competencies(activity_id);
CREATE INDEX idx_activity_competencies_comp      ON activity_competencies(competency_id);
CREATE INDEX idx_program_templates_org           ON program_templates(org_id);
CREATE INDEX idx_program_templates_system        ON program_templates(is_system) WHERE is_system = TRUE;

-- Seed three system templates
INSERT INTO program_templates (title, description, category, duration_weeks, is_system, structure_json) VALUES
(
    '6-Month Leadership Cohort',
    'Full leadership development journey with assessment, workshops, coaching and capstone.',
    'leadership',
    24,
    TRUE,
    '{"phases":[{"title":"Foundation","week_label":"Week 1-4","activities":[{"title":"Leadership Styles Assessment","type":"assessment","duration_mins":60},{"title":"Self-Awareness Workshop","type":"content","duration_mins":90}]},{"title":"Core Skills","week_label":"Week 5-12","activities":[{"title":"Communication Masterclass","type":"content","duration_mins":120},{"title":"Strategic Thinking Survey","type":"survey","duration_mins":30}]},{"title":"Application","week_label":"Week 13-20","activities":[{"title":"Group Coaching Session","type":"coaching","duration_mins":60},{"title":"Peer Feedback 360","type":"feedback_360","duration_mins":45}]},{"title":"Capstone","week_label":"Week 21-24","activities":[{"title":"Capstone Project","type":"capstone","duration_mins":180}]}]}'
),
(
    'Residential Intensive',
    'Immersive 4-week residential program focused on rapid leadership transformation.',
    'leadership',
    4,
    TRUE,
    '{"phases":[{"title":"Immersion","week_label":"Week 1","activities":[{"title":"Leadership Baseline Assessment","type":"assessment","duration_mins":90},{"title":"Team Dynamics Workshop","type":"content","duration_mins":120}]},{"title":"Deep Dive","week_label":"Week 2-3","activities":[{"title":"Executive Coaching","type":"coaching","duration_mins":60},{"title":"Case Study Discussion","type":"discussion","duration_mins":90}]},{"title":"Integration","week_label":"Week 4","activities":[{"title":"Action Learning Project","type":"capstone","duration_mins":240}]}]}'
),
(
    'Virtual Blended Program',
    'Flexible 16-week virtual program combining self-paced content with live coaching.',
    'leadership',
    16,
    TRUE,
    '{"phases":[{"title":"Onboarding","week_label":"Week 1-2","activities":[{"title":"Pre-Work Assessment","type":"assessment","duration_mins":45},{"title":"Virtual Kickoff Session","type":"content","duration_mins":60}]},{"title":"Learning Sprints","week_label":"Week 3-12","activities":[{"title":"Module 1: Leading Self","type":"content","duration_mins":90},{"title":"Module 2: Leading Others","type":"content","duration_mins":90},{"title":"Mid-Program Check-in","type":"survey","duration_mins":20}]},{"title":"Practice & Application","week_label":"Week 13-16","activities":[{"title":"Virtual Coaching Session","type":"coaching","duration_mins":60},{"title":"Final Reflection","type":"capstone","duration_mins":120}]}]}'
);
