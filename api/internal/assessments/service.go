package assessments

import (
	"encoding/json"
	"errors"
	"time"

	"github.com/google/uuid"
)

var (
	ErrForbidden      = errors.New("forbidden")
	ErrValidation     = errors.New("validation error")
	ErrNoAttemptsLeft = errors.New("no attempts left")
	ErrNotQuizBacked  = errors.New("this assessment has no quiz questions — use the file/reflection submission instead")
)

// assessmentCfg mirrors programs.AssessmentConfig (modules can't import each
// other, so this is parsed locally from the raw config JSON).
type assessmentCfg struct {
	AssetID         string `json:"asset_id"`
	AttemptsAllowed int    `json:"attempts_allowed"`
	TimeLimitMins   int    `json:"time_limit_mins"`
	ScoringMethod   string `json:"scoring_method"`
	PassingScorePct int    `json:"passing_score_pct"`
}

func parseConfig(raw []byte) assessmentCfg {
	var c assessmentCfg
	if len(raw) > 0 {
		_ = json.Unmarshal(raw, &c)
	}
	if c.AttemptsAllowed <= 0 {
		c.AttemptsAllowed = 1
	}
	if c.ScoringMethod == "" {
		c.ScoringMethod = "highest"
	}
	return c
}

// question mirrors content.Question (modules can't import each other's Go
// package — this is parsed locally from content_assets.meta jsonb, the same
// cross-module raw-read convention used throughout internal/ai/*).
type matchPair struct {
	Left  string `json:"left"`
	Right string `json:"right"`
}
type question struct {
	ID           string      `json:"id"`
	Type         string      `json:"type"`
	Text         string      `json:"text"`
	Options      []string    `json:"options,omitempty"`
	CorrectIndex *int        `json:"correct_index,omitempty"`
	CorrectText  *string     `json:"correct_text,omitempty"`
	MatchPairs   []matchPair `json:"match_pairs,omitempty"`
	Points       *int        `json:"points,omitempty"`
	SortOrder    int         `json:"sort_order"`
}
type questionSet struct {
	Questions []question `json:"questions"`
}

// loadQuestions resolves an assessment activity's linked Content Library
// quiz asset (AssessmentConfig.AssetID -> content_assets.meta) and parses
// its question set. Returns ErrNotQuizBacked if no asset is linked or it has
// no questions — that's the signal callers use to fall back to the generic
// submissions flow for essay/file-style assessment activities.
func loadQuestions(cfg assessmentCfg) ([]question, error) {
	if cfg.AssetID == "" {
		return nil, ErrNotQuizBacked
	}
	assetID, err := uuid.Parse(cfg.AssetID)
	if err != nil {
		return nil, ErrNotQuizBacked
	}
	meta, err := getAssetMeta(assetID)
	if err != nil {
		return nil, ErrNotQuizBacked
	}
	var qs questionSet
	if err := json.Unmarshal(meta, &qs); err != nil || len(qs.Questions) == 0 {
		return nil, ErrNotQuizBacked
	}
	return qs.Questions, nil
}

func questionPoints(q question) int {
	if q.Points != nil && *q.Points > 0 {
		return *q.Points
	}
	return 1
}

// getMyAssessmentsService lists quiz-backed assessment activities in the
// participant's program. Assessment activities with no linked quiz asset
// (essay/file-upload style) are omitted here — they're handled by the
// existing submissions module and rendered by AssessmentsExperience's
// existing Upcoming/History tabs unchanged.
func getMyAssessmentsService(userID uuid.UUID, programID *uuid.UUID) (*MyAssessmentsDTO, error) {
	dto := &MyAssessmentsDTO{Assessments: []AssessmentCardDTO{}}

	prog, err := findMyProgram(userID, programID)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return dto, nil
		}
		return nil, err
	}
	dto.HasProgram = true
	progID := uuid.MustParse(prog.ProgramID)

	acts, err := listAssessmentActivities(progID)
	if err != nil {
		return nil, err
	}

	ids := make([]uuid.UUID, 0, len(acts))
	for _, a := range acts {
		ids = append(ids, uuid.MustParse(a.ID))
	}
	summaries, err := attemptSummaries(userID, ids)
	if err != nil {
		return nil, err
	}

	now := time.Now()
	var scoreSum float64
	var scoreCount int
	for _, a := range acts {
		cfg := parseConfig(a.Config)
		qs, err := loadQuestions(cfg)
		if err != nil {
			continue // not quiz-backed — handled by the submissions flow, not listed here
		}

		maxScore := 0
		for _, q := range qs {
			maxScore += questionPoints(q)
		}

		card := AssessmentCardDTO{
			ActivityID:      a.ID,
			Title:           a.Title,
			QuestionCount:   len(qs),
			TimeLimitMins:   cfg.TimeLimitMins,
			AttemptsAllowed: cfg.AttemptsAllowed,
			PassingScorePct: cfg.PassingScorePct,
		}

		if prog.CohortStart != nil {
			d := prog.CohortStart.AddDate(0, 0, a.StartDay+a.DueDayOffset)
			s := d.Format("2006-01-02")
			card.DueDate = &s
		}

		if summary, ok := summaries[a.ID]; ok {
			card.AttemptsUsed = summary.AttemptCount
			best := summary.BestScorePct
			card.BestScorePct = &best
			passed := summary.AnyPassed
			card.Passed = &passed
			scoreSum += best
			scoreCount++
			dto.Graded++
			if summary.AttemptCount >= cfg.AttemptsAllowed {
				card.Status = "completed"
				dto.Completed++
			} else {
				card.Status = "active"
			}
		} else {
			openDate := (*time.Time)(nil)
			if prog.CohortStart != nil {
				od := prog.CohortStart.AddDate(0, 0, a.StartDay)
				openDate = &od
			}
			if openDate != nil && now.Before(*openDate) {
				card.Status = "upcoming"
			} else {
				card.Status = "active"
			}
		}

		dto.Assessments = append(dto.Assessments, card)
	}

	dto.Total = len(dto.Assessments)
	if scoreCount > 0 {
		avg := scoreSum / float64(scoreCount)
		dto.AvgScore = &avg
	}
	return dto, nil
}

// getAssessmentDetailService returns the quiz WITHOUT correct answers — the
// only shape ever sent to a participant before they submit.
func getAssessmentDetailService(userID uuid.UUID, activityIDStr string) (*AssessmentDetailDTO, error) {
	activityID, err := uuid.Parse(activityIDStr)
	if err != nil {
		return nil, ErrValidation
	}
	enrolled, err := isEnrolledInActivityProgram(userID, activityID)
	if err != nil {
		return nil, err
	}
	if !enrolled {
		return nil, ErrForbidden
	}

	act, err := getAssessmentActivity(activityID)
	if err != nil {
		return nil, err
	}
	cfg := parseConfig(act.Config)
	qs, err := loadQuestions(cfg)
	if err != nil {
		return nil, err
	}

	used, err := countAttempts(activityID, userID)
	if err != nil {
		return nil, err
	}
	if used >= cfg.AttemptsAllowed {
		return nil, ErrNoAttemptsLeft
	}

	detail := &AssessmentDetailDTO{
		ActivityID:      act.ID,
		Title:           act.Title,
		TimeLimitMins:   cfg.TimeLimitMins,
		AttemptsAllowed: cfg.AttemptsAllowed,
		AttemptsUsed:    used,
		PassingScorePct: cfg.PassingScorePct,
		Questions:       make([]QuestionDTO, 0, len(qs)),
	}
	for _, q := range qs {
		mps := make([]MatchPair, 0, len(q.MatchPairs))
		for _, mp := range q.MatchPairs {
			mps = append(mps, MatchPair{Left: mp.Left, Right: mp.Right})
		}
		detail.Questions = append(detail.Questions, QuestionDTO{
			ID: q.ID, Type: q.Type, Text: q.Text, Options: q.Options,
			MatchPairs: mps, Points: questionPoints(q),
		})
	}
	return detail, nil
}

// submitAssessmentService scores a participant's answers server-side —
// correctness is NEVER computed or trusted client-side. Enforces
// attempts_allowed; the returned result includes per-question correctness so
// the frontend can show a results screen immediately.
func submitAssessmentService(userID uuid.UUID, req SubmitAssessmentRequest) (*AssessmentResultDTO, error) {
	activityID, err := uuid.Parse(req.ActivityID)
	if err != nil {
		return nil, ErrValidation
	}
	enrolled, err := isEnrolledInActivityProgram(userID, activityID)
	if err != nil {
		return nil, err
	}
	if !enrolled {
		return nil, ErrForbidden
	}

	act, err := getAssessmentActivity(activityID)
	if err != nil {
		return nil, err
	}
	cfg := parseConfig(act.Config)
	qs, err := loadQuestions(cfg)
	if err != nil {
		return nil, err
	}

	used, err := countAttempts(activityID, userID)
	if err != nil {
		return nil, err
	}
	if used >= cfg.AttemptsAllowed {
		return nil, ErrNoAttemptsLeft
	}

	byID := make(map[string]question, len(qs))
	for _, q := range qs {
		byID[q.ID] = q
	}
	answersByQ := make(map[string]AnswerInput, len(req.Answers))
	for _, a := range req.Answers {
		if _, ok := byID[a.QuestionID]; !ok {
			return nil, ErrValidation
		}
		answersByQ[a.QuestionID] = a
	}

	var score, maxScore float64
	results := make([]QuestionResultDTO, 0, len(qs))
	for _, q := range qs {
		pts := questionPoints(q)
		maxScore += float64(pts)
		ans, hasAns := answersByQ[q.ID]

		qr := QuestionResultDTO{ID: q.ID, Type: q.Type, Text: q.Text, Options: q.Options, Points: pts}

		switch q.Type {
		case "mcq", "true_false":
			if hasAns {
				qr.SelectedIndex = ans.Index
			}
			qr.CorrectIndex = q.CorrectIndex
			correct := hasAns && ans.Index != nil && q.CorrectIndex != nil && *ans.Index == *q.CorrectIndex
			qr.IsCorrect = &correct
			if correct {
				qr.PointsEarned = pts
				score += float64(pts)
			}
		case "open":
			// Free-text — not auto-gradable. Recorded, but never auto-scored;
			// points are not counted toward maxScore for this question so an
			// open-ended question can't silently tank an otherwise-correct quiz.
			maxScore -= float64(pts)
			if hasAns {
				qr.SelectedText = ans.Text
			}
		default:
			// matching or any future type — not auto-gradable in v1.
			maxScore -= float64(pts)
			if hasAns {
				qr.SelectedText = ans.Text
			}
		}
		results = append(results, qr)
	}

	scorePct := 0.0
	if maxScore > 0 {
		scorePct = score / maxScore * 100
	}
	passed := cfg.PassingScorePct == 0 || scorePct >= float64(cfg.PassingScorePct)

	attempt := &AssessmentAttempt{
		ID: uuid.New(), ActivityID: activityID, ParticipantID: userID,
		Score: score, MaxScore: maxScore, ScorePct: scorePct, Passed: passed,
		AttemptNumber: used + 1, SubmittedAt: time.Now(),
	}
	answersJSON, _ := json.Marshal(req.Answers)
	attempt.Answers = answersJSON
	if err := createAttempt(attempt); err != nil {
		return nil, err
	}

	// "highest"/"average" scoring methods affect what's SHOWN as the
	// participant's standing across attempts, not what's stored per-attempt —
	// each attempt is scored on its own merits; aggregation happens in
	// getMyAssessmentsService (best score) and here for the immediate result.
	displayScorePct := scorePct
	displayPassed := passed
	if cfg.ScoringMethod == "highest" {
		if best, err := bestAttempt(activityID, userID); err == nil {
			displayScorePct = best.ScorePct
			displayPassed = best.Passed
		}
	} else if cfg.ScoringMethod == "average" {
		attempts, err := listAttempts(activityID, userID)
		if err == nil && len(attempts) > 0 {
			var sum float64
			for _, a := range attempts {
				sum += a.ScorePct
			}
			displayScorePct = sum / float64(len(attempts))
			displayPassed = cfg.PassingScorePct == 0 || displayScorePct >= float64(cfg.PassingScorePct)
		}
	}

	return &AssessmentResultDTO{
		ActivityID: act.ID, Title: act.Title,
		Score: score, MaxScore: maxScore, ScorePct: displayScorePct, Passed: displayPassed,
		AttemptNumber: attempt.AttemptNumber, AttemptsLeft: cfg.AttemptsAllowed - attempt.AttemptNumber,
		Questions: results,
	}, nil
}
