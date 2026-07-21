package compliance

import (
	"fmt"
	"log"
	"time"

	"github.com/xa-lms/api/pkg/database"
)

// fixSchema creates all compliance tables idempotently on startup.
// No migration files are used - schema is applied via raw SQL with IF NOT EXISTS guards.
func fixSchema() {
	db := database.DB

	sqls := []string{
		`CREATE TABLE IF NOT EXISTS completion_gates (
			id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
			org_id UUID NOT NULL,
			program_id UUID NOT NULL,
			activity_id UUID NOT NULL,
			prereq_activity_id UUID NOT NULL,
			escalation_email TEXT DEFAULT '',
			escalation_days INT DEFAULT 3,
			created_at TIMESTAMPTZ DEFAULT NOW(),
			updated_at TIMESTAMPTZ DEFAULT NOW(),
			UNIQUE(activity_id)
		)`,
		`CREATE TABLE IF NOT EXISTS data_retention_policies (
			id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
			org_id UUID NOT NULL,
			program_id UUID NOT NULL UNIQUE,
			submissions_days INT DEFAULT 365,
			recordings_days INT DEFAULT 90,
			chat_logs_days INT DEFAULT 30,
			updated_at TIMESTAMPTZ DEFAULT NOW(),
			updated_by UUID
		)`,
		`CREATE TABLE IF NOT EXISTS gdpr_acknowledgements (
			id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
			user_id UUID NOT NULL,
			context TEXT NOT NULL,
			acked_at TIMESTAMPTZ DEFAULT NOW()
		)`,
	}

	for _, sql := range sqls {
		if err := db.Exec(sql).Error; err != nil {
			log.Printf("compliance fixSchema: %v", err)
		}
	}
	log.Println("compliance: schema ready")
}

// ── Completion Gates ─────────────────────────────────────────────────────────

func listGatesByProgram(programID string) ([]CompletionGate, error) {
	var gates []CompletionGate
	err := database.DB.
		Where("program_id = ?", programID).
		Order("created_at asc").
		Find(&gates).Error
	return gates, err
}

// upsertGate inserts a new gate or updates the escalation config if the
// activity_id already has a gate (ON CONFLICT on the unique activity_id column).
func upsertGate(g *CompletionGate) error {
	sql := `
		INSERT INTO completion_gates
			(id, org_id, program_id, activity_id, prereq_activity_id, escalation_email, escalation_days, created_at, updated_at)
		VALUES
			(uuid_generate_v4(), $1, $2, $3, $4, $5, $6, NOW(), NOW())
		ON CONFLICT (activity_id) DO UPDATE SET
			prereq_activity_id = EXCLUDED.prereq_activity_id,
			escalation_email   = EXCLUDED.escalation_email,
			escalation_days    = EXCLUDED.escalation_days,
			updated_at         = NOW()
		RETURNING id, org_id, program_id, activity_id, prereq_activity_id, escalation_email, escalation_days, created_at, updated_at
	`
	return database.DB.Raw(sql,
		g.OrgID,
		g.ProgramID,
		g.ActivityID,
		g.PrereqActivityID,
		g.EscalationEmail,
		g.EscalationDays,
	).Scan(g).Error
}

func deleteGate(id string) error {
	result := database.DB.Where("id = ?", id).Delete(&CompletionGate{})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return fmt.Errorf("gate not found")
	}
	return nil
}

// ── Data Retention Policies ──────────────────────────────────────────────────

func getRetentionPolicy(programID string) (*DataRetentionPolicy, error) {
	var p DataRetentionPolicy
	err := database.DB.Where("program_id = ?", programID).First(&p).Error
	if err != nil {
		return nil, err
	}
	return &p, nil
}

// upsertRetentionPolicy inserts or fully replaces the policy for a given program_id.
func upsertRetentionPolicy(p *DataRetentionPolicy) error {
	sql := `
		INSERT INTO data_retention_policies
			(id, org_id, program_id, submissions_days, recordings_days, chat_logs_days, updated_at, updated_by)
		VALUES
			(uuid_generate_v4(), $1, $2, $3, $4, $5, NOW(), $6)
		ON CONFLICT (program_id) DO UPDATE SET
			submissions_days = EXCLUDED.submissions_days,
			recordings_days  = EXCLUDED.recordings_days,
			chat_logs_days   = EXCLUDED.chat_logs_days,
			updated_at       = NOW(),
			updated_by       = EXCLUDED.updated_by
		RETURNING id, org_id, program_id, submissions_days, recordings_days, chat_logs_days, updated_at, updated_by
	`
	return database.DB.Raw(sql,
		p.OrgID,
		p.ProgramID,
		p.SubmissionsDays,
		p.RecordingsDays,
		p.ChatLogsDays,
		p.UpdatedBy,
	).Scan(p).Error
}

// ── GDPR Acknowledgements ────────────────────────────────────────────────────

func recordGDPRAck(a *GDPRAcknowledgement) error {
	a.AckedAt = time.Now()
	return database.DB.Create(a).Error
}

// ── Attendance Register ───────────────────────────────────────────────────────

// getAttendanceRegister returns a flat list of learner/session attendance rows
// for all participants enrolled in the given cohort.
func getAttendanceRegister(cohortID string) ([]AttendanceRegisterRow, error) {
	type rawRow struct {
		LearnerName  string
		LearnerEmail string
		SessionTitle string
		SessionDate  time.Time
		Status       string
		DurationMins int
	}

	var rows []rawRow
	sql := `
		SELECT
			u.name        AS learner_name,
			u.email       AS learner_email,
			cs.title      AS session_title,
			cs.scheduled_at AS session_date,
			COALESCE(sa.status, 'absent') AS status,
			cs.duration_mins
		FROM enrollments e
		JOIN users u ON u.id = e.user_id
		JOIN class_sessions cs ON cs.cohort_id = e.cohort_id
		LEFT JOIN session_attendance sa ON sa.session_id = cs.id AND sa.user_id = e.user_id
		WHERE e.cohort_id = $1 AND e.role = 'participant'
		ORDER BY u.name, cs.scheduled_at
	`
	if err := database.DB.Raw(sql, cohortID).Scan(&rows).Error; err != nil {
		return nil, err
	}

	result := make([]AttendanceRegisterRow, 0, len(rows))
	for _, r := range rows {
		result = append(result, AttendanceRegisterRow{
			LearnerName:  r.LearnerName,
			LearnerEmail: r.LearnerEmail,
			SessionTitle: r.SessionTitle,
			SessionDate:  r.SessionDate.Format("2006-01-02T15:04:05Z"),
			Status:       r.Status,
			DurationMins: r.DurationMins,
		})
	}
	return result, nil
}

// ── Audit Logs ───────────────────────────────────────────────────────────────

// listAuditLogs returns paginated audit log entries filtered by the provided query params.
// When OrgID is provided the result is scoped to users belonging to that organisation.
func listAuditLogs(q AuditQueryDTO) ([]AuditLogDTO, int64, error) {
	type rawLog struct {
		ID         string
		UserID     string
		UserName   string
		Action     string
		Resource   string
		ResourceID string
		IPAddress  *string
		CreatedAt  time.Time
	}

	page := q.Page
	if page < 1 {
		page = 1
	}
	limit := q.Limit
	if limit < 1 {
		limit = 20
	}
	offset := (page - 1) * limit

	baseSQL := `
		FROM audit_logs al
		LEFT JOIN users u ON u.id = al.user_id
		WHERE 1=1
	`
	args := []interface{}{}
	argIdx := 1

	if q.OrgID != "" {
		baseSQL += fmt.Sprintf(" AND u.org_id = $%d", argIdx)
		args = append(args, q.OrgID)
		argIdx++
	}
	if q.UserID != "" {
		baseSQL += fmt.Sprintf(" AND al.user_id = $%d", argIdx)
		args = append(args, q.UserID)
		argIdx++
	}
	if q.Resource != "" {
		baseSQL += fmt.Sprintf(" AND al.resource = $%d", argIdx)
		args = append(args, q.Resource)
		argIdx++
	}
	if q.Action != "" {
		baseSQL += fmt.Sprintf(" AND al.action = $%d", argIdx)
		args = append(args, q.Action)
		argIdx++
	}
	if q.DateFrom != "" {
		baseSQL += fmt.Sprintf(" AND al.created_at >= $%d", argIdx)
		args = append(args, q.DateFrom)
		argIdx++
	}
	if q.DateTo != "" {
		baseSQL += fmt.Sprintf(" AND al.created_at <= $%d", argIdx)
		args = append(args, q.DateTo)
		argIdx++
	}

	var total int64
	countSQL := "SELECT COUNT(*) " + baseSQL
	if err := database.DB.Raw(countSQL, args...).Scan(&total).Error; err != nil {
		return nil, 0, err
	}

	selectSQL := fmt.Sprintf(`
		SELECT
			al.id,
			al.user_id,
			COALESCE(u.name, '') AS user_name,
			al.action,
			al.resource,
			al.resource_id,
			al.ip_address,
			al.created_at
		%s
		ORDER BY al.created_at DESC
		LIMIT $%d OFFSET $%d
	`, baseSQL, argIdx, argIdx+1)
	args = append(args, limit, offset)

	var rows []rawLog
	if err := database.DB.Raw(selectSQL, args...).Scan(&rows).Error; err != nil {
		return nil, 0, err
	}

	dtos := make([]AuditLogDTO, 0, len(rows))
	for _, r := range rows {
		ip := ""
		if r.IPAddress != nil {
			ip = *r.IPAddress
		}
		dtos = append(dtos, AuditLogDTO{
			ID:         r.ID,
			UserID:     r.UserID,
			UserName:   r.UserName,
			Action:     r.Action,
			Resource:   r.Resource,
			ResourceID: r.ResourceID,
			IPAddress:  ip,
			CreatedAt:  r.CreatedAt.Format("2006-01-02T15:04:05Z"),
		})
	}
	return dtos, total, nil
}
