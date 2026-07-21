package capstone

// ── Capstone authoring / management DTOs ──────────────────────────────────

// RubricCriterion is one weighted rubric line; weights across a config sum to 100.
type RubricCriterion struct {
	Criterion string  `json:"criterion"`
	Weight    float64 `json:"weight"`
}

// ResourceLink is one reference resource attached to a capstone.
type ResourceLink struct {
	Title string `json:"title"`
	URL   string `json:"url"`
}

// ReferenceFile is an uploaded reference document (content_id from /uploads).
type ReferenceFile struct {
	Title     string `json:"title"`
	ContentID string `json:"content_id"`
}

// ── Requests ──────────────────────────────────────────────────────────────

// CreateConfigRequest attaches a capstone to a program (optionally a phase/
// activity). Only program_id is required at attach time; the rest is filled in
// during configuration.
type CreateConfigRequest struct {
	ProgramID  string `json:"program_id"`
	PhaseID    string `json:"phase_id,omitempty"`
	ActivityID string `json:"activity_id,omitempty"`
	Title      string `json:"title,omitempty"`
}

// UpdateConfigRequest edits the authored definition. All fields optional; only
// provided fields are applied. Rubric weights (when provided) must sum to 100.
type UpdateConfigRequest struct {
	Title             *string           `json:"title,omitempty"`
	Theme             *string           `json:"theme,omitempty"`
	ProblemStatement  *string           `json:"problem_statement,omitempty"`
	Objectives        *string           `json:"objectives,omitempty"`
	DeliverableFormat []string          `json:"deliverable_format,omitempty"`
	Rubric            []RubricCriterion `json:"rubric,omitempty"`
	Resources         []ResourceLink    `json:"resources,omitempty"`
	ReferenceFiles    []ReferenceFile   `json:"reference_files,omitempty"`
	TeamStructure     *string           `json:"team_structure,omitempty"` // individual | group
	PassingThreshold  *float64          `json:"passing_threshold,omitempty"`
	Deadline          *string           `json:"deadline,omitempty"` // YYYY-MM-DD
}

// AssignConfigRequest publishes the capstone. For group capstones it links the
// cohort's als_team groups (all, or a provided subset); for individual it
// materializes a per-participant team from the cohort's enrollments.
type AssignConfigRequest struct {
	CohortID string   `json:"cohort_id"`
	GroupIDs []string `json:"group_ids,omitempty"` // optional subset (group structure)
}

type MilestoneRequest struct {
	Title   string `json:"title"`
	DueDate string `json:"due_date,omitempty"` // YYYY-MM-DD
}

// GradeRequest records a team or individual grade (held until release).
type GradeRequest struct {
	TeamID        string                 `json:"team_id"`
	ParticipantID string                 `json:"participant_id,omitempty"` // empty = team-level
	Score         float64                `json:"score"`                    // 0..10
	PerCriterion  []CriterionScoreInput  `json:"per_criterion,omitempty"`
	Comments      string                 `json:"comments,omitempty"`
}

type CriterionScoreInput struct {
	Criterion string  `json:"criterion"`
	Score     float64 `json:"score"`
}

// ── Responses ─────────────────────────────────────────────────────────────

// ConfigDTO is one authored capstone (list + detail).
type ConfigDTO struct {
	ID                string            `json:"id"`
	OrgID             string            `json:"org_id"`
	Org               string            `json:"org,omitempty"`
	ProgramID         string            `json:"program_id"`
	Program           string            `json:"program,omitempty"`
	PhaseID           string            `json:"phase_id,omitempty"`
	ActivityID        string            `json:"activity_id,omitempty"`
	Title             string            `json:"title"`
	Theme             string            `json:"theme,omitempty"`
	ProblemStatement  string            `json:"problem_statement,omitempty"`
	Objectives        string            `json:"objectives,omitempty"`
	DeliverableFormat []string          `json:"deliverable_format"`
	Rubric            []RubricCriterion `json:"rubric"`
	Resources         []ResourceLink    `json:"resources"`
	ReferenceFiles    []ReferenceFile   `json:"reference_files"`
	TeamStructure     string            `json:"team_structure"`
	PassingThreshold  float64           `json:"passing_threshold"`
	Deadline          string            `json:"deadline,omitempty"`
	Status            string            `json:"status"`
	TeamCount         int               `json:"team_count"`
	CreatedAt         string            `json:"created_at"`
}

// ConfigDetailDTO is a config plus its teams, milestones and (staff-visible)
// grades - the Faculty/SA management view.
type ConfigDetailDTO struct {
	Config     ConfigDTO           `json:"config"`
	Milestones []MilestoneDTO      `json:"milestones"`
	Teams      []ManagedTeamDTO    `json:"teams"`
}

type MilestoneDTO struct {
	ID        string `json:"id"`
	Title     string `json:"title"`
	DueDate   string `json:"due_date,omitempty"`
	Status    string `json:"status"`
	SortOrder int    `json:"sort_order"`
}

// ManagedTeamDTO is one team/individual under a config, with its members,
// submission state, and (staff-visible, incl. unreleased) grade.
type ManagedTeamDTO struct {
	TeamID           string              `json:"team_id"`
	Name             string              `json:"name"`
	IsIndividual     bool                `json:"is_individual"`
	Members          []ManagedMemberDTO  `json:"members"`
	SubmissionStatus string              `json:"submission_status"`
	FileURL          string              `json:"file_url,omitempty"`
	FileName         string              `json:"file_name,omitempty"`
	SubmittedAt      string              `json:"submitted_at,omitempty"`
	CompletionStatus string              `json:"completion_status"`
	TeamGrade        *GradeDTO           `json:"team_grade,omitempty"`
	MemberGrades     []GradeDTO          `json:"member_grades,omitempty"`
}

type ManagedMemberDTO struct {
	UserID string `json:"user_id"`
	Name   string `json:"name"`
	Email  string `json:"email"`
}

type GradeDTO struct {
	TeamID        string                `json:"team_id"`
	ParticipantID string                `json:"participant_id,omitempty"`
	Score         float64               `json:"score"`
	PerCriterion  []CriterionScoreInput `json:"per_criterion"`
	Comments      string                `json:"comments,omitempty"`
	Released      bool                  `json:"released"`
	GradedAt      string                `json:"graded_at"`
}
