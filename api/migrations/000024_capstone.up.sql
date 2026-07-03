-- Capstone & Action Learning Project.
-- The capstone is TEAM-based: a team maps to a cohort_group (als_team). One
-- submission per team (any member can submit). Peer review is cross-team;
-- panel feedback is faculty-authored and released post-event.

-- One capstone record per team (cohort_group) within a program.
CREATE TABLE IF NOT EXISTS capstone_teams (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    program_id    UUID NOT NULL REFERENCES programs(id)      ON DELETE CASCADE,
    group_id      UUID NOT NULL REFERENCES cohort_groups(id) ON DELETE CASCADE,
    title         TEXT NOT NULL DEFAULT 'Capstone Project',
    -- Brief config (set by PM/faculty, read by participants; nullable until set).
    description   TEXT,
    format        TEXT,
    audience      TEXT,
    evaluation    TEXT,
    deadline      DATE,
    -- Submission (per team). file_url may be an uploaded file link or a video URL.
    file_url      TEXT,
    file_name     TEXT,
    submission_status TEXT NOT NULL DEFAULT 'not_submitted'
                    CHECK (submission_status IN ('not_submitted','submitted')),
    submitted_by  UUID REFERENCES users(id) ON DELETE SET NULL,
    submitted_at  TIMESTAMPTZ,
    -- Panel results are hidden until released post-event.
    panel_status  TEXT NOT NULL DEFAULT 'pending'
                    CHECK (panel_status IN ('pending','released')),
    ai_feedback   TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (program_id, group_id)
);
CREATE INDEX IF NOT EXISTS idx_capstone_teams_program ON capstone_teams(program_id);
CREATE INDEX IF NOT EXISTS idx_capstone_teams_group   ON capstone_teams(group_id);

-- Shared team files (workspace). Any member can add.
CREATE TABLE IF NOT EXISTS capstone_files (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    capstone_team_id UUID NOT NULL REFERENCES capstone_teams(id) ON DELETE CASCADE,
    title          TEXT NOT NULL,
    file_url       TEXT NOT NULL,
    uploaded_by    UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_capstone_files_team ON capstone_files(capstone_team_id);

-- Cross-team peer review assignment: reviewer team rates a target team.
CREATE TABLE IF NOT EXISTS capstone_peer_assignments (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reviewer_team_id UUID NOT NULL REFERENCES capstone_teams(id) ON DELETE CASCADE,
    target_team_id  UUID NOT NULL REFERENCES capstone_teams(id)  ON DELETE CASCADE,
    due_date        DATE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (reviewer_team_id, target_team_id)
);
CREATE INDEX IF NOT EXISTS idx_capstone_peer_assign_reviewer ON capstone_peer_assignments(reviewer_team_id);

-- One peer review submitted by a participant against an assignment.
CREATE TABLE IF NOT EXISTS capstone_peer_reviews (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    assignment_id  UUID NOT NULL REFERENCES capstone_peer_assignments(id) ON DELETE CASCADE,
    reviewer_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rating         INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment        TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (assignment_id, reviewer_id)
);
CREATE INDEX IF NOT EXISTS idx_capstone_peer_reviews_assign ON capstone_peer_reviews(assignment_id);

-- Panel feedback authored by faculty/industry panelists; released post-event.
CREATE TABLE IF NOT EXISTS capstone_panel_feedback (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    capstone_team_id UUID NOT NULL REFERENCES capstone_teams(id) ON DELETE CASCADE,
    panelist_id    UUID REFERENCES users(id) ON DELETE SET NULL,
    panelist_name  TEXT NOT NULL,
    panelist_role  TEXT,
    rating         INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment        TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_capstone_panel_team ON capstone_panel_feedback(capstone_team_id);
