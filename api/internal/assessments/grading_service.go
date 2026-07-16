package assessments

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

// isObjectiveType reports whether a question type is auto-scored (locked from
// faculty) vs. faculty-graded (open/unknown).
func isObjectiveType(t string) bool {
	switch t {
	case "mcq", "true_false", "matching":
		return true
	default:
		return false
	}
}

// listGradingQueueService returns the faculty grading queue. status "" ->
// pending_review; "graded" -> this faculty's graded history.
func listGradingQueueService(facultyID uuid.UUID, status string) ([]GradingQueueItemDTO, error) {
	rows, err := listGradingQueue(facultyID, status)
	if err != nil {
		return nil, err
	}
	out := make([]GradingQueueItemDTO, 0, len(rows))
	for _, r := range rows {
		out = append(out, GradingQueueItemDTO{
			AttemptID:     r.AttemptID,
			ActivityID:    r.ActivityID,
			ActivityTitle: r.ActivityTitle,
			ActivityType:  r.ActivityType,
			ParticipantID: r.ParticipantID,
			Participant:   r.Participant,
			ProgramID:     r.ProgramID,
			Program:       r.Program,
			OrgID:         r.OrgID,
			SubmittedAt:   r.SubmittedAt.UTC().Format(time.RFC3339),
			Status:        r.Status,
			ScorePct:      round2(r.ScorePct),
		})
	}
	return out, nil
}

// getGradingDetailService builds the full grading view for one attempt: every
// question with the participant's answer, objective ones pre-scored and locked,
// open ones showing the participant's text and any award already entered.
// facultyID is the authorization boundary — only a faculty who teaches the
// attempt's program may open it.
func getGradingDetailService(facultyID, attemptID uuid.UUID) (*GradingDetailDTO, error) {
	ok, err := facultyTeachesAttempt(facultyID, attemptID)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, ErrForbidden
	}

	attempt, err := getAttemptByID(attemptID)
	if err != nil {
		return nil, err
	}
	ctx, err := getAttemptContext(attemptID)
	if err != nil {
		return nil, err
	}

	cfg := parseConfig(ctx.Config)
	qs, err := loadQuestions(cfg)
	if err != nil {
		return nil, err
	}

	answersByQ := decodeAnswers(attempt.Answers)
	facultyByQ := decodeFacultyScores(attempt.FacultyScores)
	_, _, _, results := scoreAnswers(qs, answersByQ)

	// Index results by question id for objective correctness/points.
	resByID := make(map[string]QuestionResultDTO, len(results))
	for _, r := range results {
		resByID[r.ID] = r
	}

	detail := &GradingDetailDTO{
		AttemptID:      attempt.ID.String(),
		ActivityID:     ctx.ActivityID,
		ActivityTitle:  ctx.ActivityTitle,
		Participant:    ctx.Participant,
		Status:         attempt.Status,
		Score:          round2(attempt.Score),
		MaxScore:       round2(attempt.MaxScore),
		ScorePct:       round2(attempt.ScorePct),
		FacultyComment: attempt.FacultyComment,
		Questions:      make([]GradingQuestionDTO, 0, len(qs)),
	}

	for _, q := range qs {
		pts := questionPoints(q)
		res := resByID[q.ID]
		gq := GradingQuestionDTO{
			ID:          q.ID,
			Type:        q.Type,
			Text:        q.Text,
			Points:      pts,
			IsObjective: isObjectiveType(q.Type),
			Options:     q.Options,
		}
		if gq.IsObjective {
			gq.SelectedIndex = res.SelectedIndex
			gq.CorrectIndex = res.CorrectIndex
			gq.IsCorrect = res.IsCorrect
			gq.PointsEarned = float64(res.PointsEarned)
		} else {
			gq.SelectedText = res.SelectedText
			// Pre-fill any award faculty already entered.
			if fs, ok := facultyByQ[q.ID]; ok {
				gq.PointsEarned = fs.PointsEarned
				gq.Comment = fs.Comment
			}
		}
		detail.Questions = append(detail.Questions, gq)
	}
	return detail, nil
}

// gradeAttemptService applies a faculty member's open-question awards to an
// attempt, recomputes the final score (objective re-scored from stored answers
// + faculty awards, clamped to each question's max), marks the attempt graded,
// and returns the participant id + finalized percentage so the caller can fire
// the notification. Objective scores are never taken from the request — they're
// always recomputed server-side and locked.
func gradeAttemptService(facultyID, attemptID uuid.UUID, req GradeAttemptRequest) (participantID string, activityTitle string, finalPct float64, passed bool, err error) {
	ok, aerr := facultyTeachesAttempt(facultyID, attemptID)
	if aerr != nil {
		return "", "", 0, false, aerr
	}
	if !ok {
		return "", "", 0, false, ErrForbidden
	}

	attempt, aerr := getAttemptByID(attemptID)
	if aerr != nil {
		return "", "", 0, false, aerr
	}
	ctx, aerr := getAttemptContext(attemptID)
	if aerr != nil {
		return "", "", 0, false, aerr
	}

	cfg := parseConfig(ctx.Config)
	qs, aerr := loadQuestions(cfg)
	if aerr != nil {
		return "", "", 0, false, aerr
	}

	answersByQ := decodeAnswers(attempt.Answers)
	objectiveScore, maxScore, _, _ := scoreAnswers(qs, answersByQ)

	// Build a validated per-open-question award map, clamped to [0, points].
	reqByQ := make(map[string]GradeQuestionInput, len(req.Scores))
	for _, s := range req.Scores {
		reqByQ[s.QuestionID] = s
	}

	facultyScores := make([]FacultyQuestionScore, 0)
	var openEarned float64
	for _, q := range qs {
		if isObjectiveType(q.Type) {
			continue // objective is locked — never faculty-scored
		}
		pts := float64(questionPoints(q))
		award := 0.0
		comment := ""
		if s, ok := reqByQ[q.ID]; ok {
			award = s.PointsEarned
			comment = s.Comment
		}
		if award < 0 {
			award = 0
		}
		if award > pts {
			award = pts
		}
		openEarned += award
		facultyScores = append(facultyScores, FacultyQuestionScore{
			QuestionID: q.ID, PointsEarned: award, Comment: comment,
		})
	}

	totalScore := objectiveScore + openEarned
	finalPct = 0
	if maxScore > 0 {
		finalPct = totalScore / maxScore * 100
	}
	passed = cfg.PassingScorePct == 0 || finalPct >= float64(cfg.PassingScorePct)

	fsJSON, _ := json.Marshal(facultyScores)
	now := time.Now()
	fields := map[string]any{
		"score":          totalScore,
		"max_score":      maxScore,
		"score_pct":      finalPct,
		"passed":         passed,
		"status":         "graded",
		"faculty_scores": fsJSON,
		"graded_by":      facultyID,
		"graded_at":      now,
	}
	if req.Comment != "" {
		fields["faculty_comment"] = req.Comment
	}
	if uerr := updateAttempt(attemptID, fields); uerr != nil {
		return "", "", 0, false, uerr
	}

	return ctx.ParticipantID, ctx.ActivityTitle, round2(finalPct), passed, nil
}

// ── helpers ────────────────────────────────────────────────────────

func decodeAnswers(raw []byte) map[string]AnswerInput {
	out := map[string]AnswerInput{}
	if len(raw) == 0 {
		return out
	}
	var list []AnswerInput
	if err := json.Unmarshal(raw, &list); err != nil {
		return out
	}
	for _, a := range list {
		out[a.QuestionID] = a
	}
	return out
}

func decodeFacultyScores(raw []byte) map[string]FacultyQuestionScore {
	out := map[string]FacultyQuestionScore{}
	if len(raw) == 0 {
		return out
	}
	var list []FacultyQuestionScore
	if err := json.Unmarshal(raw, &list); err != nil {
		return out
	}
	for _, s := range list {
		out[s.QuestionID] = s
	}
	return out
}

func round2(v float64) float64 { return float64(int(v*100+0.5)) / 100 }
