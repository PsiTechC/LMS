package surveys

import (
	"encoding/json"
	"errors"
	"log"
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
	// ErrNotOpenYet is returned when a participant tries to submit a survey
	// before its computed open date (cohort_start + start_day). Previously
	// unenforced - the open/due dates shown on the participant's Surveys tab
	// were purely cosmetic (a hidden button, not a real gate), so a direct
	// API call could submit an "upcoming" survey early.
	ErrNotOpenYet = errors.New("this survey is not open yet")
)

// surveyCfg mirrors programs.SurveyConfig (modules can't import each other, so
// we parse the config JSON locally).
type surveyCfg struct {
	AssetID             string `json:"asset_id"`
	IsAnonymous         bool   `json:"is_anonymous"`
	SurveyType          string `json:"survey_type"`
	TimeEstimateMins    int    `json:"time_estimate_mins"`
	Level               string `json:"level"`
	ExternalLinkEnabled bool   `json:"external_link_enabled"`
}

// contentQuestion mirrors content.Question (modules can't import each
// other's Go package - parsed locally from content_assets.meta jsonb).
type contentQuestion struct {
	ID        string   `json:"id"`
	Type      string   `json:"type"` // mcq | true_false | matching | open | scale
	Text      string   `json:"text"`
	Section   string   `json:"section,omitempty"`
	Options   []string `json:"options,omitempty"`
	ScaleMin  *int     `json:"scale_min,omitempty"`
	ScaleMax  *int     `json:"scale_max,omitempty"`
	SortOrder int      `json:"sort_order"`
}
type contentQuestionSet struct {
	Questions []contentQuestion `json:"questions"`
}

// contentAssetMeta mirrors the top level of content_assets.meta as written by
// content.buildMetaJSON - questions live nested under "question_set", not at
// the top level (meta also carries question_count, duration_mins, etc.
// alongside it depending on asset type).
type contentAssetMeta struct {
	QuestionSet *contentQuestionSet `json:"question_set"`
}

// contentTypeToSurveyType maps a Content Library question type to the
// survey module's own type vocabulary (likert | nps | mcq | rating | open) -
// there's no dedicated true_false/matching renderer in the survey-taking UI,
// so those become a 2-option mcq (a straightforward, already-supported shape)
// rather than requiring new question-type UI.
func contentTypeToSurveyType(q contentQuestion) (surveyType string, options []string) {
	switch q.Type {
	case "scale":
		// A 1-5 scale (the common case) maps to the existing Likert control;
		// anything else falls back to a plain numeric answer via "rating".
		if q.ScaleMin != nil && q.ScaleMax != nil && *q.ScaleMin == 1 && *q.ScaleMax == 5 {
			return "likert", nil
		}
		return "rating", nil
	case "mcq":
		return "mcq", q.Options
	case "true_false":
		return "mcq", []string{"True", "False"}
	case "open":
		return "open", nil
	default: // matching or any future type - no dedicated survey renderer yet
		return "open", nil
	}
}

// ensureQuestionsFromAsset materializes a Content-Library-authored quiz/
// survey asset's question set into real survey_questions rows, the FIRST
// time a survey activity with a linked AssetID is viewed and has no
// directly-authored questions yet. After that, it behaves identically to a
// directly-authored survey (submissions, results aggregation, etc. all work
// unchanged) - direct authoring via PUT /:activityId/questions always takes
// precedence and is never overwritten by this.
func ensureQuestionsFromAsset(activityID uuid.UUID, cfg surveyCfg) {
	if cfg.AssetID == "" {
		return
	}
	existing, err := countQuestions(activityID)
	if err != nil || existing > 0 {
		return
	}
	assetID, err := uuid.Parse(cfg.AssetID)
	if err != nil {
		return
	}
	meta, err := getAssetMeta(assetID)
	if err != nil {
		return
	}
	var am contentAssetMeta
	if err := json.Unmarshal(meta, &am); err != nil || am.QuestionSet == nil || len(am.QuestionSet.Questions) == 0 {
		return
	}
	qs := *am.QuestionSet

	rows := make([]SurveyQuestion, 0, len(qs.Questions))
	for i, q := range qs.Questions {
		surveyType, opts := contentTypeToSurveyType(q)
		optsJSON, _ := json.Marshal(opts)
		if opts == nil {
			optsJSON = []byte("[]")
		}
		rows = append(rows, SurveyQuestion{
			ID: uuid.New(), ActivityID: activityID, Type: surveyType, Text: q.Text,
			Section: q.Section,
			Options: optsJSON, SortOrder: i, CreatedAt: time.Now(),
		})
	}
	// Best-effort - if this fails, the survey just has zero questions (same
	// as today's behavior for an activity nobody has authored yet).
	if err := replaceQuestions(activityID, rows); err != nil {
		log.Printf("ensureQuestionsFromAsset: replaceQuestions failed for activity %s: %v", activityID, err)
	}
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
	var postModuleIDs []string
	seenModule := map[string]bool{}
	for _, a := range acts {
		ids = append(ids, uuid.MustParse(a.ID))
		if a.Slot == "post" && a.ModuleID != nil && !seenModule[*a.ModuleID] {
			seenModule[*a.ModuleID] = true
			postModuleIDs = append(postModuleIDs, *a.ModuleID)
		}
	}
	completed, err := completedActivityIDs(userID, ids)
	if err != nil {
		return nil, err
	}
	moduleDone, err := modulePreWorkDoneMap(userID, progID, postModuleIDs)
	if err != nil {
		moduleDone = map[string]bool{} // best-effort - leave everything unlocked rather than fail the whole list
	}

	now := time.Now()
	for _, a := range acts {
		cfg := parseConfig(a.Config)
		activityID := uuid.MustParse(a.ID)
		ensureQuestionsFromAsset(activityID, cfg)
		qCount, _ := countQuestions(activityID)
		card := SurveyCardDTO{
			ActivityID:          a.ID,
			Title:               a.Title,
			SurveyType:          cfg.SurveyType,
			IsAnonymous:         cfg.IsAnonymous,
			TimeEstimate:        cfg.TimeEstimateMins,
			QuestionCount:       qCount,
			Level:               cfg.Level,
			ExternalLinkEnabled: cfg.ExternalLinkEnabled,
		}
		if a.Slot == "post" && a.ModuleID != nil && !moduleDone[*a.ModuleID] {
			card.Locked = true
			card.LockedReason = "Complete this module's pre-work first"
		}

		// Opens on its start day; due on start day + due_day_offset. Both are
		// exposed to the client (OpenDate/DueDate) - a survey's card previously
		// showed "Opens {due_date}" because only the due date was ever computed
		// and there was no separate open_date field to show instead.
		var openDate, due *time.Time
		if prog.CohortStart != nil {
			od := prog.CohortStart.AddDate(0, 0, a.StartDay)
			openDate = &od
			s := od.Format("2006-01-02")
			card.OpenDate = &s

			d := prog.CohortStart.AddDate(0, 0, a.StartDay+a.DueDayOffset)
			due = &d
			s2 := d.Format("2006-01-02")
			card.DueDate = &s2
		}

		_ = due
		if ct, ok := completed[a.ID]; ok {
			card.Status = "completed"
			s := ct.Format("2006-01-02")
			card.CompletedDate = &s
			dto.Completed++
		} else if openDate != nil && now.Before(*openDate) {
			card.Status = "upcoming"
		} else if card.Locked {
			// Date-wise open, but its module's pre-work isn't done yet - stays
			// "active" (the date is accurate) but excluded from the action-
			// required count, since there's nothing the participant can do
			// with it until it unlocks.
			card.Status = "active"
		} else {
			card.Status = "active"
			dto.ActionRequired++
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
	ensureQuestionsFromAsset(activityID, cfg)

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
		qd := QuestionDTO{ID: q.ID.String(), Type: q.Type, Text: q.Text, Section: q.Section, Options: parseOptions(q.Options)}
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

	// Enforce the open date shown on the participant's card - same
	// cohort_start + start_day computation getMySurveysService uses, so what
	// blocks submission here is exactly what the "Opens X" label promised.
	if cohortStart, cerr := cohortStartForActivity(userID, activityID); cerr == nil && cohortStart != nil {
		openDate := cohortStart.AddDate(0, 0, act.StartDay)
		if time.Now().Before(openDate) {
			return nil, ErrNotOpenYet
		}
	}

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
	// Keep enrollments.completion_percent in sync - previously only
	// activity_progress updates triggered this, so submitting a survey never
	// moved the needle on Program Progress/faculty rosters/analytics/risk
	// scoring even though the participant had genuinely made progress.
	recomputeEnrollmentCompletion(userID, pid)
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
			ID: uuid.New(), ActivityID: activityID, Type: q.Type, Text: q.Text, Section: q.Section,
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
	extRows, err := listExternalRespondents(activityID)
	if err != nil {
		return nil, err
	}
	external := make([]ExternalRespondentDTO, 0, len(extRows))
	for i := range extRows {
		external = append(external, *toExternalRespondentDTO(&extRows[i]))
	}

	byQ := map[string][]SurveyResponse{}
	for _, r := range responses {
		byQ[r.QuestionID.String()] = append(byQ[r.QuestionID.String()], r)
	}

	dto := &SurveyResultsDTO{
		ActivityID:          meta.ActivityID,
		Title:               meta.Title,
		Program:             meta.ProgramTitle,
		Org:                 meta.OrgName,
		SurveyType:          meta.SurveyType,
		TotalEnrolled:       meta.TotalEnrolled,
		Responses:           meta.Completions,
		Faculty:             faculty,
		Roster:              make([]RosterEntryDTO, 0, len(roster)),
		ExternalRespondents: external,
		Questions:           make([]QuestionResultDTO, 0, len(qs)),
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
		default: // likert | nps | rating - numeric distribution + average
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
func remindSurveyService(activityIDStr string, req *RemindSurveyRequest) (*RemindResponseDTO, error) {
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
	if req != nil && req.Title != nil && *req.Title != "" {
		title = *req.Title
	}
	
	body := "You have a pending survey in " + meta.ProgramTitle + ". Please take a moment to complete it."
	if req != nil && req.Body != nil && *req.Body != "" {
		body = *req.Body
	}
	
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
