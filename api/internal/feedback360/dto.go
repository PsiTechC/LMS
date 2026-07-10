package feedback360

// ── Request DTOs ──────────────────────────────────────────────────

// CreateCycleRequest starts a 360 cycle for the calling participant. If
// competency_ids is empty the service seeds all org competencies.
type CreateCycleRequest struct {
	Title         string   `json:"title"`
	CycleType     string   `json:"cycle_type"` // baseline | mid | end | custom
	ProgramID     string   `json:"program_id,omitempty"`
	CohortID      string   `json:"cohort_id,omitempty"`
	Deadline      string   `json:"deadline,omitempty"` // YYYY-MM-DD
	CompetencyIDs []string `json:"competency_ids,omitempty"`
}

type AddRaterRequest struct {
	Name         string `json:"name"`
	Email        string `json:"email"`
	Relationship string `json:"relationship"` // manager | peer | direct_report | skip_level
}

// SubmitResponsesRequest is used by a rater via their invite token (login-less).
type SubmitResponsesRequest struct {
	Responses []RaterScoreInput `json:"responses"`
}

type RaterScoreInput struct {
	CompetencyID string  `json:"competency_id"`
	Score        float64 `json:"score"`
	Comment      string  `json:"comment,omitempty"`
}

// ── Response DTOs ─────────────────────────────────────────────────

type CompetencyScoreDTO struct {
	CompetencyID string  `json:"competency_id"`
	Title        string  `json:"title"`
	SelfScore    *float64 `json:"self_score,omitempty"`   // participant's own rating
	OthersScore  *float64 `json:"others_score,omitempty"` // avg of non-self submitted raters
	Gap          *float64 `json:"gap,omitempty"`          // self - others (blind-spot signal)
}

type RaterDTO struct {
	ID           string  `json:"id"`
	Name         string  `json:"name"`
	Email        string  `json:"email"`
	Relationship string  `json:"relationship"`
	Status       string  `json:"status"`
	RemindedAt   *string `json:"reminded_at,omitempty"`
	SubmittedAt  *string `json:"submitted_at,omitempty"`
}

// QuorumDTO reports min-response satisfaction per relationship category.
type QuorumDTO struct {
	Relationship string `json:"relationship"`
	// Label is what the participant sees. It equals the relationship's default
	// name except for "others", which carries the admin's chosen category name
	// (e.g. "Customers").
	Label     string `json:"label"`
	Min       int    `json:"min"`
	Nominated int    `json:"nominated"`
	Submitted int    `json:"submitted"`
	Met       bool   `json:"met"`
}

type CycleDTO struct {
	ID             string               `json:"id"`
	Title          string               `json:"title"`
	CycleType      string               `json:"cycle_type"`
	Status         string               `json:"status"`
	Deadline       *string              `json:"deadline,omitempty"`
	AISummary      *string              `json:"ai_summary,omitempty"`
	RatersInvited  int                  `json:"raters_invited"`
	RatersSubmitted int                 `json:"raters_submitted"`
	Raters         []RaterDTO           `json:"raters"`
	Competencies   []CompetencyScoreDTO `json:"competencies"`
	Quorum         []QuorumDTO          `json:"quorum"`
	CreatedAt      string               `json:"created_at"`
}

// RaterFormDTO is what a rater sees via their token link (no participant PII
// beyond first name — anonymity is one-directional: rater→participant).
type RaterFormDTO struct {
	CycleTitle      string               `json:"cycle_title"`
	ParticipantName string               `json:"participant_name"`
	Relationship    string               `json:"relationship"`
	AlreadySubmitted bool                `json:"already_submitted"`
	Competencies    []RaterCompetencyDTO `json:"competencies"`
}

type RaterCompetencyDTO struct {
	CompetencyID string `json:"competency_id"`
	Title        string `json:"title"`
	Description  string `json:"description,omitempty"`
}

// ── Admin aggregate DTOs (superadmin cross-org) ──────────────────

// AdminBreakdownDTO is the self/manager/peer/direct-report average breakdown.
// Each is null when no rater of that relationship submitted.
type AdminBreakdownDTO struct {
	Self         *float64 `json:"self"`
	Manager      *float64 `json:"manager"`
	Peer         *float64 `json:"peer"`
	DirectReport *float64 `json:"direct_report"`
}

// AdminCompScoreDTO is one competency's average score for a cycle.
type AdminCompScoreDTO struct {
	CompetencyID string  `json:"competency_id"`
	Title        string  `json:"title"`
	Score        float64 `json:"score"`
}

// AdminCycleDTO is one completed 360 cycle in the superadmin aggregate.
type AdminCycleDTO struct {
	CycleID      string              `json:"cycle_id"`
	Title        string              `json:"title"`
	CycleType    string              `json:"cycle_type"`
	Participant  string              `json:"participant"`
	Org          string              `json:"org"`
	OrgID        string              `json:"org_id"`
	Program      string              `json:"program"`
	CompletedAt  string              `json:"completed_at"`
	OverallScore *float64            `json:"overall_score"` // avg of non-self responses
	Breakdown    AdminBreakdownDTO   `json:"breakdown"`
	Competencies []AdminCompScoreDTO `json:"competencies"`
}
