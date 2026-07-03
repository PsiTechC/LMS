package discussions

import (
	"errors"

	"github.com/xa-lms/api/pkg/database"
	"gorm.io/gorm"
)

var ErrNotFound = errors.New("not found")

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