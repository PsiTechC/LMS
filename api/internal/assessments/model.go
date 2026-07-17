package assessments

import (
	"time"

	"github.com/google/uuid"
)

// AssessmentAttempt is one participant's attempt at a quiz-backed assessment
// activity (standalone assessment OR a knowledge check attached to a
// content-style activity — SourceAssetID records which quiz asset was taken).
// Answers are stored as submitted (jsonb) so a later rescoring pass (e.g. a
// question edited after the fact) can recompute from raw data — objective
// scoring always happens server-side at submit time, never trusted from the
// client.
//
// Lifecycle (Status):
//   - auto_scored    — only objective questions; final at submit time.
//   - pending_review — has ≥1 open question; objective portion scored, open
//                      portion queued to faculty (appears in the grading queue).
//   - graded         — faculty finished the open questions; ScorePct is final.
//
// FacultyScores holds the per-open-question awards faculty entered
// ([]FacultyQuestionScore as jsonb). Score/MaxScore/ScorePct always reflect the
// current best-known total: at submit, objective + (open counted into MaxScore
// but 0 earned); after grading, objective + faculty-awarded open points.
type AssessmentAttempt struct {
	ID             uuid.UUID  `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()"`
	ActivityID     uuid.UUID  `gorm:"type:uuid;not null"`
	ParticipantID  uuid.UUID  `gorm:"type:uuid;not null"`
	SourceAssetID  *uuid.UUID `gorm:"type:uuid;column:source_asset_id"` // which quiz asset (nil for legacy rows)
	Answers        []byte     `gorm:"type:jsonb;not null;default:'[]'"`
	Score          float64    `gorm:"not null;default:0"` // points earned (objective + graded open)
	MaxScore       float64    `gorm:"not null;default:0"` // points possible (incl. open)
	ScorePct       float64    `gorm:"not null;default:0"` // score/max_score * 100
	Passed         bool       `gorm:"not null;default:false"`
	Status         string     `gorm:"not null;default:'auto_scored'"` // auto_scored | pending_review | graded
	FacultyScores  []byte     `gorm:"type:jsonb;column:faculty_scores"`
	FacultyComment *string    `gorm:"column:faculty_comment"`
	GradedBy       *uuid.UUID `gorm:"type:uuid;column:graded_by"`
	GradedAt       *time.Time `gorm:"column:graded_at"`
	TimedOut       bool       `gorm:"not null;default:false;column:timed_out"`
	AttemptNumber  int        `gorm:"not null;default:1"`
	SubmittedAt    time.Time  `gorm:"not null;default:now()"`
}

func (AssessmentAttempt) TableName() string { return "assessment_attempts" }

// FacultyQuestionScore is one faculty award for one open-ended question,
// stored in AssessmentAttempt.FacultyScores (jsonb).
type FacultyQuestionScore struct {
	QuestionID   string  `json:"question_id"`
	PointsEarned float64 `json:"points_earned"`
	Comment      string  `json:"comment,omitempty"`
}

// AttemptSession anchors a timed assessment's countdown server-side. It's
// created the first time a participant opens a timed assessment they haven't
// yet completed, and read on every reopen so a refresh resumes the SAME
// countdown (started_at doesn't move). It's deleted when the attempt is
// submitted. One in-progress session per (activity, participant).
type AttemptSession struct {
	ID            uuid.UUID `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()"`
	ActivityID    uuid.UUID `gorm:"type:uuid;not null"`
	ParticipantID uuid.UUID `gorm:"type:uuid;not null"`
	StartedAt     time.Time `gorm:"not null;default:now()"`
}

func (AttemptSession) TableName() string { return "assessment_attempt_sessions" }
