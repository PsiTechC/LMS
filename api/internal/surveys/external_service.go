package surveys

import (
	"fmt"
	"log"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/xa-lms/api/pkg/database"
	"github.com/xa-lms/api/pkg/email"
)

// External (non-platform) respondent flow: a facilitator/manager/business
// sponsor answers the SAME question set a participant would, via a public
// token link instead of logging in - mirrors feedback360's rater mechanism
// (see api/internal/feedback360/rater_service.go). Only activities whose
// SurveyConfig has ExternalLinkEnabled=true may have respondents nominated.

// caller identifies who's making an external-respondent management call - a
// participant is scoped to activities they're enrolled in (checkCallerAccess
// below); PM/faculty/superadmin act at the role level, same breadth
// setQuestionsService already grants that role set for authoring.
type caller struct {
	UserID uuid.UUID
	Role   string
}

// checkCallerAccess enforces that a participant caller may only manage
// external respondents on an activity they're enrolled in - the same
// enrollment check submitSurveyService/getSurveyDetailService already apply
// on the participant-facing paths. Non-participant roles are role-gated by
// the route's HybridPermission and get no further per-activity check here,
// matching setQuestionsService's existing PM/faculty authoring access.
func checkCallerAccess(who caller, activityID uuid.UUID) error {
	if who.Role != "participant" {
		return nil
	}
	ok, err := isEnrolledInActivityProgram(who.UserID, activityID)
	if err != nil {
		return err
	}
	if !ok {
		return ErrForbidden
	}
	return nil
}

// addExternalRespondentService nominates an external respondent for a survey
// activity and emails them their token link in the background. Callable by
// the enrolled participant (nominating their own manager/sponsor) or by
// PM/faculty/superadmin (RBAC-gated at the route, scope-checked here).
func addExternalRespondentService(who caller, activityIDStr string, req AddExternalRespondentRequest) (*ExternalRespondentDTO, error) {
	activityID, err := uuid.Parse(activityIDStr)
	if err != nil {
		return nil, ErrValidation
	}
	if err := checkCallerAccess(who, activityID); err != nil {
		return nil, err
	}
	title, rawConfig, err := activityTitleAndConfig(activityID)
	if err != nil {
		return nil, err
	}
	cfg := parseConfig(rawConfig)
	if !cfg.ExternalLinkEnabled {
		return nil, fmt.Errorf("%w: this survey does not have an external link enabled", ErrValidation)
	}
	name := strings.TrimSpace(req.Name)
	respEmail := strings.TrimSpace(req.Email)
	if name == "" || respEmail == "" {
		return nil, fmt.Errorf("%w: name and email are required", ErrValidation)
	}
	r := &SurveyExternalRespondent{
		ID:          uuid.New(),
		ActivityID:  activityID,
		Name:        name,
		Email:       respEmail,
		RoleLabel:   strings.TrimSpace(req.RoleLabel),
		Status:      "pending",
		InviteToken: uuid.New(),
		CreatedAt:   time.Now(),
	}
	if err := createExternalRespondent(r); err != nil {
		return nil, err
	}
	sendExternalInviteEmail(r, title)
	return toExternalRespondentDTO(r), nil
}

func listExternalRespondentsService(who caller, activityIDStr string) ([]ExternalRespondentDTO, error) {
	activityID, err := uuid.Parse(activityIDStr)
	if err != nil {
		return nil, ErrValidation
	}
	if err := checkCallerAccess(who, activityID); err != nil {
		return nil, err
	}
	rows, err := listExternalRespondents(activityID)
	if err != nil {
		return nil, err
	}
	out := make([]ExternalRespondentDTO, 0, len(rows))
	for i := range rows {
		out = append(out, *toExternalRespondentDTO(&rows[i]))
	}
	return out, nil
}

func removeExternalRespondentService(who caller, activityIDStr, respondentIDStr string) error {
	activityID, err := uuid.Parse(activityIDStr)
	if err != nil {
		return ErrValidation
	}
	if err := checkCallerAccess(who, activityID); err != nil {
		return err
	}
	respondentID, err := uuid.Parse(respondentIDStr)
	if err != nil {
		return ErrValidation
	}
	r, err := getExternalRespondentByID(respondentID)
	if err != nil {
		return err
	}
	if r.ActivityID != activityID {
		return ErrForbidden
	}
	return deleteExternalRespondent(respondentID)
}

func remindExternalRespondentService(who caller, activityIDStr, respondentIDStr string) error {
	activityID, err := uuid.Parse(activityIDStr)
	if err != nil {
		return ErrValidation
	}
	if err := checkCallerAccess(who, activityID); err != nil {
		return err
	}
	respondentID, err := uuid.Parse(respondentIDStr)
	if err != nil {
		return ErrValidation
	}
	r, err := getExternalRespondentByID(respondentID)
	if err != nil {
		return err
	}
	if r.ActivityID != activityID {
		return ErrForbidden
	}
	if r.Status == "submitted" {
		return fmt.Errorf("%w: nothing to remind", ErrValidation)
	}
	title, _, err := activityTitleAndConfig(activityID)
	if err != nil {
		return err
	}
	if err := markExternalRespondentReminded(respondentID); err != nil {
		return err
	}
	sendExternalReminderEmail(r, title)
	return nil
}

func toExternalRespondentDTO(r *SurveyExternalRespondent) *ExternalRespondentDTO {
	dto := &ExternalRespondentDTO{
		ID: r.ID.String(), Name: r.Name, Email: r.Email,
		RoleLabel: r.RoleLabel, Status: r.Status,
	}
	if r.RemindedAt != nil {
		s := r.RemindedAt.Format(time.RFC3339)
		dto.RemindedAt = &s
	}
	if r.SubmittedAt != nil {
		s := r.SubmittedAt.Format(time.RFC3339)
		dto.SubmittedAt = &s
	}
	return dto
}

// ── Public form (token-based) ──────────────────────────────────────

// getExternalFormService renders the form from the activity's live question
// set. Viewing never consumes the token (mail scanners pre-fetch links) -
// only submit does. An invalid token returns ErrNotFound; the handler turns
// that into a generic "this link isn't valid" message that never reveals
// whether it expired, never existed, or was malformed (same anti-enumeration
// posture as feedback360's rater form).
func getExternalFormService(token uuid.UUID) (*ExternalFormDTO, error) {
	r, err := getExternalRespondentByToken(token)
	if err != nil {
		return nil, err
	}
	title, _, err := activityTitleAndConfig(r.ActivityID)
	if err != nil {
		return nil, err
	}
	dto := &ExternalFormDTO{
		Title: title, RoleLabel: r.RoleLabel,
		AlreadySubmitted: r.Status == "submitted",
		Questions:        []QuestionDTO{},
	}
	if dto.AlreadySubmitted {
		return dto, nil
	}
	qs, err := listQuestions(r.ActivityID)
	if err != nil {
		return nil, err
	}
	for _, q := range qs {
		dto.Questions = append(dto.Questions, QuestionDTO{
			ID: q.ID.String(), Type: q.Type, Text: q.Text, Options: parseOptions(q.Options),
		})
	}
	return dto, nil
}

// submitExternalService validates + records an external respondent's answers.
// Runs the SAME open-date gate submitSurveyService enforces for participants
// (cohort_start + activity.start_day) - an external respondent must not be
// able to submit before the activity has opened, same as a participant.
func submitExternalService(token uuid.UUID, req SubmitExternalRequest) error {
	r, err := getExternalRespondentByToken(token)
	if err != nil {
		return err
	}
	if r.Status == "submitted" {
		return fmt.Errorf("%w: this feedback has already been submitted", ErrValidation)
	}

	act, err := getSurveyActivity(r.ActivityID)
	if err != nil {
		return err
	}
	if cohortStart, cerr := cohortStartForActivityAny(r.ActivityID); cerr == nil && cohortStart != nil {
		openDate := cohortStart.AddDate(0, 0, act.StartDay)
		if time.Now().Before(openDate) {
			return ErrNotOpenYet
		}
	}

	qs, err := listQuestions(r.ActivityID)
	if err != nil {
		return err
	}
	valid := map[string]bool{}
	for _, q := range qs {
		valid[q.ID.String()] = true
	}

	responses := make([]SurveyResponse, 0, len(req.Answers))
	for _, a := range req.Answers {
		if !valid[a.QuestionID] {
			return ErrValidation
		}
		qid, err := uuid.Parse(a.QuestionID)
		if err != nil {
			return ErrValidation
		}
		resp := SurveyResponse{
			ID: uuid.New(), QuestionID: qid, ActivityID: r.ActivityID,
			ExternalRespondentID: &r.ID, AnswerNum: a.Num, CreatedAt: time.Now(),
		}
		if a.Text != nil && strings.TrimSpace(*a.Text) != "" {
			t := *a.Text
			resp.AnswerText = &t
		}
		responses = append(responses, resp)
	}

	return submitExternalResponses(r.ID, responses)
}

// ── Invite / reminder emails ───────────────────────────────────────

func externalLinkBaseURL() string {
	if v := strings.TrimRight(os.Getenv("APP_BASE_URL"), "/"); v != "" {
		return v
	}
	return "http://localhost:3000"
}

func externalRespondentLink(token uuid.UUID) string {
	return fmt.Sprintf("%s/survey-external/%s", externalLinkBaseURL(), token.String())
}

func orgNameForActivity(activityID uuid.UUID) string {
	var name string
	_ = database.DB.Raw(`
		SELECT o.name FROM activities a
		JOIN program_phases pp ON pp.id = a.phase_id
		JOIN programs pr       ON pr.id = pp.program_id
		JOIN organizations o   ON o.id = pr.org_id
		WHERE a.id = ?
	`, activityID).Scan(&name).Error
	return name
}

// sendExternalInviteEmail mails an external respondent their unique form
// link. Dispatched in the background so nominating a respondent returns
// immediately (same pattern as feedback360.sendRaterInviteEmail).
func sendExternalInviteEmail(r *SurveyExternalRespondent, formTitle string) {
	orgName := orgNameForActivity(r.ActivityID)
	link := externalRespondentLink(r.InviteToken)
	to, name, role := r.Email, r.Name, r.RoleLabel
	go func() {
		html := email.ExternalSurveyInviteTemplate(name, role, orgName, formTitle, link)
		if err := email.Send(to, "You've been asked to complete a feedback form", html); err != nil {
			log.Printf("surveys: external respondent invite email to %s failed: %v", to, err)
		}
	}()
}

func sendExternalReminderEmail(r *SurveyExternalRespondent, formTitle string) {
	orgName := orgNameForActivity(r.ActivityID)
	link := externalRespondentLink(r.InviteToken)
	to, name, role := r.Email, r.Name, r.RoleLabel
	go func() {
		html := email.ExternalSurveyReminderTemplate(name, role, orgName, formTitle, link)
		if err := email.Send(to, "Reminder: your feedback form is still pending", html); err != nil {
			log.Printf("surveys: external respondent reminder email to %s failed: %v", to, err)
		}
	}()
}

// ── Abuse guard: per-token + per-IP submission rate limiting ──────
// Copied from feedback360's rateLimiter (api/internal/feedback360/rater_service.go) -
// modules never import each other's Go package, so this ~50-line struct is
// duplicated rather than shared, per the codebase's module-isolation rule.

type externalRateLimiter struct {
	mu   sync.Mutex
	hits map[string][]time.Time
}

var externalSubmitLimiter = &externalRateLimiter{hits: map[string][]time.Time{}}

const (
	externalRateWindow   = 10 * time.Minute
	externalRateMaxHits  = 10
	externalRateSweepCap = 5000
)

// Allow reports whether key may act now, recording the attempt if so.
func (rl *externalRateLimiter) Allow(key string) bool {
	now := time.Now()
	rl.mu.Lock()
	defer rl.mu.Unlock()

	if len(rl.hits) > externalRateSweepCap {
		for k, ts := range rl.hits {
			if len(ts) == 0 || now.Sub(ts[len(ts)-1]) > externalRateWindow {
				delete(rl.hits, k)
			}
		}
	}

	fresh := rl.hits[key][:0]
	for _, t := range rl.hits[key] {
		if now.Sub(t) < externalRateWindow {
			fresh = append(fresh, t)
		}
	}
	if len(fresh) >= externalRateMaxHits {
		rl.hits[key] = fresh
		return false
	}
	rl.hits[key] = append(fresh, now)
	return true
}
