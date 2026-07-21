package surveys

import (
	"time"

	"github.com/google/uuid"
)

// SurveyQuestion is one typed question attached to a survey activity.
type SurveyQuestion struct {
	ID         uuid.UUID `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()"`
	ActivityID uuid.UUID `gorm:"type:uuid;not null"`
	Type       string    `gorm:"not null"` // likert | nps | mcq | rating | open
	Text       string    `gorm:"not null"`
	Section    string    `gorm:"not null;default:''"`
	Options    []byte    `gorm:"type:jsonb;default:'[]'"` // mcq options
	SortOrder  int       `gorm:"not null;default:0"`
	CreatedAt  time.Time
}

func (SurveyQuestion) TableName() string { return "survey_questions" }

// SurveyCompletion marks that a participant finished a survey (one per pair).
type SurveyCompletion struct {
	ID            uuid.UUID `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()"`
	ActivityID    uuid.UUID `gorm:"type:uuid;not null"`
	ParticipantID uuid.UUID `gorm:"type:uuid;not null"`
	IsAnonymous   bool      `gorm:"not null;default:false"`
	CompletedAt   time.Time `gorm:"not null;default:now()"`
}

func (SurveyCompletion) TableName() string { return "survey_completions" }

// SurveyResponse is one answer. ParticipantID is NULL for anonymous surveys
// and for external-respondent answers (which set ExternalRespondentID instead).
type SurveyResponse struct {
	ID                   uuid.UUID  `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()"`
	QuestionID           uuid.UUID  `gorm:"type:uuid;not null"`
	ActivityID           uuid.UUID  `gorm:"type:uuid;not null"`
	ParticipantID        *uuid.UUID `gorm:"type:uuid"`
	ExternalRespondentID *uuid.UUID `gorm:"type:uuid;column:external_respondent_id"`
	AnswerNum            *float64   `gorm:"column:answer_num"`
	AnswerText           *string    `gorm:"column:answer_text"`
	CreatedAt            time.Time
}

func (SurveyResponse) TableName() string { return "survey_responses" }
