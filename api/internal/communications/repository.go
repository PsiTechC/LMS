package communications

import (
	"encoding/json"
	"fmt"
	"log"
	"time"

	"github.com/xa-lms/api/pkg/database"
)

// fixSchema creates/alters tables idempotently on startup
func fixSchema() {
	db := database.DB

	sqls := []string{
		`CREATE TABLE IF NOT EXISTS email_templates (
			id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
			org_id UUID NOT NULL,
			name TEXT NOT NULL,
			subject TEXT NOT NULL,
			body_html TEXT NOT NULL,
			variables TEXT[] DEFAULT '{}',
			created_by UUID,
			created_at TIMESTAMPTZ DEFAULT NOW(),
			updated_at TIMESTAMPTZ DEFAULT NOW()
		)`,
		`CREATE TABLE IF NOT EXISTS email_campaigns (
			id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
			org_id UUID NOT NULL,
			cohort_id UUID,
			template_id UUID,
			name TEXT NOT NULL,
			subject TEXT NOT NULL,
			body_html TEXT NOT NULL,
			audience TEXT NOT NULL DEFAULT 'all_participants',
			status TEXT NOT NULL DEFAULT 'draft',
			scheduled_at TIMESTAMPTZ,
			sent_at TIMESTAMPTZ,
			recipient_count INT DEFAULT 0,
			sent_count INT DEFAULT 0,
			created_by UUID,
			created_at TIMESTAMPTZ DEFAULT NOW(),
			updated_at TIMESTAMPTZ DEFAULT NOW()
		)`,
		`CREATE TABLE IF NOT EXISTS automation_rules (
			id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
			org_id UUID NOT NULL,
			name TEXT NOT NULL,
			is_active BOOLEAN DEFAULT true,
			trigger_type TEXT NOT NULL,
			trigger_config JSONB NOT NULL DEFAULT '{}',
			channel TEXT NOT NULL DEFAULT 'email',
			template_id UUID,
			message_subject TEXT,
			message_body TEXT,
			last_run_at TIMESTAMPTZ,
			created_by UUID,
			created_at TIMESTAMPTZ DEFAULT NOW(),
			updated_at TIMESTAMPTZ DEFAULT NOW()
		)`,
		`CREATE TABLE IF NOT EXISTS notification_logs (
			id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
			org_id UUID NOT NULL,
			campaign_id UUID,
			rule_id UUID,
			user_id UUID NOT NULL,
			channel TEXT NOT NULL,
			recipient_email TEXT,
			subject TEXT,
			status TEXT DEFAULT 'sent',
			error_msg TEXT,
			sent_at TIMESTAMPTZ DEFAULT NOW()
		)`,
		`CREATE TABLE IF NOT EXISTS in_app_notifications (
			id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
			user_id UUID NOT NULL,
			title TEXT NOT NULL,
			body TEXT NOT NULL,
			type TEXT NOT NULL DEFAULT 'info',
			rule_id UUID,
			campaign_id UUID,
			read_at TIMESTAMPTZ,
			created_at TIMESTAMPTZ DEFAULT NOW()
		)`,
	}

	for _, sql := range sqls {
		if err := db.Exec(sql).Error; err != nil {
			log.Printf("communications fixSchema: %v", err)
		}
	}
	log.Println("communications: schema ready")
}

// ── Email Templates ──────────────────────────────────────────────

func createTemplate(t *EmailTemplate) error {
	return database.DB.Create(t).Error
}

func listTemplates(orgID string) ([]EmailTemplate, error) {
	var list []EmailTemplate
	err := database.DB.Where("org_id = ?", orgID).Order("created_at desc").Find(&list).Error
	return list, err
}

func getTemplate(id string) (*EmailTemplate, error) {
	var t EmailTemplate
	err := database.DB.Where("id = ?", id).First(&t).Error
	if err != nil {
		return nil, err
	}
	return &t, nil
}

func updateTemplate(id string, updates map[string]interface{}) error {
	updates["updated_at"] = time.Now()
	return database.DB.Model(&EmailTemplate{}).Where("id = ?", id).Updates(updates).Error
}

func deleteTemplate(id string) error {
	return database.DB.Where("id = ?", id).Delete(&EmailTemplate{}).Error
}

// ── Campaigns ────────────────────────────────────────────────────

func createCampaign(c *EmailCampaign) error {
	return database.DB.Create(c).Error
}

func listCampaigns(orgID string, page, perPage int) ([]EmailCampaign, int64, error) {
	var list []EmailCampaign
	var total int64
	offset := (page - 1) * perPage
	q := database.DB.Model(&EmailCampaign{}).Where("org_id = ?", orgID)
	q.Count(&total)
	err := q.Order("created_at desc").Offset(offset).Limit(perPage).Find(&list).Error
	return list, total, err
}

func getCampaign(id string) (*EmailCampaign, error) {
	var c EmailCampaign
	err := database.DB.Where("id = ?", id).First(&c).Error
	if err != nil {
		return nil, err
	}
	return &c, nil
}

func updateCampaign(id string, updates map[string]interface{}) error {
	updates["updated_at"] = time.Now()
	return database.DB.Model(&EmailCampaign{}).Where("id = ?", id).Updates(updates).Error
}

func deleteCampaign(id string) error {
	return database.DB.Where("id = ?", id).Delete(&EmailCampaign{}).Error
}

// ── Automation Rules ─────────────────────────────────────────────

func createRule(r *AutomationRule) error {
	return database.DB.Create(r).Error
}

func listRules(orgID string) ([]AutomationRule, error) {
	var list []AutomationRule
	err := database.DB.Where("org_id = ?", orgID).Order("created_at desc").Find(&list).Error
	return list, err
}

func listActiveRules() ([]AutomationRule, error) {
	var list []AutomationRule
	err := database.DB.Where("is_active = true").Find(&list).Error
	return list, err
}

func getRule(id string) (*AutomationRule, error) {
	var r AutomationRule
	err := database.DB.Where("id = ?", id).First(&r).Error
	if err != nil {
		return nil, err
	}
	return &r, nil
}

func updateRule(id string, updates map[string]interface{}) error {
	updates["updated_at"] = time.Now()
	return database.DB.Model(&AutomationRule{}).Where("id = ?", id).Updates(updates).Error
}

func deleteRule(id string) error {
	return database.DB.Where("id = ?", id).Delete(&AutomationRule{}).Error
}

func updateRuleLastRun(id string) error {
	now := time.Now()
	return database.DB.Model(&AutomationRule{}).Where("id = ?", id).Update("last_run_at", now).Error
}

// ── In-App Notifications ─────────────────────────────────────────

func createInAppNotification(n *InAppNotification) error {
	return database.DB.Create(n).Error
}

// ── At-risk participants (org-scoped) ────────────────────────────

// atRiskRow is one at-risk enrollment joined to its user/cohort/program/org.
type atRiskRow struct {
	UserID            string
	Name              string
	Email             string
	Org               string
	OrgID             string
	Program           string
	Cohort            string
	CohortID          string
	RiskLevel         string
	CompletionPercent float64
	DaysSinceActivity int
	NudgedAt          *time.Time
}

// listAtRiskParticipants derives at-risk participants from enrollments
// (risk_level high|medium) — the same signal analytics uses — but scoped across
// an org (orgID "" = all orgs) rather than a single cohort. High risk first.
func listAtRiskParticipants(orgID string) ([]atRiskRow, error) {
	q := `
		SELECT u.id::text                                  AS user_id,
		       u.name                                      AS name,
		       u.email                                     AS email,
		       o.name                                      AS org,
		       o.id::text                                  AS org_id,
		       pr.title                                    AS program,
		       c.name                                      AS cohort,
		       c.id::text                                  AS cohort_id,
		       e.risk_level                                AS risk_level,
		       COALESCE(e.completion_percent, 0)::float    AS completion_percent,
		       COALESCE(EXTRACT(DAY FROM NOW() - MAX(ap.started_at))::int, 999) AS days_since_activity,
		       e.nudged_at                                 AS nudged_at
		FROM enrollments e
		JOIN users u          ON u.id = e.user_id
		JOIN cohorts c        ON c.id = e.cohort_id
		JOIN programs pr      ON pr.id = c.program_id
		JOIN organizations o  ON o.id = pr.org_id
		LEFT JOIN activity_progress ap ON ap.enrollment_id = e.id
		WHERE e.role = 'participant' AND e.status <> 'withdrawn'
		  AND e.risk_level IN ('high', 'medium')`
	args := []any{}
	if orgID != "" {
		q += ` AND o.id = ?::uuid`
		args = append(args, orgID)
	}
	q += `
		GROUP BY u.id, u.name, u.email, o.name, o.id, pr.title, c.name, c.id,
		         e.risk_level, e.completion_percent, e.nudged_at
		ORDER BY CASE e.risk_level WHEN 'high' THEN 0 ELSE 1 END, e.completion_percent ASC`

	var rows []atRiskRow
	err := database.DB.Raw(q, args...).Scan(&rows).Error
	return rows, err
}

// markNudged records that a participant was nudged (for the given cohort).
func markNudged(userID, cohortID string) error {
	return database.DB.Exec(
		`UPDATE enrollments SET nudged_at = NOW() WHERE user_id = ?::uuid AND cohort_id = ?::uuid`,
		userID, cohortID,
	).Error
}

func listInAppNotifications(userID string) ([]InAppNotification, error) {
	var list []InAppNotification
	err := database.DB.Where("user_id = ?", userID).Order("created_at desc").Limit(50).Find(&list).Error
	return list, err
}

func markNotificationRead(id, userID string) error {
	now := time.Now()
	return database.DB.Model(&InAppNotification{}).
		Where("id = ? AND user_id = ?", id, userID).
		Update("read_at", now).Error
}

func markAllNotificationsRead(userID string) error {
	now := time.Now()
	return database.DB.Model(&InAppNotification{}).
		Where("user_id = ? AND read_at IS NULL", userID).
		Update("read_at", now).Error
}

// ── Notification Logs ────────────────────────────────────────────

func createLog(l *NotificationLog) error {
	return database.DB.Create(l).Error
}

func listLogs(orgID, campaignID, ruleID string, page, perPage int) ([]NotificationLog, int64, error) {
	var list []NotificationLog
	var total int64
	offset := (page - 1) * perPage
	q := database.DB.Model(&NotificationLog{}).Where("org_id = ?", orgID)
	if campaignID != "" {
		q = q.Where("campaign_id = ?", campaignID)
	}
	if ruleID != "" {
		q = q.Where("rule_id = ?", ruleID)
	}
	q.Count(&total)
	err := q.Order("sent_at desc").Offset(offset).Limit(perPage).Find(&list).Error
	return list, total, err
}

// recentLogExistsForRuleUser checks rate limiting — skip if already sent within 24h
func recentLogExistsForRuleUser(ruleID, userID string) (bool, error) {
	var count int64
	err := database.DB.Raw(`
		SELECT COUNT(*) FROM notification_logs
		WHERE rule_id = $1 AND user_id = $2 AND sent_at > NOW() - INTERVAL '24 hours'
	`, ruleID, userID).Scan(&count).Error
	return count > 0, err
}

// ── Audience queries ─────────────────────────────────────────────

type recipientRow struct {
	UserID        string
	Email         string
	Name          string
	RiskLevel     string
	CompletionPct float64
}

func getRecipients(cohortID, audience string) ([]recipientRow, error) {
	var rows []recipientRow
	baseQ := `
		SELECT u.id AS user_id, u.email, u.name,
		       COALESCE(e.risk_level, 'low') AS risk_level,
		       COALESCE(e.completion_percent, 0) AS completion_pct
		FROM enrollments e
		JOIN users u ON u.id = e.user_id
		WHERE e.cohort_id = $1 AND e.status = 'enrolled'
	`
	switch audience {
	case "at_risk":
		baseQ += ` AND e.risk_level = 'high'`
	case "incomplete":
		baseQ += ` AND COALESCE(e.completion_percent, 0) < 100`
	}
	err := database.DB.Raw(baseQ, cohortID).Scan(&rows).Error
	return rows, err
}

// getCohortMeta fetches cohort name and program title for variable substitution
type cohortMetaRow struct {
	CohortName   string
	ProgramTitle string
	OrgID        string
}

func getCohortMeta(cohortID string) (*cohortMetaRow, error) {
	var row cohortMetaRow
	err := database.DB.Raw(`
		SELECT c.name AS cohort_name, p.title AS program_title, c.org_id
		FROM cohorts c
		LEFT JOIN programs p ON p.id = c.program_id
		WHERE c.id = $1
	`, cohortID).Scan(&row).Error
	if row.CohortName == "" {
		return nil, fmt.Errorf("cohort not found")
	}
	return &row, err
}

// getDaysInactive returns days since last session for a user (0 if recent)
func getDaysInactive(userID string) int {
	var days int
	database.DB.Raw(`
		SELECT COALESCE(EXTRACT(DAY FROM NOW() - MAX(attended_at))::int, 999)
		FROM session_attendees
		WHERE user_id = $1
	`, userID).Scan(&days)
	return days
}

// ── Rule evaluator queries ───────────────────────────────────────

type ruleTargetRow struct {
	UserID        string
	Email         string
	Name          string
	OrgID         string
	CohortID      string
	CohortName    string
	ProgramTitle  string
	CompletionPct float64
	DaysInactive  int
}

func findNotLoggedInUsers(days int) ([]ruleTargetRow, error) {
	var rows []ruleTargetRow
	err := database.DB.Raw(`
		SELECT u.id AS user_id, u.email, u.name, e.cohort_id, c.name AS cohort_name,
		       COALESCE(p.title,'') AS program_title, c.org_id,
		       COALESCE(e.completion_percent,0) AS completion_pct,
		       COALESCE(EXTRACT(DAY FROM NOW() - MAX(sa.attended_at))::int, 999) AS days_inactive
		FROM enrollments e
		JOIN users u ON u.id = e.user_id
		JOIN cohorts c ON c.id = e.cohort_id
		LEFT JOIN programs p ON p.id = c.program_id
		LEFT JOIN session_attendees sa ON sa.user_id = u.id
		WHERE e.status = 'enrolled'
		GROUP BY u.id, u.email, u.name, e.cohort_id, c.name, p.title, c.org_id, e.completion_percent
		HAVING COALESCE(EXTRACT(DAY FROM NOW() - MAX(sa.attended_at))::int, 999) >= $1
	`, days).Scan(&rows).Error
	return rows, err
}

func findOverdueActivityUsers(days int) ([]ruleTargetRow, error) {
	var rows []ruleTargetRow
	err := database.DB.Raw(`
		SELECT DISTINCT u.id AS user_id, u.email, u.name, e.cohort_id, c.name AS cohort_name,
		       COALESCE(p.title,'') AS program_title, c.org_id,
		       COALESCE(e.completion_percent,0) AS completion_pct, 0 AS days_inactive
		FROM enrollments e
		JOIN users u ON u.id = e.user_id
		JOIN cohorts c ON c.id = e.cohort_id
		LEFT JOIN programs p ON p.id = c.program_id
		WHERE e.status = 'enrolled'
		  AND EXISTS (
		    SELECT 1 FROM activity_progress ap
		    WHERE ap.user_id = u.id
		      AND ap.status != 'completed'
		      AND ap.due_date < NOW() - ($1 || ' days')::INTERVAL
		  )
	`, days).Scan(&rows).Error
	return rows, err
}

func findCompletionBelowUsers(pct float64) ([]ruleTargetRow, error) {
	var rows []ruleTargetRow
	err := database.DB.Raw(`
		SELECT u.id AS user_id, u.email, u.name, e.cohort_id, c.name AS cohort_name,
		       COALESCE(p.title,'') AS program_title, c.org_id,
		       COALESCE(e.completion_percent,0) AS completion_pct, 0 AS days_inactive
		FROM enrollments e
		JOIN users u ON u.id = e.user_id
		JOIN cohorts c ON c.id = e.cohort_id
		LEFT JOIN programs p ON p.id = c.program_id
		WHERE e.status = 'enrolled' AND COALESCE(e.completion_percent,0) < $1
	`, pct).Scan(&rows).Error
	return rows, err
}

func findAssessmentFailedUsers() ([]ruleTargetRow, error) {
	var rows []ruleTargetRow
	err := database.DB.Raw(`
		SELECT DISTINCT u.id AS user_id, u.email, u.name, e.cohort_id, c.name AS cohort_name,
		       COALESCE(p.title,'') AS program_title, c.org_id,
		       COALESCE(e.completion_percent,0) AS completion_pct, 0 AS days_inactive
		FROM submissions s
		JOIN users u ON u.id = s.student_id
		JOIN enrollments e ON e.user_id = u.id
		JOIN cohorts c ON c.id = e.cohort_id
		LEFT JOIN programs p ON p.id = c.program_id
		WHERE s.score < 50 AND s.graded_at > NOW() - INTERVAL '24 hours'
		  AND e.status = 'enrolled'
	`).Scan(&rows).Error
	return rows, err
}

func findCohortStartsInNDays(days int) ([]ruleTargetRow, error) {
	var rows []ruleTargetRow
	err := database.DB.Raw(`
		SELECT u.id AS user_id, u.email, u.name, e.cohort_id, c.name AS cohort_name,
		       COALESCE(p.title,'') AS program_title, c.org_id,
		       0 AS completion_pct, 0 AS days_inactive
		FROM enrollments e
		JOIN users u ON u.id = e.user_id
		JOIN cohorts c ON c.id = e.cohort_id
		LEFT JOIN programs p ON p.id = c.program_id
		WHERE e.status = 'enrolled'
		  AND c.start_date::date = (CURRENT_DATE + ($1 || ' days')::INTERVAL)::date
	`, days).Scan(&rows).Error
	return rows, err
}

func findMilestoneUsers(dayX int) ([]ruleTargetRow, error) {
	var rows []ruleTargetRow
	err := database.DB.Raw(`
		SELECT u.id AS user_id, u.email, u.name, e.cohort_id, c.name AS cohort_name,
		       COALESCE(p.title,'') AS program_title, c.org_id,
		       COALESCE(e.completion_percent,0) AS completion_pct, 0 AS days_inactive
		FROM enrollments e
		JOIN users u ON u.id = e.user_id
		JOIN cohorts c ON c.id = e.cohort_id
		LEFT JOIN programs p ON p.id = c.program_id
		WHERE e.status = 'enrolled'
		  AND (CURRENT_DATE - c.start_date::date) = $1
	`, dayX).Scan(&rows).Error
	return rows, err
}

func findPhaseStartsToday() ([]ruleTargetRow, error) {
	var rows []ruleTargetRow
	err := database.DB.Raw(`
		SELECT DISTINCT u.id AS user_id, u.email, u.name, e.cohort_id, c.name AS cohort_name,
		       COALESCE(p.title,'') AS program_title, c.org_id,
		       COALESCE(e.completion_percent,0) AS completion_pct, 0 AS days_inactive
		FROM enrollments e
		JOIN users u ON u.id = e.user_id
		JOIN cohorts c ON c.id = e.cohort_id
		LEFT JOIN programs p ON p.id = c.program_id
		WHERE e.status = 'enrolled'
		  AND EXISTS (
		    SELECT 1 FROM cohort_phases cp
		    WHERE cp.cohort_id = c.id AND cp.start_date::date = CURRENT_DATE
		  )
	`).Scan(&rows).Error
	return rows, err
}

func findPhaseEndsInNDays(days int) ([]ruleTargetRow, error) {
	var rows []ruleTargetRow
	err := database.DB.Raw(`
		SELECT DISTINCT u.id AS user_id, u.email, u.name, e.cohort_id, c.name AS cohort_name,
		       COALESCE(p.title,'') AS program_title, c.org_id,
		       COALESCE(e.completion_percent,0) AS completion_pct, 0 AS days_inactive
		FROM enrollments e
		JOIN users u ON u.id = e.user_id
		JOIN cohorts c ON c.id = e.cohort_id
		LEFT JOIN programs p ON p.id = c.program_id
		WHERE e.status = 'enrolled'
		  AND EXISTS (
		    SELECT 1 FROM cohort_phases cp
		    WHERE cp.cohort_id = c.id AND cp.end_date::date = (CURRENT_DATE + ($1 || ' days')::INTERVAL)::date
		  )
	`, days).Scan(&rows).Error
	return rows, err
}

// parseTriggerConfig parses the JSONB trigger_config bytes into a map
func parseTriggerConfig(raw []byte) map[string]interface{} {
	var m map[string]interface{}
	if err := json.Unmarshal(raw, &m); err != nil {
		return map[string]interface{}{}
	}
	return m
}
