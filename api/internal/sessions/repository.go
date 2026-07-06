package sessions

import (
	"encoding/json"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/xa-lms/api/pkg/database"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

var ErrNotFound = errors.New("session not found")
var ErrForbidden = errors.New("forbidden")

// ── Sessions ───────────────────────────────────────────────────────────────

func listSessions(cohortID, facultyID, status string, offset, limit int) ([]ClassSession, int64, error) {
	db := database.DB.Model(&ClassSession{})
	if cohortID != "" {
		db = db.Where("cohort_id = ?", cohortID)
	}
	if facultyID != "" {
		db = db.Where("faculty_id = ?", facultyID)
	}
	if status != "" {
		db = db.Where("status = ?", status)
	}
	var total int64
	db.Count(&total)
	var rows []ClassSession
	err := db.Order("scheduled_at asc").Offset(offset).Limit(limit).Find(&rows).Error
	return rows, total, err
}

// listSessionsByFaculty returns sessions the faculty either created (faculty_id)
// OR is assigned to via activity_faculty on any activity in the session's program.
// cohortID is optional; when non-empty it is applied as an additional filter.
func listSessionsByFaculty(facultyID, cohortID, status string, offset, limit int) ([]ClassSession, int64, error) {
	cond := `(
		cs.faculty_id = ?::uuid
		OR cs.program_id IN (
			SELECT DISTINCT ph.program_id
			FROM program_phases ph
			JOIN activities a ON a.phase_id = ph.id
			JOIN activity_faculty af ON af.activity_id = a.id
			WHERE af.faculty_user_id = ?::uuid
		)
	)`
	countArgs := []any{facultyID, facultyID}
	countQ := "SELECT COUNT(DISTINCT cs.id) FROM class_sessions cs WHERE " + cond
	if cohortID != "" {
		countQ += " AND cs.cohort_id = ?::uuid"
		countArgs = append(countArgs, cohortID)
	}
	if status != "" {
		countQ += " AND cs.status = ?"
		countArgs = append(countArgs, status)
	}
	var total int64
	if err := database.DB.Raw(countQ, countArgs...).Scan(&total).Error; err != nil {
		return nil, 0, err
	}

	dataArgs := []any{facultyID, facultyID}
	dataQ := "SELECT DISTINCT cs.* FROM class_sessions cs WHERE " + cond
	if cohortID != "" {
		dataQ += " AND cs.cohort_id = ?::uuid"
		dataArgs = append(dataArgs, cohortID)
	}
	if status != "" {
		dataQ += " AND cs.status = ?"
		dataArgs = append(dataArgs, status)
	}
	dataQ += " ORDER BY cs.scheduled_at ASC LIMIT ? OFFSET ?"
	dataArgs = append(dataArgs, limit, offset)

	var rows []ClassSession
	err := database.DB.Raw(dataQ, dataArgs...).Scan(&rows).Error
	return rows, total, err
}

// isFacultyAuthorisedForSession returns true if the faculty either owns the
// session (faculty_id) or is assigned via activity_faculty to the program.
func isFacultyAuthorisedForSession(sessionID, facultyID string) (bool, error) {
	var count int64
	err := database.DB.Raw(`
		SELECT COUNT(*) FROM (
			SELECT 1 FROM class_sessions
			WHERE id = ?::uuid AND faculty_id = ?::uuid
			UNION ALL
			SELECT 1
			FROM class_sessions cs
			JOIN program_phases ph ON ph.program_id = cs.program_id
			JOIN activities a ON a.phase_id = ph.id
			JOIN activity_faculty af ON af.activity_id = a.id
			WHERE cs.id = ?::uuid AND af.faculty_user_id = ?::uuid
			LIMIT 1
		) sub
	`, sessionID, facultyID, sessionID, facultyID).Scan(&count).Error
	return count > 0, err
}

func getSessionByID(id string) (*ClassSession, error) {
	var s ClassSession
	if err := database.DB.Where("id = ?", id).First(&s).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &s, nil
}

func createSession(s *ClassSession) error {
	return database.DB.Create(s).Error
}

func updateSession(id string, fields map[string]any) error {
	res := database.DB.Model(&ClassSession{}).Where("id = ?", id).Updates(fields)
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return ErrNotFound
	}
	return nil
}

func startSessionDB(id string) error {
	res := database.DB.Model(&ClassSession{}).
		Where("id = ? AND status = 'scheduled'", id).
		Updates(map[string]any{"status": "live", "started_at": time.Now()})
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return ErrNotFound
	}
	return nil
}

func endSessionDB(id string) error {
	res := database.DB.Model(&ClassSession{}).
		Where("id = ? AND status = 'live'", id).
		Updates(map[string]any{"status": "completed", "ended_at": time.Now()})
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return ErrNotFound
	}
	return nil
}

func updateSessionAgendaDB(id string, items []AgendaItem) error {
	b, err := json.Marshal(items)
	if err != nil {
		return err
	}
	res := database.DB.Exec("UPDATE class_sessions SET agenda = ?::jsonb, updated_at = NOW() WHERE id = ?", string(b), id)
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return ErrNotFound
	}
	return nil
}

func updateSessionNotesDB(id, notes string) error {
	res := database.DB.Model(&ClassSession{}).Where("id = ?", id).Updates(map[string]any{"notes": notes})
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return ErrNotFound
	}
	return nil
}

// ── Materials ──────────────────────────────────────────────────────────────

func listMaterials(sessionID string) ([]SessionMaterial, error) {
	var rows []SessionMaterial
	err := database.DB.Where("session_id = ?", sessionID).Order("created_at asc").Find(&rows).Error
	return rows, err
}

func addMaterial(m *SessionMaterial) error {
	return database.DB.Create(m).Error
}

func deleteMaterial(sessionID, materialID string) error {
	res := database.DB.Where("id = ? AND session_id = ?", materialID, sessionID).Delete(&SessionMaterial{})
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return ErrNotFound
	}
	return nil
}

// ── Attendance ─────────────────────────────────────────────────────────────

func getAttendance(sessionID string) ([]SessionAttendance, error) {
	var rows []SessionAttendance
	err := database.DB.Where("session_id = ?", sessionID).Find(&rows).Error
	return rows, err
}

func markAttendance(sessionID uuid.UUID, entries []AttendanceEntry) error {
	rows := make([]SessionAttendance, 0, len(entries))
	for _, e := range entries {
		uid, err := uuid.Parse(e.UserID)
		if err != nil {
			continue
		}
		rows = append(rows, SessionAttendance{
			SessionID: sessionID,
			UserID:    uid,
			Status:    e.Status,
		})
	}
	if len(rows) == 0 {
		return nil
	}
	return database.DB.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "session_id"}, {Name: "user_id"}},
		DoUpdates: clause.AssignmentColumns([]string{"status", "marked_at"}),
	}).Create(&rows).Error
}

// ── Polls ──────────────────────────────────────────────────────────────────

func listPolls(sessionID string) ([]SessionPoll, error) {
	var rows []SessionPoll
	err := database.DB.Where("session_id = ?", sessionID).Order("created_at asc").Find(&rows).Error
	return rows, err
}

func getPollByID(id string) (*SessionPoll, error) {
	var p SessionPoll
	if err := database.DB.Where("id = ?", id).First(&p).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, errors.New("poll not found")
		}
		return nil, err
	}
	return &p, nil
}

func createPoll(p *SessionPoll) error {
	return database.DB.Create(p).Error
}

func activatePollDB(sessionID, pollID string) error {
	tx := database.DB.Begin()
	if err := tx.Model(&SessionPoll{}).Where("session_id = ?", sessionID).Update("is_active", false).Error; err != nil {
		tx.Rollback()
		return err
	}
	if err := tx.Model(&SessionPoll{}).Where("id = ? AND session_id = ?", pollID, sessionID).Update("is_active", true).Error; err != nil {
		tx.Rollback()
		return err
	}
	return tx.Commit().Error
}

func deactivatePollDB(pollID string) error {
	return database.DB.Model(&SessionPoll{}).Where("id = ?", pollID).Update("is_active", false).Error
}

type PollVoteCountRow struct {
	OptionIndex int `gorm:"column:option_index"`
	Count       int `gorm:"column:count"`
}

func getPollVoteCounts(pollID string) ([]PollVoteCountRow, error) {
	var rows []PollVoteCountRow
	err := database.DB.Raw(`
		SELECT option_index, COUNT(*)::INT AS count
		FROM session_poll_votes
		WHERE poll_id = ?
		GROUP BY option_index
		ORDER BY option_index
	`, pollID).Scan(&rows).Error
	return rows, err
}

func submitVote(v *SessionPollVote) error {
	return database.DB.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "poll_id"}, {Name: "user_id"}},
		DoUpdates: clause.AssignmentColumns([]string{"option_index", "voted_at"}),
	}).Create(v).Error
}

// ── Action Items ───────────────────────────────────────────────────────────

func listActionItems(sessionID string) ([]SessionActionItem, error) {
	var rows []SessionActionItem
	err := database.DB.Where("session_id = ?", sessionID).Order("created_at asc").Find(&rows).Error
	return rows, err
}

func createActionItem(a *SessionActionItem) error {
	return database.DB.Create(a).Error
}

func updateActionItemDB(id string, fields map[string]any) error {
	fields["updated_at"] = time.Now()
	res := database.DB.Model(&SessionActionItem{}).Where("id = ?", id).Updates(fields)
	return res.Error
}

// ── Reflections ────────────────────────────────────────────────────────────

func createOrUpdateReflection(r *SessionReflection) error {
	// Upsert: one reflection per (session, agenda_item, participant)
	return database.DB.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "session_id"}, {Name: "agenda_item_id"}, {Name: "participant_id"}},
		DoUpdates: clause.AssignmentColumns([]string{"content", "updated_at"}),
	}).Create(r).Error
}

func listReflectionsBySession(sessionID, agendaItemID string) ([]SessionReflection, error) {
	db := database.DB.Where("session_id = ?", sessionID)
	if agendaItemID != "" {
		db = db.Where("agenda_item_id = ?", agendaItemID)
	}
	var rows []SessionReflection
	err := db.Order("created_at asc").Find(&rows).Error
	return rows, err
}

func getReflectionByParticipant(sessionID, agendaItemID, participantID string) (*SessionReflection, error) {
	var r SessionReflection
	err := database.DB.
		Where("session_id = ? AND agenda_item_id = ? AND participant_id = ?", sessionID, agendaItemID, participantID).
		First(&r).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return &r, nil
}

func addCommentToReflection(reflectionID, facultyID, comment string) error {
	now := time.Now()
	fid, err := uuid.Parse(facultyID)
	if err != nil {
		return errors.New("invalid faculty_id")
	}
	res := database.DB.Model(&SessionReflection{}).
		Where("id = ?", reflectionID).
		Updates(map[string]any{
			"faculty_comment": comment,
			"commented_by":    fid,
			"commented_at":    now,
			"updated_at":      now,
		})
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return errors.New("reflection not found")
	}
	return nil
}

// ── Admin aggregate (superadmin cross-org) ────────────────────────

// adminSessionRow is one class session with resolved names + real
// enrolled/present counts and any recording material. Status/platform/
// attendance are computed in the service (time-based) from these fields.
type adminSessionRow struct {
	ID           string
	Title        string
	Faculty      string
	DurationMins int
	Program      string
	Org          string
	OrgID        string
	ScheduledAt  time.Time
	VirtualLink  *string
	StoredStatus string
	StartedAt    *time.Time
	EndedAt      *time.Time
	Enrolled     int
	Present      int
	RecordingURL *string
}

// listAdminSessions returns every class session (optionally one org), joined to
// program/org/faculty, with enrolled count (from cohort enrollments) and present
// count (from session_attendance). orgID "" = all orgs. Newest first.
func listAdminSessions(orgID string) ([]adminSessionRow, error) {
	q := `
		SELECT s.id::text          AS id,
		       s.title             AS title,
		       COALESCE(u.name,'') AS faculty,
		       s.duration_mins     AS duration_mins,
		       pr.title            AS program,
		       o.name              AS org,
		       o.id::text          AS org_id,
		       s.scheduled_at      AS scheduled_at,
		       s.virtual_link      AS virtual_link,
		       s.status            AS stored_status,
		       s.started_at        AS started_at,
		       s.ended_at          AS ended_at,
		       COALESCE((
		           SELECT COUNT(DISTINCT e.user_id)
		           FROM enrollments e
		           JOIN cohorts c2 ON c2.id = e.cohort_id
		           WHERE e.role = 'participant' AND e.status <> 'withdrawn'
		             AND ( (s.cohort_id IS NOT NULL AND e.cohort_id = s.cohort_id)
		                OR (s.cohort_id IS NULL AND c2.program_id = s.program_id) )
		       ), 0)               AS enrolled,
		       COALESCE((
		           SELECT COUNT(*) FROM session_attendance sa
		           WHERE sa.session_id = s.id AND sa.status = 'present'
		       ), 0)               AS present,
		       (
		           SELECT sm.url FROM session_materials sm
		           WHERE sm.session_id = s.id AND sm.type ILIKE 'recording'
		           ORDER BY sm.created_at DESC LIMIT 1
		       )                   AS recording_url
		FROM class_sessions s
		JOIN programs pr      ON pr.id = s.program_id
		JOIN organizations o  ON o.id = pr.org_id
		LEFT JOIN users u     ON u.id = s.faculty_id
		WHERE 1 = 1`
	args := []any{}
	if orgID != "" {
		q += ` AND pr.org_id = ?::uuid`
		args = append(args, orgID)
	}
	q += ` ORDER BY s.scheduled_at DESC`

	var rows []adminSessionRow
	err := database.DB.Raw(q, args...).Scan(&rows).Error
	return rows, err
}
