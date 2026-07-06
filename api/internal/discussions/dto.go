package discussions

import "time"

// AdminThreadDTO is one row of the superadmin cross-org discussions list.
type AdminThreadDTO struct {
	ID           string `json:"id"`
	Title        string `json:"title"`
	Program      string `json:"program"`
	ProgramID    string `json:"program_id"`
	Org          string `json:"org"`
	OrgID        string `json:"org_id"`
	Author       string `json:"author"`
	Replies      int    `json:"replies"`
	Views        int    `json:"views"`
	Status       string `json:"status"`        // active | flagged | pinned
	LastActivity string `json:"last_activity"` // RFC3339 (UTC)
}

// FlagThreadRequest is the moderation action body for the admin flag endpoint.
type FlagThreadRequest struct {
	Action string `json:"action" validate:"required"` // pin | unpin | flag | unflag | delete
}

// ── Thread DTOs ──────────────────────────────────────────────────────────────

type ThreadDTO struct {
	ID         string     `json:"id"`
	CohortID   string     `json:"cohort_id"`
	ProgramID  string     `json:"program_id"`
	AuthorID   string     `json:"author_id"`
	AuthorName string     `json:"author_name"`
	Title      string     `json:"title"`
	Body       string     `json:"body"`
	Category   string     `json:"category"`
	Tags       []string   `json:"tags"`
	IsPinned   bool       `json:"is_pinned"`
	ReplyCount int        `json:"reply_count"`
	ViewCount  int        `json:"view_count"`
	CreatedAt  time.Time  `json:"created_at"`
	UpdatedAt  time.Time  `json:"updated_at"`
	Replies    []ReplyDTO `json:"replies,omitempty"`
}

type ReplyDTO struct {
	ID         string    `json:"id"`
	ThreadID   string    `json:"thread_id"`
	AuthorID   string    `json:"author_id"`
	AuthorName string    `json:"author_name"`
	Body       string    `json:"body"`
	CreatedAt  time.Time `json:"created_at"`
}

// ── Direct Message DTOs ──────────────────────────────────────────────────────

type DirectMessageDTO struct {
	ID          string    `json:"id"`
	CohortID    string    `json:"cohort_id,omitempty"`
	SenderID    string    `json:"sender_id"`
	SenderName  string    `json:"sender_name"`
	RecipientID string    `json:"recipient_id"`
	Body        string    `json:"body"`
	IsRead      bool      `json:"is_read"`
	CreatedAt   time.Time `json:"created_at"`
}

// ── Announcement DTOs ────────────────────────────────────────────────────────

type AnnouncementDTO struct {
	ID         string    `json:"id"`
	CohortID   string    `json:"cohort_id"`
	AuthorID   string    `json:"author_id"`
	AuthorName string    `json:"author_name"`
	Title      string    `json:"title"`
	Body       string    `json:"body"`
	SendEmail  bool      `json:"send_email"`
	CreatedAt  time.Time `json:"created_at"`
}

// ── Request structs ──────────────────────────────────────────────────────────

type ListThreadsQuery struct {
	CohortID  string `query:"cohort_id"`
	ProgramID string `query:"program_id"` // program-wide listing (all cohorts)
	Category  string `query:"category"`
	Search    string `query:"search"`
	Page      int    `query:"page"`
	PerPage   int    `query:"per_page"`
}

type CreateThreadRequest struct {
	CohortID  string   `json:"cohort_id"  validate:"required"`
	ProgramID string   `json:"program_id" validate:"required"`
	Title     string   `json:"title"      validate:"required"`
	Body      string   `json:"body"       validate:"required"`
	Category  string   `json:"category"`
	Tags      []string `json:"tags"`
}

type CreateReplyRequest struct {
	Body string `json:"body" validate:"required"`
}

type SendDMRequest struct {
	RecipientID string `json:"recipient_id" validate:"required"`
	CohortID    string `json:"cohort_id"`
	Body        string `json:"body" validate:"required"`
}

type GetDMsQuery struct {
	CohortID string `query:"cohort_id"`
}

type CreateAnnouncementRequest struct {
	CohortID  string `json:"cohort_id"  validate:"required"`
	Title     string `json:"title"      validate:"required"`
	Body      string `json:"body"       validate:"required"`
	SendEmail bool   `json:"send_email"`
}