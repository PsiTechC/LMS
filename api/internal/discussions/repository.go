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
	// program_id: scopes a 1:1 DM to the shared program (participant↔participant)
	// or the PM's program (participant↔PM). group_id: set instead of
	// recipient_id for group messages — see model.go DirectMessage doc.
	database.DB.Exec(`ALTER TABLE direct_messages ADD COLUMN IF NOT EXISTS program_id uuid`)
	database.DB.Exec(`ALTER TABLE direct_messages ADD COLUMN IF NOT EXISTS group_id uuid`)
	database.DB.Exec(`CREATE INDEX IF NOT EXISTS idx_dm_program ON direct_messages (program_id)`)
	database.DB.Exec(`CREATE INDEX IF NOT EXISTS idx_dm_group ON direct_messages (group_id)`)

	database.DB.Exec(`CREATE TABLE IF NOT EXISTS dm_groups (
		id         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
		program_id uuid NOT NULL,
		created_by uuid NOT NULL,
		name       text NOT NULL,
		created_at timestamptz DEFAULT now()
	)`)
	database.DB.Exec(`CREATE TABLE IF NOT EXISTS dm_group_members (
		id        uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
		group_id  uuid NOT NULL,
		user_id   uuid NOT NULL,
		user_name text NOT NULL,
		joined_at timestamptz DEFAULT now()
	)`)
	database.DB.Exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_dm_group_members_unique ON dm_group_members (group_id, user_id)`)
	database.DB.Exec(`CREATE INDEX IF NOT EXISTS idx_dm_group_members_user ON dm_group_members (user_id)`)

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
// later of the thread's own updated_at and its newest reply. status "" = all;
// otherwise one of flagged | pinned | active (mirrors the derived
// AdminThreadDTO.Status computed in the service layer). Returns the page of
// rows plus the total matching count (computed before OFFSET/LIMIT).
func listAdminThreads(orgID, status string, offset, limit int) ([]adminThreadRow, int64, error) {
	base := `
		FROM threads t
		JOIN programs pr     ON pr.id = t.program_id
		JOIN organizations o ON o.id = pr.org_id
		WHERE t.is_deleted = false`
	args := []any{}
	if orgID != "" {
		base += ` AND pr.org_id = ?::uuid`
		args = append(args, orgID)
	}
	switch status {
	case "flagged":
		base += ` AND t.is_flagged = true`
	case "pinned":
		base += ` AND t.is_flagged = false AND t.is_pinned = true`
	case "active":
		base += ` AND t.is_flagged = false AND t.is_pinned = false`
	}

	var total int64
	if err := database.DB.Raw(`SELECT COUNT(*) `+base, args...).Scan(&total).Error; err != nil {
		return nil, 0, err
	}

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
		` + base + `
		ORDER BY t.is_flagged DESC, t.is_pinned DESC, last_activity DESC
		OFFSET ? LIMIT ?`
	pageArgs := append(append([]any{}, args...), offset, limit)

	var rows []adminThreadRow
	err := database.DB.Raw(q, pageArgs...).Scan(&rows).Error
	return rows, total, err
}

// ── Threads ──────────────────────────────────────────────────────────────────

// listThreads returns threads scoped by program (program-wide — all cohorts) or
// by a single cohort. programID takes precedence when non-empty.
func listThreads(cohortID, programID, category, search string, offset, limit int) ([]Thread, int64, error) {
	db := database.DB.Model(&Thread{}).Where("is_deleted = false")
	if programID != "" {
		db = db.Where("program_id = ?", programID)
	} else {
		db = db.Where("cohort_id = ?", cohortID)
	}
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

// listDMs returns the full 1:1 message history between two users. Not
// filtered by program_id: two people are either connected (share at least
// one program, enforced at send time by assertCanDM) or not — which specific
// program justified that connection is per-message provenance, not part of
// the conversation's identity. Filtering reads by program_id caused messages
// to "disappear" whenever the two sides picked different shared programs
// when opening the thread (e.g. two participants who share both Program A
// and Program B — a message sent under A was invisible to a read filtered
// on B, even though it's the same conversation between the same two people).
func listDMs(userID, otherUserID string) ([]DirectMessage, error) {
	var rows []DirectMessage
	err := database.DB.
		Where("group_id IS NULL").
		Where(
			"(sender_id = ? AND recipient_id = ?) OR (sender_id = ? AND recipient_id = ?)",
			userID, otherUserID, otherUserID, userID,
		).
		Order("created_at ASC").Find(&rows).Error
	return rows, err
}

// listDMConversations returns the latest 1:1 message per unique conversation
// partner for userID (group messages excluded — see listGroupConversations).
// Not filtered by program_id — see listDMs doc.
func listDMConversations(userID string) ([]DirectMessage, error) {
	query := `
		SELECT DISTINCT ON (partner_id) dm.*
		FROM direct_messages dm
		JOIN LATERAL (
			SELECT CASE
				WHEN dm.sender_id = ? THEN dm.recipient_id
				ELSE dm.sender_id
			END AS partner_id
		) p ON TRUE
		WHERE dm.group_id IS NULL AND (dm.sender_id = ? OR dm.recipient_id = ?)
		ORDER BY partner_id, dm.created_at DESC
	`
	var rows []DirectMessage
	err := database.DB.Raw(query, userID, userID, userID).Scan(&rows).Error
	return rows, err
}

func createDM(m *DirectMessage) error {
	return database.DB.Create(m).Error
}

func markDMsRead(recipientID, senderID string) error {
	return database.DB.Model(&DirectMessage{}).
		Where("recipient_id = ? AND sender_id = ? AND group_id IS NULL AND is_read = false", recipientID, senderID).
		UpdateColumn("is_read", true).Error
}

// ── DM contacts (participant ↔ PM, participant ↔ participant) ───────────────

// dmContactRow is one selectable person in the "who can I message" list.
type dmContactRow struct {
	UserID    string
	Name      string
	Email     string
	AvatarURL *string
	Role      string // "program_manager" | "participant"
	ProgramID string
	Program   string
}

// listProgramManagerContacts returns the single Program Manager who created
// the given program (see CLAUDE.md decision: programs.created_by is treated
// as "the" PM of that program — there's no explicit ownership table). Only
// returned if that creator is currently an active program_manager.
func listProgramManagerContacts(programID string) ([]dmContactRow, error) {
	q := `
		SELECT u.id::text AS user_id, u.name AS name, u.email AS email, u.avatar_url AS avatar_url,
		       'program_manager' AS role, pr.id::text AS program_id, pr.title AS program
		FROM programs pr
		JOIN users u ON u.id = pr.created_by
		WHERE pr.id = ?::uuid AND u.role = 'program_manager' AND u.is_active = true
	`
	var rows []dmContactRow
	err := database.DB.Raw(q, programID).Scan(&rows).Error
	return rows, err
}

// listPeerParticipantContacts returns every other participant enrolled in
// any cohort of the given program (peer DM contacts) — excludes the caller.
func listPeerParticipantContacts(programID, excludeUserID string) ([]dmContactRow, error) {
	q := `
		SELECT DISTINCT u.id::text AS user_id, u.name AS name, u.email AS email, u.avatar_url AS avatar_url,
		       'participant' AS role, pr.id::text AS program_id, pr.title AS program
		FROM enrollments e
		JOIN cohorts c   ON c.id = e.cohort_id
		JOIN programs pr ON pr.id = c.program_id
		JOIN users u     ON u.id = e.user_id
		WHERE pr.id = ?::uuid AND e.role = 'participant' AND u.id <> ?::uuid AND u.is_active = true
		ORDER BY name
	`
	var rows []dmContactRow
	err := database.DB.Raw(q, programID, excludeUserID).Scan(&rows).Error
	return rows, err
}

// listMyPrograms returns the distinct programs a participant is enrolled in
// (used to seed their DM contact list across all their programs, not just one).
func listMyPrograms(userID string) ([]string, error) {
	q := `
		SELECT DISTINCT pr.id::text
		FROM enrollments e
		JOIN cohorts c   ON c.id = e.cohort_id
		JOIN programs pr ON pr.id = c.program_id
		WHERE e.user_id = ?::uuid AND e.role = 'participant'
	`
	var ids []string
	err := database.DB.Raw(q, userID).Scan(&ids).Error
	return ids, err
}

// sharesProgramAsParticipant checks whether userID and otherUserID are both
// enrolled as participants in the given program — the server-side guard
// against sending a 1:1 DM to someone outside a shared program.
func sharesProgramAsParticipant(programID, userID, otherUserID string) (bool, error) {
	q := `
		SELECT COUNT(*) FROM (
			SELECT e.user_id FROM enrollments e JOIN cohorts c ON c.id = e.cohort_id
			WHERE c.program_id = ?::uuid AND e.role = 'participant' AND e.user_id IN (?::uuid, ?::uuid)
			GROUP BY e.user_id
		) x
	`
	var count int64
	err := database.DB.Raw(q, programID, userID, otherUserID).Scan(&count).Error
	return count == 2, err
}

// isProgramManagerOf checks whether userID is the program_manager who
// created programID (see listProgramManagerContacts doc).
func isProgramManagerOf(programID, userID string) (bool, error) {
	q := `SELECT COUNT(*) FROM programs WHERE id = ?::uuid AND created_by = ?::uuid`
	var count int64
	err := database.DB.Raw(q, programID, userID).Scan(&count).Error
	return count == 1, err
}

// isParticipantOf checks whether userID is enrolled as a participant in programID.
func isParticipantOf(programID, userID string) (bool, error) {
	q := `
		SELECT COUNT(*) FROM enrollments e JOIN cohorts c ON c.id = e.cohort_id
		WHERE c.program_id = ?::uuid AND e.user_id = ?::uuid AND e.role = 'participant'
	`
	var count int64
	err := database.DB.Raw(q, programID, userID).Scan(&count).Error
	return count > 0, err
}

// ── DM Groups (participant-created, participant-only membership) ───────────

func createDMGroup(g *DMGroup) error {
	return database.DB.Create(g).Error
}

func getDMGroupByID(id string) (*DMGroup, error) {
	var g DMGroup
	if err := database.DB.Where("id = ?", id).First(&g).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &g, nil
}

func addDMGroupMember(m *DMGroupMember) error {
	return database.DB.Create(m).Error
}

func listDMGroupMembers(groupID string) ([]DMGroupMember, error) {
	var rows []DMGroupMember
	err := database.DB.Where("group_id = ?", groupID).Order("joined_at ASC").Find(&rows).Error
	return rows, err
}

func isDMGroupMember(groupID, userID string) (bool, error) {
	var count int64
	err := database.DB.Model(&DMGroupMember{}).Where("group_id = ? AND user_id = ?", groupID, userID).Count(&count).Error
	return count > 0, err
}

// dmGroupRow is one row of "my groups" — the group joined with the caller's
// own membership + a last-activity timestamp for sorting.
type dmGroupRow struct {
	ID            string
	ProgramID     string
	Program       string
	Name          string
	CreatedBy     string
	MemberCount   int
	LastMessageAt *time.Time
}

// listMyDMGroups returns every group the user belongs to, most recently
// active first (falls back to the group's own created_at when it has no
// messages yet).
func listMyDMGroups(userID string) ([]dmGroupRow, error) {
	q := `
		SELECT g.id::text AS id, g.program_id::text AS program_id, pr.title AS program,
		       g.name AS name, g.created_by::text AS created_by,
		       (SELECT COUNT(*) FROM dm_group_members m2 WHERE m2.group_id = g.id) AS member_count,
		       (SELECT MAX(dm.created_at) FROM direct_messages dm WHERE dm.group_id = g.id) AS last_message_at
		FROM dm_groups g
		JOIN dm_group_members m ON m.group_id = g.id AND m.user_id = ?::uuid
		JOIN programs pr ON pr.id = g.program_id
		ORDER BY COALESCE((SELECT MAX(dm.created_at) FROM direct_messages dm WHERE dm.group_id = g.id), g.created_at) DESC
	`
	var rows []dmGroupRow
	err := database.DB.Raw(q, userID).Scan(&rows).Error
	return rows, err
}

func listGroupMessages(groupID string) ([]DirectMessage, error) {
	var rows []DirectMessage
	err := database.DB.Where("group_id = ?", groupID).Order("created_at ASC").Find(&rows).Error
	return rows, err
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