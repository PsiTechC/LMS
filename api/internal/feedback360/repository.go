package feedback360

import (
	"errors"

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

// latestCycleForParticipant returns the participant's most recent cycle (the
// participant surface shows one active cycle at a time, like the reference UI).
func latestCycleForParticipant(participantID uuid.UUID) (*FeedbackCycle, error) {
	var c FeedbackCycle
	err := database.DB.
		Where("participant_id = ?", participantID).
		Order("created_at DESC").
		First(&c).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &c, nil
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

func aggregateScores(cycleID uuid.UUID) ([]scoreRow, error) {
	var raw []scoreRowRaw
	err := database.DB.Raw(`
		SELECT
			resp.competency_id::text AS competency_id,
			AVG(resp.score) FILTER (WHERE r.relationship = 'self')  AS self_score,
			AVG(resp.score) FILTER (WHERE r.relationship <> 'self') AS others_score
		FROM feedback_responses resp
		JOIN feedback_raters r ON r.id = resp.rater_id
		WHERE r.cycle_id = ?
		GROUP BY resp.competency_id
	`, cycleID).Scan(&raw).Error
	if err != nil {
		return nil, err
	}
	rows := make([]scoreRow, 0, len(raw))
	for _, r := range raw {
		id, _ := uuid.Parse(r.CompetencyID)
		rows = append(rows, scoreRow{CompetencyID: id, SelfScore: r.SelfScore, OthersScore: r.OthersScore})
	}
	return rows, nil
}
