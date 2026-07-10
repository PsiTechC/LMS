package feedback360

import (
	"time"

	"github.com/google/uuid"
	"github.com/xa-lms/api/pkg/database"
	"gorm.io/gorm"
)

// Queries backing the public rater form. Everything reads the cycle's FROZEN
// snapshot (feedback_cycle_behaviors / feedback_cycle_open_questions), never the
// org's live framework.

// snapshotBehaviorRow is one behavior question a rater must answer.
type snapshotBehaviorRow struct {
	BehaviorID      string
	CompetencyID    string
	CompetencyTitle string
	Statement       string
	Mandatory       bool
	SortOrder       int
}

func cycleSnapshotBehaviors(cycleID uuid.UUID) ([]snapshotBehaviorRow, error) {
	var rows []snapshotBehaviorRow
	err := database.DB.Raw(`
		SELECT id::text            AS behavior_id,
		       competency_id::text AS competency_id,
		       competency_title,
		       statement,
		       mandatory,
		       sort_order
		FROM feedback_cycle_behaviors
		WHERE cycle_id = ?
		ORDER BY sort_order`, cycleID).Scan(&rows).Error
	return rows, err
}

type snapshotOpenQuestionRow struct {
	QuestionID string
	Prompt     string
	Mandatory  bool
	SortOrder  int
}

func cycleSnapshotOpenQuestions(cycleID uuid.UUID) ([]snapshotOpenQuestionRow, error) {
	var rows []snapshotOpenQuestionRow
	err := database.DB.Raw(`
		SELECT id::text AS question_id, prompt, mandatory, sort_order
		FROM feedback_cycle_open_questions
		WHERE cycle_id = ?
		ORDER BY sort_order`, cycleID).Scan(&rows).Error
	return rows, err
}

// validBehaviorIDs returns the set of behavior ids belonging to a cycle, so a
// submission can't smuggle in ids from another cycle.
func validBehaviorIDs(cycleID uuid.UUID) (map[string]string, error) {
	type row struct{ ID, CompetencyID string }
	var rows []row
	err := database.DB.Raw(
		`SELECT id::text AS id, competency_id::text AS competency_id
		 FROM feedback_cycle_behaviors WHERE cycle_id = ?`, cycleID).Scan(&rows).Error
	if err != nil {
		return nil, err
	}
	out := make(map[string]string, len(rows))
	for _, r := range rows {
		out[r.ID] = r.CompetencyID
	}
	return out, nil
}

func validOpenQuestionIDs(cycleID uuid.UUID) (map[string]bool, error) {
	var ids []string
	err := database.DB.Raw(
		`SELECT id::text FROM feedback_cycle_open_questions WHERE cycle_id = ?`, cycleID).Scan(&ids).Error
	if err != nil {
		return nil, err
	}
	out := make(map[string]bool, len(ids))
	for _, id := range ids {
		out[id] = true
	}
	return out, nil
}

// saveRaterSubmission writes the rater's behavior + open answers and marks them
// submitted, atomically. Re-running replaces any prior partial rows.
func saveRaterSubmission(
	raterID uuid.UUID,
	behaviors []FeedbackBehaviorResponse,
	opens []FeedbackOpenResponse,
) error {
	return database.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("rater_id = ?", raterID).Delete(&FeedbackBehaviorResponse{}).Error; err != nil {
			return err
		}
		if err := tx.Where("rater_id = ?", raterID).Delete(&FeedbackOpenResponse{}).Error; err != nil {
			return err
		}
		// Insert with explicit columns: a struct insert would let GORM substitute
		// the column default for not_observed=false and drop NULL scores.
		for _, b := range behaviors {
			if err := tx.Exec(`
				INSERT INTO feedback_behavior_responses
					(rater_id, cycle_behavior_id, competency_id, score, importance, not_observed)
				VALUES (?, ?, ?, ?, ?, ?)`,
				b.RaterID, b.CycleBehaviorID, b.CompetencyID, b.Score, b.Importance, b.NotObserved,
			).Error; err != nil {
				return err
			}
		}
		for _, o := range opens {
			if err := tx.Exec(`
				INSERT INTO feedback_open_responses (rater_id, open_question_id, answer_text)
				VALUES (?, ?, ?)`,
				o.RaterID, o.OpenQuestionID, o.AnswerText,
			).Error; err != nil {
				return err
			}
		}
		// Only NOW is the token consumed — never on view.
		return tx.Model(&FeedbackRater{}).Where("id = ?", raterID).
			Updates(map[string]any{"status": "submitted", "submitted_at": time.Now()}).Error
	})
}

// participantFirstNameFor returns a participant's first name for the rater form.
func participantFirstNameFor(userID uuid.UUID) string {
	var name string
	_ = database.DB.Raw(`SELECT name FROM users WHERE id = ?`, userID).Scan(&name).Error
	for i := 0; i < len(name); i++ {
		if name[i] == ' ' {
			return name[:i]
		}
	}
	return name
}

// participantAssignedTo reports whether a participant was assigned to a cycle.
func participantAssignedTo(cycleID, participantID uuid.UUID) (bool, error) {
	var n int64
	err := database.DB.Raw(
		`SELECT COUNT(*) FROM feedback_cycle_participants WHERE cycle_id = ? AND participant_id = ?`,
		cycleID, participantID,
	).Scan(&n).Error
	return n > 0, err
}

// ── Rater CRUD scoped to (cycle, participant) ─────────────────────

func listRatersFor(cycleID uuid.UUID, participantID uuid.UUID) ([]FeedbackRater, error) {
	var rows []FeedbackRater
	err := database.DB.
		Where("cycle_id = ? AND participant_id = ?", cycleID, participantID).
		Order("created_at").Find(&rows).Error
	return rows, err
}
