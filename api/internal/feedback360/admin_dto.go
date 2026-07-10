package feedback360

// Admin-initiated 360° flow DTOs (Superadmin / Program Manager).
// Kept separate from the participant-facing DTOs in dto.go.

// ── Quorum ────────────────────────────────────────────────────────

// QuorumConfigDTO is the per-cycle (or org-default) minimum-response config.
// self is fixed at 1 and never stored/sent.
type QuorumConfigDTO struct {
	SkipManager  int `json:"skip_manager"`
	Manager      int `json:"manager"`
	Peer         int `json:"peer"`
	DirectReport int `json:"direct_report"`
	Others       int `json:"others"`
}

// ── Cycle ─────────────────────────────────────────────────────────

// An organization has exactly one 360° configuration — there is no cycle
// concept, so there is nothing to create, name, list, or delete.

// LockCycleRequest carries the full config to freeze into the cycle at lock time:
// the chosen competencies+behaviors (with finalized question wording) and the
// quorum. Snapshotting here decouples the locked cycle from later live-framework edits.
type LockCycleRequest struct {
	Quorum        QuorumConfigDTO      `json:"quorum"`
	Competencies  []LockCompetencyItem `json:"competencies"`
	OpenQuestions []OpenQuestionDTO    `json:"open_questions"`
}

// OpenQuestionDTO is one cycle-level free-text question (three per cycle), asked
// after all competencies on the rater form.
type OpenQuestionDTO struct {
	Prompt    string `json:"prompt"`
	Mandatory bool   `json:"mandatory"`
	SortOrder int    `json:"sort_order"`
}

// SaveOpenQuestionsRequest writes the cycle's three open-ended questions during
// configure (mirrors the quorum step: editable until the cycle is locked).
type SaveOpenQuestionsRequest struct {
	OpenQuestions []OpenQuestionDTO `json:"open_questions"`
}

type LockCompetencyItem struct {
	CompetencyID string           `json:"competency_id"`
	Title        string           `json:"title"`
	Behaviors    []LockBehavior   `json:"behaviors"`
}

type LockBehavior struct {
	Statement    string `json:"statement"`
	QuestionText string `json:"question_text"`
	Mandatory    bool   `json:"mandatory"`
	SortOrder    int    `json:"sort_order"`
}

// AdminCycleDetailDTO is the organization's single 360° configuration, plus its
// live participation counts.
type AdminCycleDetailDTO struct {
	ID              string                `json:"id"`
	OrgID           string                `json:"org_id"`
	Status          string                `json:"status"`
	InitiatedByRole string                `json:"initiated_by_role"`
	LockedAt        *string               `json:"locked_at,omitempty"`
	CreatedAt       string                `json:"created_at"`
	// Participation stats for this org's 360.
	AssignedCount  int `json:"assigned_count"`
	InvitedCount   int `json:"invited_count"`
	CompletedCount int `json:"completed_count"`
	// WasLocked is true once the cycle has been through a full Review & Lock at
	// least once (including a cycle since reopened for editing). The Configure
	// wizard uses it to let the admin jump freely between steps.
	WasLocked     bool                 `json:"was_locked"`
	Quorum        QuorumConfigDTO      `json:"quorum"`
	Competencies  []CycleCompetencyDTO `json:"competencies"`
	OpenQuestions []OpenQuestionDTO    `json:"open_questions"`
}

// CycleCompetencyDTO is one competency + its behaviors as frozen into the cycle
// (from feedback_cycle_behaviors once locked, else the live framework).
type CycleCompetencyDTO struct {
	CompetencyID string             `json:"competency_id"`
	Title        string             `json:"title"`
	Behaviors    []CycleBehaviorDTO `json:"behaviors"`
}

type CycleBehaviorDTO struct {
	Statement    string `json:"statement"`
	QuestionText string `json:"question_text"`
	Mandatory    bool   `json:"mandatory"`
	SortOrder    int    `json:"sort_order"`
}

// ── Assign / participants ─────────────────────────────────────────

// AssignableParticipantDTO is one candidate participant for the Assign table.
type AssignableParticipantDTO struct {
	UserID      string  `json:"user_id"`
	Name        string  `json:"name"`
	Email       string  `json:"email"`
	Department  *string `json:"department,omitempty"`
	ProgramID   *string `json:"program_id,omitempty"`
	ProgramName *string `json:"program_name,omitempty"`
	CohortID    *string `json:"cohort_id,omitempty"`
	CohortName  *string `json:"cohort_name,omitempty"`
	Status      string  `json:"status"`         // enrollment status
	AlreadyInCycle bool `json:"already_in_cycle"` // already assigned to this cycle
}

// AssignRequest bulk-assigns participants to a cycle. Either explicit user_ids,
// or select_all against the active filter combination.
type AssignRequest struct {
	UserIDs   []string `json:"user_ids"`
	SelectAll bool     `json:"select_all"`
	// Filters mirror the Assign table; used only when select_all is true.
	ProgramID        string `json:"program_id,omitempty"`
	CohortID         string `json:"cohort_id,omitempty"`
	EnrollmentStatus string `json:"enrollment_status,omitempty"`
	Search           string `json:"search,omitempty"`
}

// CycleParticipantDTO is one assigned participant with tracking status.
type CycleParticipantDTO struct {
	ID          string  `json:"id"`
	UserID      string  `json:"user_id"`
	Name        string  `json:"name"`
	Email       string  `json:"email"`
	ProgramName *string `json:"program_name,omitempty"`
	CohortName  *string `json:"cohort_name,omitempty"`
	Status      string  `json:"status"` // assigned | invited | in_progress | completed
	InvitedAt   *string `json:"invited_at,omitempty"`
	RemindedAt  *string `json:"reminded_at,omitempty"`
	CompletedAt *string `json:"completed_at,omitempty"`
}

// RemindRequest targets participants for a reminder (or all not-yet-completed).
type RemindRequest struct {
	ParticipantIDs []string `json:"participant_ids"` // feedback_cycle_participants.id values
	All            bool     `json:"all"`             // all non-completed
}

// ── Program / cohort filter options ───────────────────────────────

type ProgramOptionDTO struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	HasCohorts bool   `json:"has_cohorts"`
}

type CohortOptionDTO struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}
