package assessments

import (
	"encoding/json"
	"errors"
	"strconv"
	"time"

	"github.com/google/uuid"
	"github.com/xa-lms/api/internal/leaderboard"
)

var (
	ErrForbidden      = errors.New("forbidden")
	ErrValidation     = errors.New("validation error")
	ErrNoAttemptsLeft = errors.New("no attempts left")
	ErrNotQuizBacked  = errors.New("this assessment has no quiz questions - use the file/reflection submission instead")
)

// assessmentCfg mirrors programs.AssessmentConfig (modules can't import each
// other, so this is parsed locally from the raw config JSON). It also carries
// the optional nested knowledge_check block so a knowledge check ATTACHED to a
// content-style activity (video/pdf/case_study/eLearning) is taken and scored
// through this same engine - see parseConfig's fallback.
type assessmentCfg struct {
	AssetID         string `json:"asset_id"`
	AttemptsAllowed int    `json:"attempts_allowed"`
	TimeLimitMins   int    `json:"time_limit_mins"`
	ScoringMethod   string `json:"scoring_method"`
	PassingScorePct int    `json:"passing_score_pct"`
	// KnowledgeCheck mirrors programs.KnowledgeCheck (the attached-quiz block on
	// non-assessment activities).
	KnowledgeCheck *struct {
		AssetID         string `json:"asset_id"`
		TimeLimitMins   int    `json:"time_limit_mins"`
		AttemptsAllowed int    `json:"attempts_allowed"`
		PassingScorePct int    `json:"passing_score_pct"`
	} `json:"knowledge_check"`
}

func parseConfig(raw []byte) assessmentCfg {
	var c assessmentCfg
	if len(raw) > 0 {
		_ = json.Unmarshal(raw, &c)
	}
	// Attached knowledge check: on a content-style activity (case_study/content/
	// video/pdf) the top-level asset_id points at the CONTENT being tested (e.g.
	// a case study's text - no questions), while knowledge_check.asset_id is the
	// quiz. Whenever a knowledge check is present it ALWAYS wins for the
	// quiz-loading path, overriding the content asset_id - otherwise
	// loadQuestions would try (and fail) to find questions on the content asset.
	// A standalone assessment activity has no knowledge_check block, so this
	// never touches it.
	if c.KnowledgeCheck != nil && c.KnowledgeCheck.AssetID != "" {
		c.AssetID = c.KnowledgeCheck.AssetID
		c.TimeLimitMins = c.KnowledgeCheck.TimeLimitMins
		c.PassingScorePct = c.KnowledgeCheck.PassingScorePct
		if c.KnowledgeCheck.AttemptsAllowed > 0 {
			c.AttemptsAllowed = c.KnowledgeCheck.AttemptsAllowed
		}
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
// package - this is parsed locally from content_assets.meta jsonb, the same
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

// assetMeta mirrors the top level of content_assets.meta as written by
// content.buildMetaJSON - questions live nested under "question_set", not at
// the top level (meta also carries question_count, duration_mins, etc.
// alongside it depending on asset type). Same shape/bug as surveys'
// contentAssetMeta - unmarshaling meta directly into questionSet always
// found zero questions since "questions" was never a top-level key.
type assetMeta struct {
	QuestionSet *questionSet `json:"question_set"`
}

// loadQuestions resolves an assessment activity's linked Content Library
// quiz asset (AssessmentConfig.AssetID -> content_assets.meta) and parses
// its question set. Returns ErrNotQuizBacked if no asset is linked or it has
// no questions - that's the signal callers use to fall back to the generic
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
	var am assetMeta
	if err := json.Unmarshal(meta, &am); err != nil || am.QuestionSet == nil || len(am.QuestionSet.Questions) == 0 {
		return nil, ErrNotQuizBacked
	}
	return am.QuestionSet.Questions, nil
}

func questionPoints(q question) int {
	if q.Points != nil && *q.Points > 0 {
		return *q.Points
	}
	return 1
}

// scoreAnswers scores a full answer set against the question set and returns
// the objective points earned, the total points possible (including open
// questions), whether any open/faculty-graded question is present, and the
// per-question result rows.
//
// Scoring rules (single points model - objective auto, open faculty-graded):
//   - mcq / true_false : all-or-nothing on correct_index.
//   - matching         : per-pair partial credit - pts * (correctPairs/total).
//   - open             : NOT auto-scored (PointsEarned stays 0, IsCorrect nil);
//     counted in maxScore so the denominator is right, faculty awards later.
//
// maxScore always includes every question's points (open included) so the
// final percentage denominator is stable whether or not faculty has graded yet.
func scoreAnswers(qs []question, answersByQ map[string]AnswerInput) (score, maxScore float64, hasOpen bool, results []QuestionResultDTO) {
	results = make([]QuestionResultDTO, 0, len(qs))
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
		case "matching":
			// Per-pair partial credit. A pair is correct when the participant
			// mapped that left item to the authored Right text.
			total := len(q.MatchPairs)
			correctPairs := 0
			if hasAns && total > 0 {
				for i, mp := range q.MatchPairs {
					if chosen, ok := ans.Matches[strconv.Itoa(i)]; ok && chosen == mp.Right {
						correctPairs++
					}
				}
			}
			earned := 0.0
			if total > 0 {
				earned = float64(pts) * float64(correctPairs) / float64(total)
			}
			allCorrect := total > 0 && correctPairs == total
			qr.IsCorrect = &allCorrect
			qr.PointsEarned = int(earned + 0.5) // rounded for display; score keeps the exact value
			score += earned
		case "open":
			// Free-text - faculty-graded, never auto-scored. Counted toward
			// maxScore (so the % denominator is correct) but earns 0 until a
			// faculty member awards points. IsCorrect stays nil (ungraded).
			hasOpen = true
			if hasAns {
				qr.SelectedText = ans.Text
			}
		default:
			// Unknown/future type - treat as faculty-graded (safe: it won't
			// auto-award points, and it flags the attempt for review).
			hasOpen = true
			if hasAns {
				qr.SelectedText = ans.Text
			}
		}
		results = append(results, qr)
	}
	return score, maxScore, hasOpen, results
}

// getMyAssessmentsService lists quiz-backed assessment activities in the
// participant's program. Assessment activities with no linked quiz asset
// (essay/file-upload style) are omitted here - they're handled by the
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
	var postModuleIDs []string
	seenModule := map[string]bool{}
	for _, a := range acts {
		ids = append(ids, uuid.MustParse(a.ID))
		if a.Slot == "post" && a.ModuleID != nil && !seenModule[*a.ModuleID] {
			seenModule[*a.ModuleID] = true
			postModuleIDs = append(postModuleIDs, *a.ModuleID)
		}
	}
	summaries, err := attemptSummaries(userID, ids)
	if err != nil {
		return nil, err
	}
	moduleDone, err := modulePreWorkDoneMap(userID, progID, postModuleIDs)
	if err != nil {
		moduleDone = map[string]bool{} // best-effort - leave everything unlocked rather than fail the whole list
	}

	now := time.Now()
	var scoreSum float64
	var scoreCount int
	for _, a := range acts {
		cfg := parseConfig(a.Config)
		qs, err := loadQuestions(cfg)
		if err != nil {
			continue // not quiz-backed - handled by the submissions flow, not listed here
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
		if a.Slot == "post" && a.ModuleID != nil && !moduleDone[*a.ModuleID] {
			card.Locked = true
			card.LockedReason = "Complete this module's pre-work first"
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
			card.PendingReview = summary.AnyPending
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
			} else if card.Locked {
				// Date-wise open, but its module's pre-work isn't done yet -
				// stays "active" (the date is accurate) but callers must
				// check Locked before treating this as actionable - same
				// convention as surveys.getMySurveysService.
				card.Status = "active"
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

// getAssessmentDetailService returns the quiz WITHOUT correct answers - the
// only shape ever sent to a participant before they submit.
func getAssessmentDetailService(userID uuid.UUID, activityIDStr string) (*AssessmentDetailDTO, error) {
	activityID, err := uuid.Parse(activityIDStr)
	if err != nil {
		return nil, ErrValidation
	}
	// Existence before authorization: isEnrolledInActivityProgram's query JOINs
	// through the activity, so a nonexistent/deleted/stale activity id also
	// makes that JOIN match zero rows - indistinguishable from "this activity
	// exists but you're not enrolled" without this ordering. That collapsed a
	// stale activity link (e.g. one whose activity was since deleted) into a
	// misleading 403 FORBIDDEN instead of 404 NOT_FOUND, confusing participants
	// who read it as a permissions problem.
	act, err := getAssessmentActivity(activityID)
	if err != nil {
		return nil, err
	}
	enrolled, err := isEnrolledInActivityProgram(userID, activityID)
	if err != nil {
		return nil, err
	}
	if !enrolled {
		return nil, ErrForbidden
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

	// Timed assessment: anchor the countdown server-side. First open creates
	// the session; a refresh resumes the same started_at so the clock can't be
	// reset by reopening.
	if cfg.TimeLimitMins > 0 {
		sess, serr := getOrCreateAttemptSession(activityID, userID)
		if serr != nil {
			return nil, serr
		}
		detail.StartedAt = sess.StartedAt.UTC().Format(time.RFC3339)
		detail.ServerNow = time.Now().UTC().Format(time.RFC3339)
	}

	return detail, nil
}

// getAssessmentStatusService returns the participant's standing on a
// quiz-backed activity (any type - standalone assessment or an attached
// Knowledge Check) without the attempts-exhausted error getAssessmentDetailService
// throws. Used by the results UI so a completed/graded attached check can
// still show its score once attempts run out.
func getAssessmentStatusService(userID uuid.UUID, activityIDStr string) (*AssessmentStatusDTO, error) {
	activityID, err := uuid.Parse(activityIDStr)
	if err != nil {
		return nil, ErrValidation
	}
	// Existence before authorization - see getAssessmentDetailService for why.
	act, err := getAssessmentActivity(activityID)
	if err != nil {
		return nil, err
	}
	enrolled, err := isEnrolledInActivityProgram(userID, activityID)
	if err != nil {
		return nil, err
	}
	if !enrolled {
		return nil, ErrForbidden
	}

	cfg := parseConfig(act.Config)
	if _, err := loadQuestions(cfg); err != nil {
		return nil, err
	}

	attempts, err := listAttempts(activityID, userID)
	if err != nil {
		return nil, err
	}

	dto := &AssessmentStatusDTO{
		ActivityID:      act.ID,
		AttemptsAllowed: cfg.AttemptsAllowed,
		AttemptsUsed:    len(attempts),
	}
	if len(attempts) > 0 {
		last := attempts[len(attempts)-1]
		dto.LastStatus = last.Status
		for _, a := range attempts {
			if a.Status == "pending_review" {
				dto.PendingReview = true
			}
		}
		best, err := bestAttempt(activityID, userID)
		if err == nil {
			bp := round2(best.ScorePct)
			dto.BestScorePct = &bp
			passed := best.Passed
			dto.Passed = &passed
		}
	}
	return dto, nil
}

// submitAssessmentService scores a participant's answers server-side -
// correctness is NEVER computed or trusted client-side. Enforces
// attempts_allowed; the returned result includes per-question correctness so
// the frontend can show a results screen immediately.
func submitAssessmentService(userID uuid.UUID, req SubmitAssessmentRequest) (*AssessmentResultDTO, error) {
	activityID, err := uuid.Parse(req.ActivityID)
	if err != nil {
		return nil, ErrValidation
	}
	// Existence before authorization - see getAssessmentDetailService for why.
	act, err := getAssessmentActivity(activityID)
	if err != nil {
		return nil, err
	}
	enrolled, err := isEnrolledInActivityProgram(userID, activityID)
	if err != nil {
		return nil, err
	}
	if !enrolled {
		return nil, ErrForbidden
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

	score, maxScore, hasOpen, results := scoreAnswers(qs, answersByQ)

	// An attempt with any open (faculty-graded) question can't be final at
	// submit time - the objective portion is scored now, the open portion is
	// queued for faculty. scorePct/passed here reflect the objective portion
	// only; both are recomputed when faculty finishes grading.
	status := "auto_scored"
	if hasOpen {
		status = "pending_review"
	}

	scorePct := 0.0
	if maxScore > 0 {
		scorePct = score / maxScore * 100
	}
	passed := !hasOpen && (cfg.PassingScorePct == 0 || scorePct >= float64(cfg.PassingScorePct))

	// Timer enforcement: if the assessment is timed and this submit lands past
	// the limit (+ a short grace for network/render latency), the attempt is
	// still accepted and scored (no lost work) but flagged timed_out. The start
	// is the server-anchored session; a missing session (untimed, or opened
	// before the timer feature) means no enforcement.
	timedOut := false
	if cfg.TimeLimitMins > 0 {
		if sess, serr := getAttemptSession(activityID, userID); serr == nil && sess != nil {
			const graceSecs = 15
			deadline := sess.StartedAt.Add(time.Duration(cfg.TimeLimitMins)*time.Minute + graceSecs*time.Second)
			if time.Now().After(deadline) {
				timedOut = true
			}
		}
	}

	attempt := &AssessmentAttempt{
		ID: uuid.New(), ActivityID: activityID, ParticipantID: userID,
		Score: score, MaxScore: maxScore, ScorePct: scorePct, Passed: passed,
		Status: status, TimedOut: timedOut, AttemptNumber: used + 1, SubmittedAt: time.Now(),
	}
	if cfg.AssetID != "" {
		if aid, perr := uuid.Parse(cfg.AssetID); perr == nil {
			attempt.SourceAssetID = &aid
		}
	}
	answersJSON, _ := json.Marshal(req.Answers)
	attempt.Answers = answersJSON
	if err := createAttempt(attempt); err != nil {
		return nil, err
	}
	// Existing leaderboard semantics awarded an assessment once, rather than per
	// attempt. Use activity_id as the idempotency source for that policy.
	if err := leaderboard.AwardActivity(userID, activityID, activityID, "assessment", leaderboard.PointsPerAssessment, attempt.SubmittedAt); err != nil {
		return nil, err
	}
	// Best-effort, feature-flagged (default off) - see
	// leaderboard.TryRecalculateActivityScore's doc comment.
	leaderboard.TryRecalculateActivityScore(userID, activityID)
	// Attempt recorded - clear the in-progress timer session so a new attempt
	// (if attempts remain) starts a fresh countdown.
	_ = deleteAttemptSession(activityID, userID)

	// Keep enrollments.completion_percent in sync - previously only
	// activity_progress updates triggered this, so submitting a quiz/assessment
	// attempt never moved the needle on Program Progress/faculty rosters/
	// analytics/risk scoring even though the participant had genuinely made
	// progress. One attempt is enough (not "passed"/"attempts exhausted") -
	// matches the same convention used for module/phase prerequisite gating.
	if pid, perr := programIDForActivity(activityID); perr == nil {
		recomputeEnrollmentCompletion(userID, pid)
		// Best-effort: same certificate auto-issue trigger as
		// activityprogress's call site - see certificate_bridge.go.
		go triggerCertificateAutoIssue(userID, pid)
	}

	// "highest"/"average" scoring methods affect what's SHOWN as the
	// participant's standing across attempts, not what's stored per-attempt -
	// each attempt is scored on its own merits; aggregation happens in
	// getMyAssessmentsService (best score) and here for the immediate result.
	// For a pending_review attempt the "best/average" display would be
	// misleading (the open portion isn't scored yet), so we show this attempt's
	// own objective standing verbatim and let the results screen render the
	// "awaiting faculty review" state from Status. The highest/average display
	// aggregation only applies once attempts are actually final.
	displayScorePct := scorePct
	displayPassed := passed
	if !hasOpen {
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
	}

	return &AssessmentResultDTO{
		ActivityID: act.ID, Title: act.Title,
		Score: score, MaxScore: maxScore, ScorePct: displayScorePct, Passed: displayPassed,
		Status:        status,
		TimedOut:      timedOut,
		AttemptNumber: attempt.AttemptNumber, AttemptsLeft: cfg.AttemptsAllowed - attempt.AttemptNumber,
		Questions: results,
	}, nil
}
