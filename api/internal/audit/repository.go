package audit

import (
	"log"

	"github.com/xa-lms/api/pkg/database"
	"gorm.io/gorm"
)

// fixSchema creates the audit_events table idempotently on startup, mirroring
// migrations/000022_audit_events.up.sql (same pattern as the compliance,
// content and roles modules).
func fixSchema() {
	db := database.DB
	sqls := []string{
		`CREATE TABLE IF NOT EXISTS audit_events (
			id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
			actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
			actor_role TEXT,
			org_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
			category TEXT NOT NULL,
			action TEXT NOT NULL,
			target_type TEXT,
			target_id TEXT,
			severity TEXT NOT NULL DEFAULT 'info'
				CHECK (severity IN ('info', 'warning', 'error', 'success')),
			detail JSONB NOT NULL DEFAULT '{}',
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)`,
		`CREATE INDEX IF NOT EXISTS idx_audit_events_actor ON audit_events (actor_user_id)`,
		`CREATE INDEX IF NOT EXISTS idx_audit_events_org ON audit_events (org_id)`,
		`CREATE INDEX IF NOT EXISTS idx_audit_events_category ON audit_events (category)`,
		`CREATE INDEX IF NOT EXISTS idx_audit_events_action ON audit_events (action)`,
		`CREATE INDEX IF NOT EXISTS idx_audit_events_severity ON audit_events (severity)`,
		`CREATE INDEX IF NOT EXISTS idx_audit_events_created ON audit_events (created_at DESC)`,
	}
	for _, sql := range sqls {
		if err := db.Exec(sql).Error; err != nil {
			log.Printf("audit fixSchema: %v", err)
		}
	}
	log.Println("audit: schema ready")
}

func listLogs(userID, resource, action string, offset, limit int) ([]AuditLog, int64, error) {
	db := database.DB.Model(&AuditLog{})
	if userID != "" {
		db = db.Where("user_id = ?", userID)
	}
	if resource != "" {
		db = db.Where("resource = ?", resource)
	}
	if action != "" {
		db = db.Where("action = ?", action)
	}
	var total int64
	db.Count(&total)
	var logs []AuditLog
	err := db.Order("created_at desc").Offset(offset).Limit(limit).Find(&logs).Error
	return logs, total, err
}

func writeLog(entry *AuditLog) error {
	return database.DB.Create(entry).Error
}

// ── audit_events (central log) ─────────────────────────────────────────────

func insertEvent(e *AuditEvent) error {
	return database.DB.Create(e).Error
}

// eventRow is a joined read-model: audit_events columns plus the actor's
// name/email resolved from the users table (LEFT JOIN — may be null).
type eventRow struct {
	AuditEvent
	ActorName  *string `gorm:"column:actor_name"`
	ActorEmail *string `gorm:"column:actor_email"`
}

// eventFilter carries the optional list filters from service → repository.
// DateFrom / DateTo are pre-normalized RFC3339 timestamps (or empty).
type eventFilter struct {
	ActorUserID string
	OrgID       string
	Category    string
	Action      string
	Severity    string
	UserSearch  string
	DateFrom    string
	DateTo      string
}

// applyEventFilters builds the WHERE clause shared by the list and count queries.
func applyEventFilters(db *gorm.DB, f eventFilter) *gorm.DB {
	if f.ActorUserID != "" {
		db = db.Where("ae.actor_user_id = ?", f.ActorUserID)
	}
	if f.OrgID != "" {
		db = db.Where("ae.org_id = ?", f.OrgID)
	}
	if f.Category != "" {
		db = db.Where("ae.category = ?", f.Category)
	}
	if f.Action != "" {
		db = db.Where("ae.action = ?", f.Action)
	}
	if f.Severity != "" {
		db = db.Where("ae.severity = ?", f.Severity)
	}
	if f.UserSearch != "" {
		like := "%" + f.UserSearch + "%"
		db = db.Where("u.name ILIKE ? OR u.email ILIKE ?", like, like)
	}
	if f.DateFrom != "" {
		db = db.Where("ae.created_at >= ?", f.DateFrom)
	}
	if f.DateTo != "" {
		db = db.Where("ae.created_at <= ?", f.DateTo)
	}
	return db
}

// queryEvents returns filtered audit events joined with actor identity.
// A limit <= 0 disables pagination (used by CSV export, capped by the caller).
func queryEvents(f eventFilter, offset, limit int) ([]eventRow, int64, error) {
	base := database.DB.
		Table("audit_events AS ae").
		Joins("LEFT JOIN users u ON u.id = ae.actor_user_id")
	base = applyEventFilters(base, f)

	var total int64
	if err := base.Session(&gorm.Session{}).Count(&total).Error; err != nil {
		return nil, 0, err
	}

	q := base.Session(&gorm.Session{}).
		Select("ae.*, u.name AS actor_name, u.email AS actor_email").
		Order("ae.created_at DESC").
		Offset(offset)
	if limit > 0 {
		q = q.Limit(limit)
	}

	var rows []eventRow
	err := q.Find(&rows).Error
	return rows, total, err
}

// eventSummary computes today's dashboard counts in a single pass using
// FILTER aggregates. "Today" is the current server day in UTC.
func eventSummary() (AuditSummaryResponse, error) {
	var s AuditSummaryResponse
	err := database.DB.Raw(`
		SELECT
			COUNT(*) FILTER (WHERE created_at >= date_trunc('day', now()))                                   AS total_today,
			COUNT(*) FILTER (WHERE severity = 'error'      AND created_at >= date_trunc('day', now()))        AS errors,
			COUNT(*) FILTER (WHERE severity = 'warning'    AND created_at >= date_trunc('day', now()))        AS warnings,
			COUNT(*) FILTER (WHERE actor_role = 'superadmin' AND created_at >= date_trunc('day', now()))      AS admin_actions
		FROM audit_events
	`).Scan(&s).Error
	return s, err
}
