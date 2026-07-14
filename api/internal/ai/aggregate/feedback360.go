package aggregate

import (
	"fmt"
	"strings"

	"github.com/google/uuid"
	"github.com/xa-lms/api/internal/ai/scope"
	"github.com/xa-lms/api/pkg/database"
)

// feedback360NarrativeMetrics assembles one participant's 360 feedback for
// narrative synthesis: their self-vs-others competency scores AND the raw
// anonymized free-text comments raters left on the cycle's open questions —
// both are real, submitted data (see feedback_behavior_responses /
// feedback_open_responses), not just the numeric-only signal the existing
// deterministic composeNarrative template used.
func feedback360NarrativeMetrics(s scope.Scope) (string, error) {
	cycleID, err := latestAssignedCycleID(s.UserID)
	if err != nil {
		return "", err
	}
	if cycleID == "" {
		return "", fmt.Errorf("aggregate: no 360 feedback cycle found for this participant")
	}

	scores, err := feedback360CompetencyScores(cycleID, s.UserID)
	if err != nil {
		return "", err
	}
	comments, err := feedback360OpenComments(cycleID, s.UserID)
	if err != nil {
		return "", err
	}

	var b strings.Builder
	if len(scores) == 0 {
		b.WriteString("COMPETENCY SCORES: no scores submitted yet.\n")
	} else {
		b.WriteString("COMPETENCY SCORES (self vs others, 0-5 scale):\n")
		for _, sc := range scores {
			b.WriteString(fmt.Sprintf("  - %s: self=%s, others=%s\n", sc.Title, formatScorePtr(sc.SelfScore), formatScorePtr(sc.OthersScore)))
		}
	}

	if len(comments) == 0 {
		b.WriteString("\nOPEN-TEXT COMMENTS: none submitted yet.\n")
	} else {
		b.WriteString(fmt.Sprintf("\nOPEN-TEXT COMMENTS (%d anonymized rater responses):\n", len(comments)))
		for _, c := range comments {
			b.WriteString(fmt.Sprintf("  - %s\n", c))
		}
	}

	return b.String(), nil
}

func formatScorePtr(v *float64) string {
	if v == nil {
		return "n/a"
	}
	return fmt.Sprintf("%.1f", *v)
}

// latestAssignedCycleID mirrors feedback360's own latestCycleForParticipant
// resolution (assigned admin cycle, most recently added) — the two must stay
// in sync since this is "which cycle is 'my 360' referring to right now,"
// same question the participant's own report page answers.
func latestAssignedCycleID(participantID uuid.UUID) (string, error) {
	var cycleID string
	err := database.DB.Raw(`
		SELECT fc.id::text
		FROM feedback_cycles fc
		JOIN feedback_cycle_participants fcp ON fcp.cycle_id = fc.id
		WHERE fcp.participant_id = ? AND fc.status IN ('locked', 'active', 'completed')
		ORDER BY fcp.added_at DESC
		LIMIT 1
	`, participantID).Scan(&cycleID).Error
	return cycleID, err
}

type competencyScoreRow struct {
	Title       string
	SelfScore   *float64
	OthersScore *float64
}

// feedback360CompetencyScores unifies feedback_behavior_responses (admin
// cycles) and feedback_responses (legacy) the same way feedback360's own
// aggregateScores does, joined to competencies for a readable title.
func feedback360CompetencyScores(cycleID string, participantID uuid.UUID) ([]competencyScoreRow, error) {
	var rows []competencyScoreRow
	err := database.DB.Raw(`
		WITH unified AS (
			SELECT br.competency_id, br.score, r.relationship
			FROM feedback_behavior_responses br
			JOIN feedback_raters r ON r.id = br.rater_id
			WHERE r.cycle_id = ?::uuid AND r.participant_id = ?
			UNION ALL
			SELECT resp.competency_id, resp.score, r.relationship
			FROM feedback_responses resp
			JOIN feedback_raters r ON r.id = resp.rater_id
			WHERE r.cycle_id = ?::uuid AND r.participant_id = ?
		)
		SELECT c.title,
		       AVG(u.score) FILTER (WHERE u.relationship = 'self')  AS self_score,
		       AVG(u.score) FILTER (WHERE u.relationship <> 'self') AS others_score
		FROM unified u
		JOIN competencies c ON c.id = u.competency_id
		GROUP BY c.title
		ORDER BY c.title
	`, cycleID, participantID, cycleID, participantID).Scan(&rows).Error
	return rows, err
}

// feedback360OpenComments returns every free-text answer submitted by any
// rater on this cycle, for this participant, anonymized (no rater name/email
// carried through — only the relationship label, which is not identifying
// among a rater pool).
func feedback360OpenComments(cycleID string, participantID uuid.UUID) ([]string, error) {
	type row struct {
		Relationship string
		AnswerText   string
	}
	var rows []row
	err := database.DB.Raw(`
		SELECT r.relationship, fo.answer_text
		FROM feedback_open_responses fo
		JOIN feedback_raters r ON r.id = fo.rater_id
		WHERE r.cycle_id = ?::uuid AND r.participant_id = ?
		  AND TRIM(fo.answer_text) <> ''
		ORDER BY fo.created_at
	`, cycleID, participantID).Scan(&rows).Error
	if err != nil {
		return nil, err
	}
	out := make([]string, 0, len(rows))
	for _, r := range rows {
		out = append(out, fmt.Sprintf("[%s] %s", r.Relationship, r.AnswerText))
	}
	return out, nil
}
