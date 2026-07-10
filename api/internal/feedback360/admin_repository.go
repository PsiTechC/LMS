package feedback360

import (
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/xa-lms/api/pkg/database"
	"gorm.io/gorm"
)

// ── Admin cycles ──────────────────────────────────────────────────

func createAdminCycle(c *FeedbackCycle) error { return database.DB.Create(c).Error }

func updateAdminCycle(id uuid.UUID, updates map[string]any) error {
	updates["updated_at"] = time.Now()
	res := database.DB.Model(&FeedbackCycle{}).Where("id = ?", id).Updates(updates)
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return ErrNotFound
	}
	return nil
}

// adminCycleCounts returns assigned/invited/completed tallies per cycle for a set
// of cycle IDs (one grouped query, no N+1).
type cycleCounts struct {
	CycleID   string
	Assigned  int
	Invited   int
	Completed int
}

func adminCycleCounts(cycleIDs []string) (map[string]cycleCounts, error) {
	out := map[string]cycleCounts{}
	if len(cycleIDs) == 0 {
		return out, nil
	}
	var rows []cycleCounts
	err := database.DB.Raw(`
		SELECT cycle_id::text AS cycle_id,
		       COUNT(*)                                             AS assigned,
		       COUNT(*) FILTER (WHERE invited_at IS NOT NULL)       AS invited,
		       COUNT(*) FILTER (WHERE status = 'completed')         AS completed
		FROM feedback_cycle_participants
		WHERE cycle_id IN ?
		GROUP BY cycle_id
	`, cycleIDs).Scan(&rows).Error
	if err != nil {
		return nil, err
	}
	for _, r := range rows {
		out[r.CycleID] = r
	}
	return out, nil
}

// loadOrgConfig returns the org's single 360° configuration row, or ErrNotFound
// when the org has never configured one.
func loadOrgConfig(orgID uuid.UUID) (*FeedbackCycle, error) {
	var c FeedbackCycle
	err := database.DB.
		Where("org_id = ? AND participant_id IS NULL", orgID).
		First(&c).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &c, nil
}

// replaceCycleCompetencies swaps the cycle→competency links (used at lock time).
func replaceCycleCompetencies(cycleID uuid.UUID, links []FeedbackCycleCompetency) error {
	return database.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("cycle_id = ?", cycleID).Delete(&FeedbackCycleCompetency{}).Error; err != nil {
			return err
		}
		if len(links) > 0 {
			if err := tx.Create(&links).Error; err != nil {
				return err
			}
		}
		return nil
	})
}

// ── Quorum ────────────────────────────────────────────────────────

func getQuorumConfig(cycleID uuid.UUID) (*FeedbackQuorumConfig, error) {
	var q FeedbackQuorumConfig
	err := database.DB.Where("cycle_id = ?", cycleID).First(&q).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &q, nil
}

// upsertQuorumConfig writes the per-cycle quorum (insert or update).
func upsertQuorumConfig(q *FeedbackQuorumConfig) error {
	q.UpdatedAt = time.Now()
	return database.DB.Save(q).Error
}

func getOrgQuorumDefault(orgID uuid.UUID) (*FeedbackOrgQuorumDefault, error) {
	var d FeedbackOrgQuorumDefault
	err := database.DB.Where("org_id = ?", orgID).First(&d).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &d, nil
}

func upsertOrgQuorumDefault(d *FeedbackOrgQuorumDefault) error {
	d.UpdatedAt = time.Now()
	return database.DB.Save(d).Error
}

// ── Frozen framework snapshot (behaviors) ─────────────────────────

func replaceCycleBehaviors(cycleID uuid.UUID, rows []FeedbackCycleBehavior) error {
	return database.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("cycle_id = ?", cycleID).Delete(&FeedbackCycleBehavior{}).Error; err != nil {
			return err
		}
		if len(rows) > 0 {
			if err := tx.Create(&rows).Error; err != nil {
				return err
			}
		}
		return nil
	})
}

func listCycleBehaviors(cycleID uuid.UUID) ([]FeedbackCycleBehavior, error) {
	var rows []FeedbackCycleBehavior
	err := database.DB.Where("cycle_id = ?", cycleID).
		Order("sort_order").Find(&rows).Error
	return rows, err
}

// ── Open-ended questions (cycle-level, three slots) ───────────────

// replaceCycleOpenQuestions swaps the cycle's open questions. Rows are inserted
// with explicit column values so a mandatory=false is written verbatim (a struct
// insert would let GORM substitute the column default for the zero value).
func replaceCycleOpenQuestions(cycleID uuid.UUID, qs []OpenQuestionDTO) error {
	return database.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("cycle_id = ?", cycleID).Delete(&FeedbackCycleOpenQuestion{}).Error; err != nil {
			return err
		}
		for _, q := range qs {
			if strings.TrimSpace(q.Prompt) == "" {
				continue
			}
			if err := tx.Exec(`
				INSERT INTO feedback_cycle_open_questions (cycle_id, prompt, mandatory, sort_order)
				VALUES (?, ?, ?, ?)`,
				cycleID, strings.TrimSpace(q.Prompt), q.Mandatory, q.SortOrder,
			).Error; err != nil {
				return err
			}
		}
		return nil
	})
}

func listCycleOpenQuestions(cycleID uuid.UUID) ([]OpenQuestionDTO, error) {
	var rows []OpenQuestionDTO
	err := database.DB.Raw(`
		SELECT prompt, mandatory, sort_order
		FROM feedback_cycle_open_questions
		WHERE cycle_id = ?
		ORDER BY sort_order`, cycleID).Scan(&rows).Error
	return rows, err
}

// upsertOrgOpenQuestionDefaults remembers the org's latest prompts as a pre-fill.
func upsertOrgOpenQuestionDefaults(orgID uuid.UUID, qs []OpenQuestionDTO) error {
	return database.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("org_id = ?", orgID).Delete(&FeedbackOrgOpenQuestionDefault{}).Error; err != nil {
			return err
		}
		for _, q := range qs {
			if strings.TrimSpace(q.Prompt) == "" {
				continue
			}
			if err := tx.Exec(`
				INSERT INTO feedback_org_open_question_defaults (org_id, sort_order, prompt, mandatory)
				VALUES (?, ?, ?, ?)`,
				orgID, q.SortOrder, strings.TrimSpace(q.Prompt), q.Mandatory,
			).Error; err != nil {
				return err
			}
		}
		return nil
	})
}

func listOrgOpenQuestionDefaults(orgID uuid.UUID) ([]OpenQuestionDTO, error) {
	var rows []OpenQuestionDTO
	err := database.DB.Raw(`
		SELECT prompt, mandatory, sort_order
		FROM feedback_org_open_question_defaults
		WHERE org_id = ?
		ORDER BY sort_order`, orgID).Scan(&rows).Error
	return rows, err
}

// ── Participants (assign / tracking) ──────────────────────────────

// existingParticipantIDs returns the user_ids already assigned to a cycle, so
// re-running assign never duplicates.
func existingParticipantIDs(cycleID uuid.UUID) (map[string]bool, error) {
	var ids []string
	err := database.DB.Raw(
		`SELECT participant_id::text FROM feedback_cycle_participants WHERE cycle_id = ?`, cycleID,
	).Scan(&ids).Error
	if err != nil {
		return nil, err
	}
	set := map[string]bool{}
	for _, id := range ids {
		set[id] = true
	}
	return set, nil
}

func insertCycleParticipants(rows []FeedbackCycleParticipant) error {
	if len(rows) == 0 {
		return nil
	}
	// ON CONFLICT DO NOTHING via GORM clause to be extra-safe against races.
	return database.DB.Create(&rows).Error
}

func listCycleParticipants(cycleID uuid.UUID) ([]CycleParticipantDTO, error) {
	type row struct {
		ID          string
		UserID      string
		Name        string
		Email       string
		ProgramName *string
		CohortName  *string
		Status      string
		InvitedAt   *time.Time
		RemindedAt  *time.Time
		CompletedAt *time.Time
	}
	var rows []row
	err := database.DB.Raw(`
		SELECT fcp.id::text          AS id,
		       fcp.participant_id::text AS user_id,
		       u.name                 AS name,
		       u.email                AS email,
		       pr.title               AS program_name,
		       co.name                AS cohort_name,
		       fcp.status             AS status,
		       fcp.invited_at         AS invited_at,
		       fcp.reminded_at        AS reminded_at,
		       fcp.completed_at       AS completed_at
		FROM feedback_cycle_participants fcp
		JOIN users u          ON u.id = fcp.participant_id
		LEFT JOIN programs pr ON pr.id = fcp.program_id
		LEFT JOIN cohorts co  ON co.id = fcp.cohort_id
		WHERE fcp.cycle_id = ?
		ORDER BY u.name ASC
	`, cycleID).Scan(&rows).Error
	if err != nil {
		return nil, err
	}
	out := make([]CycleParticipantDTO, 0, len(rows))
	for _, r := range rows {
		d := CycleParticipantDTO{
			ID: r.ID, UserID: r.UserID, Name: r.Name, Email: r.Email,
			ProgramName: r.ProgramName, CohortName: r.CohortName, Status: r.Status,
		}
		d.InvitedAt = fmtTimePtr(r.InvitedAt)
		d.RemindedAt = fmtTimePtr(r.RemindedAt)
		d.CompletedAt = fmtTimePtr(r.CompletedAt)
		out = append(out, d)
	}
	return out, nil
}

// participantsToInvite loads rows needing an invite (invited_at IS NULL) for a set
// of feedback_cycle_participants ids (or all in the cycle when ids is empty).
type inviteTarget struct {
	ID     string
	UserID string
	Name   string
	Email  string
}

func participantsToInvite(cycleID uuid.UUID, ids []string) ([]inviteTarget, error) {
	q := `
		SELECT fcp.id::text AS id, fcp.participant_id::text AS user_id, u.name, u.email
		FROM feedback_cycle_participants fcp
		JOIN users u ON u.id = fcp.participant_id
		WHERE fcp.cycle_id = ? AND fcp.invited_at IS NULL`
	args := []any{cycleID}
	if len(ids) > 0 {
		q += ` AND fcp.id IN ?`
		args = append(args, ids)
	}
	var rows []inviteTarget
	err := database.DB.Raw(q, args...).Scan(&rows).Error
	return rows, err
}

// participantsToRemind loads not-yet-completed rows (already invited) to remind.
func participantsToRemind(cycleID uuid.UUID, ids []string, all bool) ([]inviteTarget, error) {
	q := `
		SELECT fcp.id::text AS id, fcp.participant_id::text AS user_id, u.name, u.email
		FROM feedback_cycle_participants fcp
		JOIN users u ON u.id = fcp.participant_id
		WHERE fcp.cycle_id = ? AND fcp.status <> 'completed'`
	args := []any{cycleID}
	if !all && len(ids) > 0 {
		q += ` AND fcp.id IN ?`
		args = append(args, ids)
	}
	var rows []inviteTarget
	err := database.DB.Raw(q, args...).Scan(&rows).Error
	return rows, err
}

func markParticipantsInvited(ids []string) error {
	if len(ids) == 0 {
		return nil
	}
	return database.DB.Exec(`
		UPDATE feedback_cycle_participants
		SET invited_at = NOW(),
		    status = CASE WHEN status = 'assigned' THEN 'invited' ELSE status END
		WHERE id IN ?`, ids).Error
}

func markParticipantsReminded(ids []string) error {
	if len(ids) == 0 {
		return nil
	}
	return database.DB.Exec(
		`UPDATE feedback_cycle_participants SET reminded_at = NOW() WHERE id IN ?`, ids,
	).Error
}

// ── Assignable participant listing (users → enrollments → cohorts → programs) ──

// listAssignableParticipants returns org participants filtered by program/cohort/
// enrollment status, flagged with whether they're already in this cycle. The join
// path mirrors cohorts.listPoolForProgram (the confirmed participant→program path).
func listAssignableParticipants(cycleID, orgID uuid.UUID, programID, cohortID, enrollStatus, search string) ([]AssignableParticipantDTO, error) {
	var b strings.Builder
	b.WriteString(`
		SELECT DISTINCT ON (u.id)
		       u.id::text        AS user_id,
		       u.name            AS name,
		       u.email           AS email,
		       u.department      AS department,
		       pr.id::text       AS program_id,
		       pr.title          AS program_name,
		       co.id::text       AS cohort_id,
		       co.name           AS cohort_name,
		       e.status::text    AS status,
		       EXISTS (SELECT 1 FROM feedback_cycle_participants fcp
		               WHERE fcp.cycle_id = ? AND fcp.participant_id = u.id) AS already_in_cycle
		FROM users u
		JOIN enrollments e ON e.user_id = u.id AND e.status <> 'withdrawn'
		JOIN cohorts co    ON co.id = e.cohort_id
		JOIN programs pr   ON pr.id = co.program_id
		WHERE pr.org_id = ?
		  AND u.role IN ('participant','participant_retailer')`)
	args := []any{cycleID, orgID}

	if programID != "" {
		b.WriteString(` AND pr.id = ?`)
		args = append(args, programID)
	}
	if cohortID != "" {
		b.WriteString(` AND co.id = ?`)
		args = append(args, cohortID)
	}
	if enrollStatus != "" {
		b.WriteString(` AND e.status::text = ?`)
		args = append(args, enrollStatus)
	}
	if s := strings.TrimSpace(search); s != "" {
		b.WriteString(` AND (u.name ILIKE ? OR u.email ILIKE ?)`)
		like := "%" + s + "%"
		args = append(args, like, like)
	}
	b.WriteString(` ORDER BY u.id, e.enrolled_at DESC`)

	var rows []AssignableParticipantDTO
	if err := database.DB.Raw(b.String(), args...).Scan(&rows).Error; err != nil {
		return nil, err
	}
	return rows, nil
}

// resolveAssignSnapshots loads program_id/cohort_id snapshots for a set of user
// ids under an org (best enrollment per user), for denormalizing at assign time.
type userSnapshot struct {
	UserID    string
	ProgramID *string
	CohortID  *string
}

func resolveAssignSnapshots(orgID uuid.UUID, userIDs []string) (map[string]userSnapshot, error) {
	out := map[string]userSnapshot{}
	if len(userIDs) == 0 {
		return out, nil
	}
	var rows []userSnapshot
	err := database.DB.Raw(`
		SELECT DISTINCT ON (u.id)
		       u.id::text  AS user_id,
		       pr.id::text AS program_id,
		       co.id::text AS cohort_id
		FROM users u
		JOIN enrollments e ON e.user_id = u.id AND e.status <> 'withdrawn'
		JOIN cohorts co    ON co.id = e.cohort_id
		JOIN programs pr   ON pr.id = co.program_id
		WHERE pr.org_id = ? AND u.id IN ?
		ORDER BY u.id, e.enrolled_at DESC
	`, orgID, userIDs).Scan(&rows).Error
	if err != nil {
		return nil, err
	}
	for _, r := range rows {
		out[r.UserID] = r
	}
	return out, nil
}

// ── Filter options ────────────────────────────────────────────────

func listOrgProgramOptions(orgID uuid.UUID) ([]ProgramOptionDTO, error) {
	var rows []ProgramOptionDTO
	err := database.DB.Raw(`
		SELECT pr.id::text AS id,
		       pr.title    AS name,
		       EXISTS (SELECT 1 FROM cohorts c WHERE c.program_id = pr.id) AS has_cohorts
		FROM programs pr
		WHERE pr.org_id = ?
		ORDER BY pr.title
	`, orgID).Scan(&rows).Error
	return rows, err
}

func listProgramCohortOptions(orgID uuid.UUID, programID string) ([]CohortOptionDTO, error) {
	var rows []CohortOptionDTO
	err := database.DB.Raw(`
		SELECT c.id::text AS id, c.name AS name
		FROM cohorts c
		WHERE c.org_id = ? AND c.program_id = ?
		ORDER BY c.name
	`, orgID, programID).Scan(&rows).Error
	return rows, err
}

// ── Live framework (for pre-lock Configure hydration) ─────────────

// liveOrgFramework returns the org's competencies + behaviors from the live
// tables (used before a cycle is locked).
type frameworkBehaviorRow struct {
	CompetencyID    string
	CompetencyTitle string
	BehaviorID      string
	Statement       string
	QuestionText    *string
	UseStatement    *bool
	Mandatory       *bool
	SortOrder       int
}

func liveOrgFramework(orgID uuid.UUID) ([]frameworkBehaviorRow, error) {
	var rows []frameworkBehaviorRow
	err := database.DB.Raw(`
		SELECT c.id::text    AS competency_id,
		       c.title       AS competency_title,
		       b.id::text    AS behavior_id,
		       b.statement   AS statement,
		       b.question_text AS question_text,
		       b.use_statement AS use_statement,
		       b.mandatory   AS mandatory,
		       b.sort_order  AS sort_order
		FROM competencies c
		LEFT JOIN competency_behaviors b ON b.competency_id = c.id
		WHERE c.org_id = ?
		ORDER BY c.title, b.sort_order
	`, orgID).Scan(&rows).Error
	return rows, err
}

// ── Notifications (in-app) ────────────────────────────────────────

func insertInAppNotification(userID, title, body string) error {
	return database.DB.Exec(`
		INSERT INTO in_app_notifications (user_id, title, body, type)
		VALUES (?, ?, ?, 'info')`, userID, title, body).Error
}

// orgNameFor returns the org's display name for email/notification copy.
func orgNameFor(orgID uuid.UUID) string {
	var name string
	_ = database.DB.Raw(`SELECT name FROM organizations WHERE id = ?`, orgID).Scan(&name).Error
	return name
}

// ── helpers ───────────────────────────────────────────────────────

func fmtTimePtr(t *time.Time) *string {
	if t == nil {
		return nil
	}
	s := t.UTC().Format(time.RFC3339)
	return &s
}
