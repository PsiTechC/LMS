package feedback360

import (
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/xa-lms/api/pkg/database"
	"gorm.io/gorm"
)

var ErrNotFound = errors.New("feedback cycle not found")

// ── Cycles ────────────────────────────────────────────────────────

func createCycle(c *FeedbackCycle) error { return database.DB.Create(c).Error }

func getCycleByID(id uuid.UUID) (*FeedbackCycle, error) {
	var c FeedbackCycle
	if err := database.DB.Where("id = ?", id).First(&c).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &c, nil
}

// latestCycleForParticipant returns the cycle a participant should see.
//
// 360° cycles are now admin-initiated: the participant's cycle is the most
// recent one they were ASSIGNED to (a row in feedback_cycle_participants on a
// live cycle). Legacy self-initiated cycles (feedback_cycles.participant_id set)
// are still honoured as a fallback so historical data stays reachable.
//
// programID (from the program switcher) narrows the assignment when the
// participant was assigned under that program.
func latestCycleForParticipant(participantID uuid.UUID, programID *uuid.UUID) (*FeedbackCycle, error) {
	// 1. Assigned admin cycle (preferred).
	q := `
		SELECT fc.*
		FROM feedback_cycles fc
		JOIN feedback_cycle_participants fcp ON fcp.cycle_id = fc.id
		WHERE fcp.participant_id = ?
		  AND fc.status IN ('locked','active','completed')`
	args := []any{participantID}
	if programID != nil {
		q += ` AND fcp.program_id = ?`
		args = append(args, *programID)
	}
	q += ` ORDER BY fcp.added_at DESC LIMIT 1`

	var c FeedbackCycle
	if err := database.DB.Raw(q, args...).Scan(&c).Error; err == nil && c.ID != uuid.Nil {
		return &c, nil
	}
	// Retry without the program filter before falling back to legacy.
	if programID != nil {
		var c2 FeedbackCycle
		if err := database.DB.Raw(`
			SELECT fc.* FROM feedback_cycles fc
			JOIN feedback_cycle_participants fcp ON fcp.cycle_id = fc.id
			WHERE fcp.participant_id = ? AND fc.status IN ('locked','active','completed')
			ORDER BY fcp.added_at DESC LIMIT 1`, participantID).Scan(&c2).Error; err == nil && c2.ID != uuid.Nil {
			return &c2, nil
		}
	}

	// 2. Legacy self-initiated cycle.
	var legacy FeedbackCycle
	err := database.DB.
		Where("participant_id = ?", participantID).
		Order("created_at DESC").
		First(&legacy).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &legacy, nil
}

func updateCycleSummary(cycleID uuid.UUID, summary string) error {
	return database.DB.Model(&FeedbackCycle{}).Where("id = ?", cycleID).
		Update("ai_summary", summary).Error
}

// ── Cycle competencies ────────────────────────────────────────────

func addCycleCompetencies(links []FeedbackCycleCompetency) error {
	if len(links) == 0 {
		return nil
	}
	return database.DB.Create(&links).Error
}

// cycleCompetencies returns the competencies rated by a cycle, joined to titles.
func cycleCompetencies(cycleID uuid.UUID) ([]competencyRow, error) {
	var raw []competencyRowRaw
	err := database.DB.Raw(`
		SELECT c.id::text AS competency_id, c.title, COALESCE(c.description,'') AS description
		FROM feedback_cycle_competencies fcc
		JOIN competencies c ON c.id = fcc.competency_id
		WHERE fcc.cycle_id = ?
		ORDER BY fcc.sort_order, c.title
	`, cycleID).Scan(&raw).Error
	if err != nil {
		return nil, err
	}
	rows := make([]competencyRow, 0, len(raw))
	for _, r := range raw {
		id, _ := uuid.Parse(r.CompetencyID)
		rows = append(rows, competencyRow{CompetencyID: id, Title: r.Title, Description: r.Description})
	}
	return rows, nil
}

type competencyRowRaw struct {
	CompetencyID string
	Title        string
	Description  string
}

type competencyRow struct {
	CompetencyID uuid.UUID
	Title        string
	Description  string
}

// orgCompetencyIDs lists all competencies for an org (used to seed a cycle when
// the caller doesn't specify a subset).
func orgCompetencyIDs(orgID uuid.UUID) ([]uuid.UUID, error) {
	var raw []string
	if err := database.DB.Raw(`SELECT id::text FROM competencies WHERE org_id = ? ORDER BY title`, orgID).Scan(&raw).Error; err != nil {
		return nil, err
	}
	ids := make([]uuid.UUID, 0, len(raw))
	for _, s := range raw {
		if id, err := uuid.Parse(s); err == nil {
			ids = append(ids, id)
		}
	}
	return ids, nil
}

// orgIDForUser returns the user's primary org membership (participants don't
// carry org_id in their JWT).
func orgIDForUser(userID uuid.UUID) (uuid.UUID, error) {
	var raw string
	err := database.DB.Raw(`SELECT org_id::text FROM org_members WHERE user_id = ? LIMIT 1`, userID).Scan(&raw).Error
	if err != nil {
		return uuid.Nil, err
	}
	if raw == "" {
		return uuid.Nil, ErrNotFound
	}
	return uuid.Parse(raw)
}

// participantFirstName returns the participant's first name for the rater form
// (raters see only the first name — participant identity is minimal to raters).
func participantFirstName(userID uuid.UUID) (string, error) {
	var name string
	if err := database.DB.Raw(`SELECT name FROM users WHERE id = ?`, userID).Scan(&name).Error; err != nil {
		return "", err
	}
	if i := indexByte(name, ' '); i > 0 {
		return name[:i], nil
	}
	return name, nil
}

func indexByte(s string, b byte) int {
	for i := 0; i < len(s); i++ {
		if s[i] == b {
			return i
		}
	}
	return -1
}

// ── Raters ────────────────────────────────────────────────────────

func createRater(r *FeedbackRater) error { return database.DB.Create(r).Error }

// createRaters bulk-inserts self raters seeded on admin-flow assignment.
func createRaters(rows []FeedbackRater) error {
	if len(rows) == 0 {
		return nil
	}
	return database.DB.Create(&rows).Error
}

func getRaterByID(id uuid.UUID) (*FeedbackRater, error) {
	var r FeedbackRater
	if err := database.DB.Where("id = ?", id).First(&r).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &r, nil
}

func getRaterByToken(token uuid.UUID) (*FeedbackRater, error) {
	var r FeedbackRater
	if err := database.DB.Where("invite_token = ?", token).First(&r).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &r, nil
}

func listRaters(cycleID uuid.UUID) ([]FeedbackRater, error) {
	var rows []FeedbackRater
	err := database.DB.Where("cycle_id = ?", cycleID).Order("created_at").Find(&rows).Error
	return rows, err
}

func deleteRater(id uuid.UUID) error {
	return database.DB.Where("id = ?", id).Delete(&FeedbackRater{}).Error
}

func markRaterReminded(id uuid.UUID) error {
	return database.DB.Model(&FeedbackRater{}).Where("id = ?", id).
		Update("reminded_at", gorm.Expr("NOW()")).Error
}

func markRaterSubmitted(id uuid.UUID) error {
	return database.DB.Model(&FeedbackRater{}).Where("id = ?", id).
		Updates(map[string]any{"status": "submitted", "submitted_at": gorm.Expr("NOW()")}).Error
}

// ── Responses ─────────────────────────────────────────────────────

func replaceRaterResponses(raterID uuid.UUID, responses []FeedbackResponse) error {
	return database.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("rater_id = ?", raterID).Delete(&FeedbackResponse{}).Error; err != nil {
			return err
		}
		if len(responses) > 0 {
			if err := tx.Create(&responses).Error; err != nil {
				return err
			}
		}
		return nil
	})
}

// scoreRow aggregates self vs others average score per competency for a cycle.
type scoreRow struct {
	CompetencyID uuid.UUID
	SelfScore    *float64
	OthersScore  *float64
}

type scoreRowRaw struct {
	CompetencyID string
	SelfScore    *float64
	OthersScore  *float64
}

// aggregateScores rolls a cycle's ratings up to one self/others average per
// competency, for a single participant's rater panel.
//
// Two sources are unioned so both flows report correctly:
//   - feedback_behavior_responses (admin cycles) — the real unit is the behavior
//     statement, so a competency score is the average of its behaviors.
//     not_observed rows carry a NULL score and AVG() skips them, which is exactly
//     right: "unable to rate" must not drag an average toward zero.
//   - feedback_responses (legacy self-initiated cycles) — already per-competency.
//
// participantID scopes to that person's raters; pass uuid.Nil for legacy cycles
// where every rater on the cycle belongs to the single owner.
func aggregateScores(cycleID uuid.UUID, participantID uuid.UUID) ([]scoreRow, error) {
	scope := ""
	args := []any{cycleID}
	if participantID != uuid.Nil {
		scope = " AND r.participant_id = ?"
		args = append(args, participantID)
	}

	var raw []scoreRowRaw
	q := `
		WITH unified AS (
			SELECT br.competency_id, br.score, r.relationship
			FROM feedback_behavior_responses br
			JOIN feedback_raters r ON r.id = br.rater_id
			WHERE r.cycle_id = ?` + scope + `
			UNION ALL
			SELECT resp.competency_id, resp.score, r.relationship
			FROM feedback_responses resp
			JOIN feedback_raters r ON r.id = resp.rater_id
			WHERE r.cycle_id = ?` + scope + `
		)
		SELECT competency_id::text AS competency_id,
		       AVG(score) FILTER (WHERE relationship = 'self')  AS self_score,
		       AVG(score) FILTER (WHERE relationship <> 'self') AS others_score
		FROM unified
		GROUP BY competency_id`

	// The CTE embeds the scope twice, so the args repeat.
	all := append(append([]any{}, args...), args...)
	if err := database.DB.Raw(q, all...).Scan(&raw).Error; err != nil {
		return nil, err
	}
	rows := make([]scoreRow, 0, len(raw))
	for _, r := range raw {
		id, _ := uuid.Parse(r.CompetencyID)
		rows = append(rows, scoreRow{CompetencyID: id, SelfScore: r.SelfScore, OthersScore: r.OthersScore})
	}
	return rows, nil
}

// ── PDF report data (participant self-serve, admin-cycle only) ────

// behaviorGroupRow is one behavior statement's ratings from one relationship
// group, for the report's per-behavior breakdown ("rating distribution").
type behaviorGroupRow struct {
	CompetencyID    string
	CompetencyTitle string
	BehaviorID      string
	Statement       string
	SortOrder       int
	Relationship    string
	Avg             *float64
	Min             *float64
	Max             *float64
	Submitted       int // raters in this group who answered (not not_observed)
	Nominated       int // raters in this group nominated total (for missing %)
}

// reportBehaviorBreakdown returns one row per (behavior, relationship group)
// with that group's average/min/max/submitted count, for a single participant's
// panel on an admin-initiated cycle. Missing % is derived client-side from
// Submitted vs Nominated. not_observed rows are excluded from avg/min/max (same
// rule as aggregateScores) but the rater still counts toward Nominated.
func reportBehaviorBreakdown(cycleID, participantID uuid.UUID) ([]behaviorGroupRow, error) {
	var rows []behaviorGroupRow
	err := database.DB.Raw(`
		WITH panel AS (
			SELECT id, relationship FROM feedback_raters
			WHERE cycle_id = ? AND participant_id = ?
		)
		SELECT
			cb.competency_id::text    AS competency_id,
			cb.competency_title       AS competency_title,
			cb.id::text               AS behavior_id,
			cb.statement              AS statement,
			cb.sort_order             AS sort_order,
			p.relationship            AS relationship,
			AVG(br.score) FILTER (WHERE br.score IS NOT NULL)  AS avg,
			MIN(br.score) FILTER (WHERE br.score IS NOT NULL)  AS min,
			MAX(br.score) FILTER (WHERE br.score IS NOT NULL)  AS max,
			COUNT(br.id) FILTER (WHERE br.score IS NOT NULL)   AS submitted,
			COUNT(DISTINCT p.id)                                AS nominated
		FROM feedback_cycle_behaviors cb
		JOIN panel p ON true
		LEFT JOIN feedback_behavior_responses br
			ON br.cycle_behavior_id = cb.id AND br.rater_id = p.id
		WHERE cb.cycle_id = ?
		GROUP BY cb.competency_id, cb.competency_title, cb.id, cb.statement, cb.sort_order, p.relationship
		ORDER BY cb.sort_order`, cycleID, participantID, cycleID).Scan(&rows).Error
	return rows, err
}

// ── Admin aggregate (superadmin cross-org, completed cycles) ──────

// adminCycleRow is one completed (closed) cycle with participant/org/program.
type adminCycleRow struct {
	CycleID     string
	Title       string
	CycleType   string
	Participant string
	Org         string
	OrgID       string
	Program     string
	CompletedAt time.Time
}

// listAdminClosedCycles returns every closed cycle (optionally one org), newest
// first. Only status='closed' counts as a completed 360.
func listAdminClosedCycles(orgID string) ([]adminCycleRow, error) {
	q := `
		SELECT fc.id::text            AS cycle_id,
		       fc.title               AS title,
		       fc.cycle_type          AS cycle_type,
		       u.name                 AS participant,
		       o.name                 AS org,
		       o.id::text             AS org_id,
		       COALESCE(pr.title, '') AS program,
		       fc.updated_at          AS completed_at
		FROM feedback_cycles fc
		JOIN users u          ON u.id = fc.participant_id
		JOIN organizations o  ON o.id = fc.org_id
		LEFT JOIN programs pr ON pr.id = fc.program_id
		WHERE fc.status = 'closed'`
	args := []any{}
	if orgID != "" {
		q += ` AND fc.org_id = ?::uuid`
		args = append(args, orgID)
	}
	q += ` ORDER BY fc.updated_at DESC`

	var rows []adminCycleRow
	err := database.DB.Raw(q, args...).Scan(&rows).Error
	return rows, err
}

// cycleRelScore is one (cycle, relationship) average, for the score breakdown.
type cycleRelScore struct {
	CycleID      string
	Relationship string
	Avg          float64
}

// adminRelationshipScores returns per-cycle average scores grouped by rater
// relationship (self/manager/peer/direct_report/…) across closed cycles.
func adminRelationshipScores(orgID string) ([]cycleRelScore, error) {
	q := `
		SELECT r.cycle_id::text AS cycle_id, r.relationship AS relationship, AVG(resp.score) AS avg
		FROM feedback_responses resp
		JOIN feedback_raters r  ON r.id = resp.rater_id
		JOIN feedback_cycles fc ON fc.id = r.cycle_id
		WHERE fc.status = 'closed'`
	args := []any{}
	if orgID != "" {
		q += ` AND fc.org_id = ?::uuid`
		args = append(args, orgID)
	}
	q += ` GROUP BY r.cycle_id, r.relationship`

	var rows []cycleRelScore
	err := database.DB.Raw(q, args...).Scan(&rows).Error
	return rows, err
}

// cycleOverall is one cycle's overall others-rated average (excludes self).
type cycleOverall struct {
	CycleID string
	Avg     *float64
}

// adminOverallScores returns the overall 360 score per closed cycle — the
// average of all NON-self responses (the rating others give the participant).
func adminOverallScores(orgID string) ([]cycleOverall, error) {
	q := `
		SELECT r.cycle_id::text AS cycle_id, AVG(resp.score) AS avg
		FROM feedback_responses resp
		JOIN feedback_raters r  ON r.id = resp.rater_id
		JOIN feedback_cycles fc ON fc.id = r.cycle_id
		WHERE fc.status = 'closed' AND r.relationship <> 'self'`
	args := []any{}
	if orgID != "" {
		q += ` AND fc.org_id = ?::uuid`
		args = append(args, orgID)
	}
	q += ` GROUP BY r.cycle_id`

	var rows []cycleOverall
	err := database.DB.Raw(q, args...).Scan(&rows).Error
	return rows, err
}

// cycleCompScore is one (cycle, competency) average score.
type cycleCompScore struct {
	CycleID      string
	CompetencyID string
	Title        string
	Avg          float64
}

// adminCompetencyScores returns per-cycle per-competency average scores (across
// all raters) for closed cycles, joined to competency titles.
func adminCompetencyScores(orgID string) ([]cycleCompScore, error) {
	q := `
		SELECT r.cycle_id::text AS cycle_id, c.id::text AS competency_id, c.title AS title, AVG(resp.score) AS avg
		FROM feedback_responses resp
		JOIN feedback_raters r  ON r.id = resp.rater_id
		JOIN feedback_cycles fc ON fc.id = r.cycle_id
		JOIN competencies c     ON c.id = resp.competency_id
		WHERE fc.status = 'closed'`
	args := []any{}
	if orgID != "" {
		q += ` AND fc.org_id = ?::uuid`
		args = append(args, orgID)
	}
	q += ` GROUP BY r.cycle_id, c.id, c.title ORDER BY c.title`

	var rows []cycleCompScore
	err := database.DB.Raw(q, args...).Scan(&rows).Error
	return rows, err
}
