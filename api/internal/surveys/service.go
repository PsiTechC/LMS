package surveys

import (
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
)

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

// ── helpers ───────────────────────────────────────────────────────

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
