package discussions

import (
	"errors"
	"time"

	"github.com/xa-lms/api/pkg/database"
	"gorm.io/gorm"
)

var ErrNotFound = errors.New("not found")

// fixSchema creates the discussions tables (idempotently) and adds the
// moderation column on startup. The shared/remote DB never had these tables, so
// everything here uses CREATE TABLE / ALTER … IF [NOT] EXISTS (see CLAUDE.md →
// Database Migrations). Mirrors migrations/000034_discussion_flag.up.sql.
func fixSchema() {
	database.DB.Exec(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`)

	database.DB.Exec(`CREATE TABLE IF NOT EXISTS threads (
		id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
		cohort_id   uuid NOT NULL,
		program_id  uuid NOT NULL,
		author_id   uuid NOT NULL,
		author_name text NOT NULL,
		title       text NOT NULL,
		body        text NOT NULL,
		category    text NOT NULL DEFAULT 'discussion',
		tags        jsonb DEFAULT '[]',
		is_pinned   boolean NOT NULL DEFAULT false,
		is_flagged  boolean NOT NULL DEFAULT false,
		is_deleted  boolean NOT NULL DEFAULT false,
		reply_count integer NOT NULL DEFAULT 0,
		view_count  integer NOT NULL DEFAULT 0,
		created_at  timestamptz DEFAULT now(),
		updated_at  timestamptz DEFAULT now()
	)`)

	database.DB.Exec(`CREATE TABLE IF NOT EXISTS thread_replies (
		id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
		thread_id   uuid NOT NULL,
		author_id   uuid NOT NULL,
		author_name text NOT NULL,
		body        text NOT NULL,
		is_deleted  boolean NOT NULL DEFAULT false,
		created_at  timestamptz DEFAULT now(),
		updated_at  timestamptz DEFAULT now()
	)`)

	database.DB.Exec(`CREATE TABLE IF NOT EXISTS direct_messages (
		id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
		cohort_id    uuid,
		sender_id    uuid NOT NULL,
		sender_name  text NOT NULL,
		recipient_id uuid NOT NULL,
		body         text NOT NULL,
		is_read      boolean NOT NULL DEFAULT false,
		created_at   timestamptz DEFAULT now()
	)`)

	database.DB.Exec(`CREATE TABLE IF NOT EXISTS announcements (
		id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
		cohort_id   uuid NOT NULL,
		author_id   uuid NOT NULL,
		author_name text NOT NULL,
		title       text NOT NULL,
		body        text NOT NULL,
		send_email  boolean NOT NULL DEFAULT false,
		created_at  timestamptz DEFAULT now(),
		updated_at  timestamptz DEFAULT now()
	)`)

	// Moderation column + partial index (safe if the table pre-existed).
	database.DB.Exec(`ALTER TABLE threads ADD COLUMN IF NOT EXISTS is_flagged BOOLEAN NOT NULL DEFAULT FALSE`)
	database.DB.Exec(`CREATE INDEX IF NOT EXISTS idx_threads_flagged ON threads (is_flagged) WHERE is_flagged = TRUE`)
	database.DB.Exec(`CREATE INDEX IF NOT EXISTS idx_thread_replies_thread ON thread_replies (thread_id)`)
}

// adminThreadRow joins a thread to its program + org with a computed last-activity.
type adminThreadRow struct {
	ID           string
	Title        string
	ProgramID    string
	ProgramTitle string
	OrgID        string
	OrgName      string
	Author       string
	Replies      int
	Views        int
	IsFlagged    bool
	IsPinned     bool
	LastActivity time.Time
}

// listAdminThreads returns non-deleted threads across all orgs (or one org),
// flagged first, then pinned, then most-recent activity. last_activity is the
// later of the thread's own updated_at and its newest reply.
func listAdminThreads(orgID string) ([]adminThreadRow, error) {
	q := `
		SELECT t.id::text            AS id,
		       t.title               AS title,
		       pr.id::text           AS program_id,
		       pr.title              AS program_title,
		       o.id::text            AS org_id,
		       o.name                AS org_name,
		       t.author_name         AS author,
		       t.reply_count         AS replies,
		       t.view_count          AS views,
		       t.is_flagged          AS is_flagged,
		       t.is_pinned           AS is_pinned,
		       GREATEST(
		           t.updated_at,
		           COALESCE((SELECT MAX(r.created_at) FROM thread_replies r WHERE r.thread_id = t.id), t.updated_at)
		       )                     AS last_activity
		FROM threads t
		JOIN programs pr     ON pr.id = t.program_id
		JOIN organizations o ON o.id = pr.org_id
		WHERE t.is_deleted = false`
	args := []any{}
	if orgID != "" {
		q += ` AND pr.org_id = ?::uuid`
		args = append(args, orgID)
	}
	q += ` ORDER BY t.is_flagged DESC, t.is_pinned DESC, last_activity DESC`

	var rows []adminThreadRow
	err := database.DB.Raw(q, args...).Scan(&rows).Error
	return rows, err
}

// ── Threads ──────────────────────────────────────────────────────────────────

func listThreads(cohortID, category, search string, offset, limit int) ([]Thread, int64, error) {
	db := database.DB.Model(&Thread{}).
		Where("cohort_id = ? AND is_deleted = false", cohortID)
	if category != "" {
		db = db.Where("category = ?", category)
	}
	if search != "" {
		db = db.Where("title ILIKE ? OR body ILIKE ?", "%"+search+"%", "%"+search+"%")
	}

	var total int64
	db.Count(&total)

	var rows []Thread
	err := db.Order("is_pinned DESC, created_at DESC").Offset(offset).Limit(limit).Find(&rows).Error
	return rows, total, err
}

func getThreadByID(id string) (*Thread, error) {
	var t Thread
	if err := database.DB.Where("id = ? AND is_deleted = false", id).First(&t).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &t, nil
}

func createThread(t *Thread) error {
	return database.DB.Create(t).Error
}

func updateThread(id string, fields map[string]any) error {
	res := database.DB.Model(&Thread{}).Where("id = ?", id).Updates(fields)
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return ErrNotFound
	}
	return nil
}

func incrementViewCount(threadID string) error {
	return database.DB.Model(&Thread{}).
		Where("id = ?", threadID).
		UpdateColumn("view_count", gorm.Expr("view_count + 1")).Error
}

func incrementReplyCount(threadID string) error {
	return database.DB.Model(&Thread{}).
		Where("id = ?", threadID).
		UpdateColumn("reply_count", gorm.Expr("reply_count + 1")).Error
}

// ── Thread Replies ───────────────────────────────────────────────────────────

func listReplies(threadID string) ([]ThreadReply, error) {
	var rows []ThreadReply
	err := database.DB.
		Where("thread_id = ? AND is_deleted = false", threadID).
		Order("created_at ASC").
		Find(&rows).Error
	return rows, err
}

func createReply(r *ThreadReply) error {
	return database.DB.Create(r).Error
}

func getReplyByID(id string) (*ThreadReply, error) {
	var r ThreadReply
	if err := database.DB.Where("id = ? AND is_deleted = false", id).First(&r).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &r, nil
}

func updateReply(id string, fields map[string]any) error {
	res := database.DB.Model(&ThreadReply{}).Where("id = ?", id).Updates(fields)
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return ErrNotFound
	}
	return nil
}

// ── Direct Messages ──────────────────────────────────────────────────────────

func listDMs(userID, otherUserID string) ([]DirectMessage, error) {
	var rows []DirectMessage
	err := database.DB.
		Where(
			"(sender_id = ? AND recipient_id = ?) OR (sender_id = ? AND recipient_id = ?)",
			userID, otherUserID, otherUserID, userID,
		).
		Order("created_at ASC").
		Find(&rows).Error
	return rows, err
}

// listDMConversations returns the latest message per unique conversation partner for userID.
// Optionally filtered by cohort_id.
func listDMConversations(userID string, cohortID string) ([]DirectMessage, error) {
	cohortFilter := ""
	args := []any{userID, userID, userID, userID}
	if cohortID != "" {
		cohortFilter = "AND cohort_id = ?"
		args = []any{userID, userID, cohortID, userID, userID}
	}

	query := `
		SELECT DISTINCT ON (partner_id) dm.*
		FROM direct_messages dm
		JOIN LATERAL (
			SELECT CASE
				WHEN dm.sender_id = ? THEN dm.recipient_id
				ELSE dm.sender_id
			END AS partner_id
		) p ON TRUE
		WHERE (dm.sender_id = ? OR dm.recipient_id = ?) ` + cohortFilter + `
		ORDER BY partner_id, dm.created_at DESC
	`

	if cohortID != "" {
		args = []any{userID, userID, userID, cohortID}
	} else {
		args = []any{userID, userID, userID}
	}

	var rows []DirectMessage
	err := database.DB.Raw(query, args...).Scan(&rows).Error
	return rows, err
}

func createDM(m *DirectMessage) error {
	return database.DB.Create(m).Error
}

func markDMsRead(recipientID, senderID string) error {
	return database.DB.Model(&DirectMessage{}).
		Where("recipient_id = ? AND sender_id = ? AND is_read = false", recipientID, senderID).
		UpdateColumn("is_read", true).Error
}

// ── Announcements ────────────────────────────────────────────────────────────

func listAnnouncements(cohortID string) ([]Announcement, error) {
	var rows []Announcement
	err := database.DB.
		Where("cohort_id = ?", cohortID).
		Order("created_at DESC").
		Find(&rows).Error
	return rows, err
}

func createAnnouncement(a *Announcement) error {
	return database.DB.Create(a).Error
}

func getAnnouncementByID(id string) (*Announcement, error) {
	var a Announcement
	if err := database.DB.Where("id = ?", id).First(&a).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &a, nil
}

func deleteAnnouncement(id string) error {
	res := database.DB.Where("id = ?", id).Delete(&Announcement{})
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return ErrNotFound
	}
	return nil
}