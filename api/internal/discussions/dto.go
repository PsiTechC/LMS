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
	ProgramID   string    `json:"program_id,omitempty"`
	GroupID     string    `json:"group_id,omitempty"`
	SenderID    string    `json:"sender_id"`
	SenderName  string    `json:"sender_name"`
	RecipientID string    `json:"recipient_id,omitempty"`
	Body        string    `json:"body"`
	IsRead      bool      `json:"is_read"`
	CreatedAt   time.Time `json:"created_at"`
}

// ContactDTO is one person a participant is allowed to DM 1:1 — either the
// Program Manager of a shared program, or a peer participant in that program.
type ContactDTO struct {
	UserID    string `json:"user_id"`
	Name      string `json:"name"`
	Email     string `json:"email"`
	AvatarURL string `json:"avatar_url,omitempty"`
	Role      string `json:"role"` // "program_manager" | "participant"
	ProgramID string `json:"program_id"`
	Program   string `json:"program"`
}

// ── DM Group DTOs ────────────────────────────────────────────────────────────

type DMGroupMemberDTO struct {
	UserID   string    `json:"user_id"`
	Name     string    `json:"name"`
	JoinedAt time.Time `json:"joined_at"`
}

type DMGroupDTO struct {
	ID          string             `json:"id"`
	ProgramID   string             `json:"program_id"`
	Program     string             `json:"program,omitempty"`
	Name        string             `json:"name"`
	CreatedBy   string             `json:"created_by"`
	MemberCount int                `json:"member_count"`
	Members     []DMGroupMemberDTO `json:"members,omitempty"`
	CreatedAt   time.Time          `json:"created_at"`
}

type CreateDMGroupRequest struct {
	ProgramID string   `json:"program_id" validate:"required"`
	Name      string   `json:"name"       validate:"required"`
	MemberIDs []string `json:"member_ids"` // initial invitees, besides the creator
}

type SendGroupMessageRequest struct {
	Body string `json:"body" validate:"required"`
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
	ProgramID   string `json:"program_id"   validate:"required"`
	CohortID    string `json:"cohort_id"`
	Body        string `json:"body" validate:"required"`
}

type GetDMsQuery struct {
	CohortID  string `query:"cohort_id"`
	ProgramID string `query:"program_id"`
}

type CreateAnnouncementRequest struct {
	CohortID  string `json:"cohort_id"  validate:"required"`
	Title     string `json:"title"      validate:"required"`
	Body      string `json:"body"       validate:"required"`
	SendEmail bool   `json:"send_email"`
}