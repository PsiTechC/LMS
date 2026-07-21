package communications

import (
	"time"

	"github.com/google/uuid"
)

type EmailTemplate struct {
	ID        uuid.UUID `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()"`
	OrgID     uuid.UUID `gorm:"type:uuid;not null"`
	Name      string    `gorm:"not null"`
	Subject   string    `gorm:"not null"`
	BodyHTML  string    `gorm:"not null"`
	Variables []string  `gorm:"type:text[];default:'{}'"`
	CreatedBy uuid.UUID `gorm:"type:uuid"`
	CreatedAt time.Time
	UpdatedAt time.Time
}

func (EmailTemplate) TableName() string { return "email_templates" }

type EmailCampaign struct {
	ID             uuid.UUID  `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()"`
	OrgID          uuid.UUID  `gorm:"type:uuid;not null"`
	CohortID       *uuid.UUID `gorm:"type:uuid"`
	TemplateID     *uuid.UUID `gorm:"type:uuid"`
	Name           string     `gorm:"not null"`
	Subject        string     `gorm:"not null"`
	BodyHTML       string     `gorm:"not null"`
	Audience       string     `gorm:"not null;default:all_participants"`
	Status         string     `gorm:"not null;default:draft"`
	ScheduledAt    *time.Time
	SentAt         *time.Time
	RecipientCount int       `gorm:"default:0"`
	SentCount      int       `gorm:"default:0"`
	CreatedBy      uuid.UUID `gorm:"type:uuid"`
	CreatedAt      time.Time
	UpdatedAt      time.Time
}

func (EmailCampaign) TableName() string { return "email_campaigns" }

type AutomationRule struct {
	ID             uuid.UUID  `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()"`
	OrgID          uuid.UUID  `gorm:"type:uuid;not null"`
	Name           string     `gorm:"not null"`
	IsActive       bool       `gorm:"default:true"`
	TriggerType    string     `gorm:"not null"`
	TriggerConfig  []byte     `gorm:"type:jsonb;not null;default:'{}'"`
	Channel        string     `gorm:"not null;default:email"`
	TemplateID     *uuid.UUID `gorm:"type:uuid"`
	MessageSubject string
	MessageBody    string
	LastRunAt      *time.Time
	CreatedBy      uuid.UUID `gorm:"type:uuid"`
	CreatedAt      time.Time
	UpdatedAt      time.Time
}

func (AutomationRule) TableName() string { return "automation_rules" }

type NotificationLog struct {
	ID             uuid.UUID  `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()"`
	OrgID          uuid.UUID  `gorm:"type:uuid;not null"`
	CampaignID     *uuid.UUID `gorm:"type:uuid"`
	RuleID         *uuid.UUID `gorm:"type:uuid"`
	UserID         uuid.UUID  `gorm:"type:uuid;not null"`
	Channel        string     `gorm:"not null"`
	RecipientEmail string
	Subject        string
	Status         string    `gorm:"not null;default:sent"`
	ErrorMsg       string
	SentAt         time.Time `gorm:"default:now()"`
}

func (NotificationLog) TableName() string { return "notification_logs" }

type InAppNotification struct {
	ID         uuid.UUID  `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()"`
	UserID     uuid.UUID  `gorm:"type:uuid;not null"`
	Title      string     `gorm:"not null"`
	Body       string     `gorm:"not null"`
	Type       string     `gorm:"not null;default:info"`
	RuleID     *uuid.UUID `gorm:"type:uuid"`
	CampaignID *uuid.UUID `gorm:"type:uuid"`
	// Link is an optional in-app deep link (e.g. "/dashboard/participant?tab=capstone")
	// the frontend navigates to on click, so a notification lands on the
	// specific tab/item it's about instead of just marking read with nowhere
	// to go. Nil for notifications with no natural destination.
	Link      *string `gorm:"column:link"`
	ReadAt    *time.Time
	CreatedAt time.Time `gorm:"default:now()"`
}

func (InAppNotification) TableName() string { return "in_app_notifications" }
