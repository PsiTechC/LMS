package surveys

import (
	"encoding/json"
	"errors"
	"math"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
)

// listAdminSurveysService assembles the superadmin cross-org survey list.
// orgID "" = all orgs (the "All Orgs" header option). All values are real.
func listAdminSurveysService(orgID string) ([]AdminSurveyDTO, error) {
	rows, err := listAdminSurveys(orgID)
	if err != nil {
		return nil, err
	}
	now := time.Now()
	out := make([]AdminSurveyDTO, 0, len(rows))
	for _, r := range rows {
		dto := AdminSurveyDTO{
			ActivityID:    r.ActivityID,
			Title:         r.Title,
			Program:       r.ProgramTitle,
			ProgramID:     r.ProgramID,
			Org:           r.OrgName,
			OrgID:         r.OrgID,
			SurveyType:    r.SurveyType,
			Responses:     r.Completions,
			TotalEnrolled: r.TotalEnrolled,
			Faculty:       r.FacultyCount,
			Cohorts:       r.CohortCount,
		}
		if r.TotalEnrolled > 0 {
			dto.Completion = int(math.Round(float64(r.Completions) / float64(r.TotalEnrolled) * 100))
		}
		if r.AvgScore != nil {
			dto.AvgScore = math.Round(*r.AvgScore*10) / 10
		}
		if r.CloseDate != nil {
			dto.CloseDate = r.CloseDate.Format("2006-01-02")
		}
		// Closed when the program is archived/delivered or the close date passed.
		closed := r.ProgramStatus == "archived" || r.ProgramStatus == "delivered" ||
			(r.CloseDate != nil && r.CloseDate.Before(now))
		if closed {
			dto.Status = "closed"
		} else {
			dto.Status = "active"
		}
		out = append(out, dto)
	}
	return out, nil
}

var (
	ErrForbidden  = errors.New("forbidden")
	ErrValidation = errors.New("validation error")
)

// surveyCfg mirrors programs.SurveyConfig (modules can't import each other, so
// we parse the config JSON locally).
type surveyCfg struct {
	IsAnonymous      bool   `json:"is_anonymous"`
	SurveyType       string `json:"survey_type"`
	TimeEstimateMins int    `json:"time_estimate_mins"`
}

func parseConfig(raw []byte) surveyCfg {
	var c surveyCfg
	if len(raw) > 0 {
		_ = json.Unmarshal(raw, &c)
	}
	if c.SurveyType == "" {
		c.SurveyType = "pulse"
	}
	return c
}

// getMySurveysService assembles the participant's survey list with real due
// dates, status, and completion stats. programID (optional) scopes to the
// program the participant is currently viewing.
func getMySurveysService(userID uuid.UUID, programID *uuid.UUID) (*MySurveysDTO, error) {
	dto := &MySurveysDTO{Surveys: []SurveyCardDTO{}}

	prog, err := findMyProgram(userID, programID)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return dto, nil
		}
		return nil, err
	}
	dto.HasProgram = true
	progID := uuid.MustParse(prog.ProgramID)

	acts, err := listSurveyActivities(progID)
	if err != nil {
		return nil, err
	}

	ids := make([]uuid.UUID, 0, len(acts))
	for _, a := range acts {
		ids = append(ids, uuid.MustParse(a.ID))
	}
	completed, err := completedActivityIDs(userID, ids)
	if err != nil {
		return nil, err
	}

	now := time.Now()
	for _, a := range acts {
		cfg := parseConfig(a.Config)
		qCount, _ := countQuestions(uuid.MustParse(a.ID))
		card := SurveyCardDTO{
			ActivityID:    a.ID,
			Title:         a.Title,
			SurveyType:    cfg.SurveyType,
			IsAnonymous:   cfg.IsAnonymous,
			TimeEstimate:  cfg.TimeEstimateMins,
			QuestionCount: qCount,
		}

		// Due date = cohort start + (start_day + due_day_offset).
		var due *time.Time
		if prog.CohortStart != nil {
			d := prog.CohortStart.AddDate(0, 0, a.StartDay+a.DueDayOffset)
			due = &d
			s := d.Format("2006-01-02")
			card.DueDate = &s
		}

		if ct, ok := completed[a.ID]; ok {
			card.Status = "completed"
			s := ct.Format("2006-01-02")
			card.CompletedDate = &s
			dto.Completed++
		} else {
			// Opens on its start day; "active" once open, "upcoming" before.
			openDate := (*time.Time)(nil)
			if prog.CohortStart != nil {
				od := prog.CohortStart.AddDate(0, 0, a.StartDay)
				openDate = &od
			}
			if openDate != nil && now.Before(*openDate) {
				card.Status = "upcoming"
			} else {
				card.Status = "active"
				dto.ActionRequired++
			}
			_ = due
		}

		dto.Surveys = append(dto.Surveys, card)
	}

	dto.Total = len(dto.Surveys)
	if dto.Total > 0 {
		dto.CompletionRate = int(float64(dto.Completed) / float64(dto.Total) * 100)
	}
	return dto, nil
}

// getSurveyDetailService returns the full survey (with questions) for the modal.
func getSurveyDetailService(userID uuid.UUID, activityIDStr string) (*SurveyDetailDTO, error) {
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

	act, err := getSurveyActivity(activityID)
	if err != nil {
		return nil, err
	}
	cfg := parseConfig(act.Config)

	qs, err := listQuestions(activityID)
	if err != nil {
		return nil, err
	}

	// Prior answers (identified surveys only).
	var prior map[string]SurveyResponse
	if !cfg.IsAnonymous {
		prior, _ = myAnswers(activityID, userID)
	}

	_, cErr := getCompletion(activityID, userID)
	completed := cErr == nil

	detail := &SurveyDetailDTO{
		ActivityID:   act.ID,
		Title:        act.Title,
		SurveyType:   cfg.SurveyType,
		IsAnonymous:  cfg.IsAnonymous,
		TimeEstimate: cfg.TimeEstimateMins,
		Completed:    completed,
		Questions:    make([]QuestionDTO, 0, len(qs)),
	}
	for _, q := range qs {
		qd := QuestionDTO{ID: q.ID.String(), Type: q.Type, Text: q.Text, Options: parseOptions(q.Options)}
		if prior != nil {
			if r, ok := prior[q.ID.String()]; ok {
				qd.AnswerNum = r.AnswerNum
				qd.AnswerText = r.AnswerText
			}
		}
		detail.Questions = append(detail.Questions, qd)
	}
	return detail, nil
}

// submitSurveyService validates + records a participant's survey submission.
func submitSurveyService(userID uuid.UUID, req SubmitSurveyRequest) (*MySurveysDTO, error) {
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

	act, err := getSurveyActivity(activityID)
	if err != nil {
		return nil, err
	}
	cfg := parseConfig(act.Config)

	// Validate question IDs belong to this survey.
	qs, err := listQuestions(activityID)
	if err != nil {
		return nil, err
	}
	valid := map[string]bool{}
	for _, q := range qs {
		valid[q.ID.String()] = true
	}

	responses := make([]SurveyResponse, 0, len(req.Answers))
	for _, a := range req.Answers {
		if !valid[a.QuestionID] {
			return nil, ErrValidation
		}
		qid, err := uuid.Parse(a.QuestionID)
		if err != nil {
			return nil, ErrValidation
		}
		r := SurveyResponse{
			ID: uuid.New(), QuestionID: qid, ActivityID: activityID,
			AnswerNum: a.Num, CreatedAt: time.Now(),
		}
		if a.Text != nil && strings.TrimSpace(*a.Text) != "" {
			t := *a.Text
			r.AnswerText = &t
		}
		// Identified surveys link the response to the participant; anonymous
		// surveys keep participant_id NULL (aggregate-only).
		if !cfg.IsAnonymous {
			pid := userID
			r.ParticipantID = &pid
		}
		responses = append(responses, r)
	}

	if err := submitSurvey(activityID, userID, cfg.IsAnonymous, responses); err != nil {
		return nil, err
	}
	// Return the list scoped to the survey's own program so the completed card
	// reflects correctly for the program the participant is viewing.
	pid, perr := programIDForActivity(activityID)
	if perr != nil {
		return getMySurveysService(userID, nil)
	}
	return getMySurveysService(userID, &pid)
}

// setQuestionsService (PM/faculty) replaces the question set for a survey.
func setQuestionsService(activityIDStr string, req SetQuestionsRequest) error {
	activityID, err := uuid.Parse(activityIDStr)
	if err != nil {
		return ErrValidation
	}
	if _, err := getSurveyActivity(activityID); err != nil {
		return err
	}
	qs := make([]SurveyQuestion, 0, len(req.Questions))
	for i, q := range req.Questions {
		if !validQuestionType(q.Type) || strings.TrimSpace(q.Text) == "" {
			return ErrValidation
		}
		opts, _ := json.Marshal(q.Options)
		if q.Options == nil {
			opts = []byte("[]")
		}
		qs = append(qs, SurveyQuestion{
			ID: uuid.New(), ActivityID: activityID, Type: q.Type, Text: q.Text,
			Options: opts, SortOrder: i, CreatedAt: time.Now(),
		})
	}
	return replaceQuestions(activityID, qs)
}

// getSurveyResultsService aggregates a survey's answers per question for the
// superadmin View Results modal. All values are real (survey_responses).
func getSurveyResultsService(activityIDStr string) (*SurveyResultsDTO, error) {
	activityID, err := uuid.Parse(activityIDStr)
	if err != nil {
		return nil, ErrValidation
	}
	meta, err := getAdminSurveyMeta(activityID)
	if err != nil {
		return nil, err
	}
	qs, err := listQuestions(activityID)
	if err != nil {
		return nil, err
	}
	responses, err := listResponsesForActivity(activityID)
	if err != nil {
		return nil, err
	}
	roster, err := surveyRoster(activityID)
	if err != nil {
		return nil, err
	}
	faculty, err := surveyFaculty(activityID)
	if err != nil {
		return nil, err
	}
	if faculty == nil {
		faculty = []string{}
	}

	byQ := map[string][]SurveyResponse{}
	for _, r := range responses {
		byQ[r.QuestionID.String()] = append(byQ[r.QuestionID.String()], r)
	}

	dto := &SurveyResultsDTO{
		ActivityID:    meta.ActivityID,
		Title:         meta.Title,
		Program:       meta.ProgramTitle,
		Org:           meta.OrgName,
		SurveyType:    meta.SurveyType,
		TotalEnrolled: meta.TotalEnrolled,
		Responses:     meta.Completions,
		Faculty:       faculty,
		Roster:        make([]RosterEntryDTO, 0, len(roster)),
		Questions:     make([]QuestionResultDTO, 0, len(qs)),
	}
	for _, r := range roster {
		dto.Roster = append(dto.Roster, RosterEntryDTO{
			Name: r.Name, Email: r.Email, Cohort: r.Cohort, Responded: r.Responded,
		})
	}
	if meta.TotalEnrolled > 0 {
		dto.Completion = int(math.Round(float64(meta.Completions) / float64(meta.TotalEnrolled) * 100))
	}

	for _, q := range qs {
		rs := byQ[q.ID.String()]
		qr := QuestionResultDTO{ID: q.ID.String(), Type: q.Type, Text: q.Text, ResponseCount: len(rs)}

		switch q.Type {
		case "open":
			for _, r := range rs {
				if r.AnswerText != nil && strings.TrimSpace(*r.AnswerText) != "" {
					qr.TextAnswers = append(qr.TextAnswers, *r.AnswerText)
				}
			}
		case "mcq":
			opts := parseOptions(q.Options)
			counts := make([]int, len(opts))
			for _, r := range rs {
				if r.AnswerNum != nil {
					idx := int(*r.AnswerNum)
					if idx >= 0 && idx < len(opts) {
						counts[idx]++
					}
				}
			}
			for i, o := range opts {
				qr.Distribution = append(qr.Distribution, DistBucket{Label: o, Value: float64(i), Count: counts[i]})
			}
		default: // likert | nps | rating — numeric distribution + average
			bucket := map[float64]int{}
			var sum float64
			var n int
			for _, r := range rs {
				if r.AnswerNum != nil {
					bucket[*r.AnswerNum]++
					sum += *r.AnswerNum
					n++
				}
			}
			keys := make([]float64, 0, len(bucket))
			for k := range bucket {
				keys = append(keys, k)
			}
			sort.Float64s(keys)
			for _, k := range keys {
				qr.Distribution = append(qr.Distribution, DistBucket{Label: fmtNum(k), Value: k, Count: bucket[k]})
			}
			if n > 0 {
				avg := math.Round(sum/float64(n)*10) / 10
				qr.Average = &avg
			}
		}
		dto.Questions = append(dto.Questions, qr)
	}
	return dto, nil
}

// remindSurveyService sends an in-app reminder to every enrolled participant who
// has not yet completed the survey. Returns the number of notifications sent.
func remindSurveyService(activityIDStr string) (*RemindResponseDTO, error) {
	activityID, err := uuid.Parse(activityIDStr)
	if err != nil {
		return nil, ErrValidation
	}
	meta, err := getAdminSurveyMeta(activityID)
	if err != nil {
		return nil, err
	}
	users, err := enrolledIncompleteUsers(activityID)
	if err != nil {
		return nil, err
	}
	title := "Reminder: complete “" + meta.Title + "”"
	body := "You have a pending survey in " + meta.ProgramTitle + ". Please take a moment to complete it."
	sent, err := createReminders(users, title, body)
	if err != nil {
		return nil, err
	}
	return &RemindResponseDTO{Sent: sent}, nil
}

// ── helpers ───────────────────────────────────────────────────────

// fmtNum renders a numeric answer value as a compact label (5 not 5.0).
func fmtNum(f float64) string {
	if f == math.Trunc(f) {
		return strconv.FormatInt(int64(f), 10)
	}
	return strconv.FormatFloat(f, 'f', 1, 64)
}

func parseOptions(raw []byte) []string {
	var opts []string
	if len(raw) > 0 {
		_ = json.Unmarshal(raw, &opts)
	}
	return opts
}

func validQuestionType(t string) bool {
	switch t {
	case "likert", "nps", "mcq", "rating", "open":
		return true
	}
	return false
}
