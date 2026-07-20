package communications

import (
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/xa-lms/api/pkg/email"
)

// ── Template variable substitution ──────────────────────────────

func substituteVars(template string, vars map[string]string) string {
	result := template
	for k, v := range vars {
		result = strings.ReplaceAll(result, "{{"+k+"}}", v)
	}
	return result
}

// ── Email Templates ──────────────────────────────────────────────

func listTemplatesService(orgID string) ([]EmailTemplateDTO, error) {
	list, err := listTemplates(orgID)
	if err != nil {
		return nil, err
	}
	result := make([]EmailTemplateDTO, 0, len(list))
	for _, t := range list {
		result = append(result, templateToDTO(t))
	}
	return result, nil
}

func createTemplateService(req CreateTemplateRequest, createdBy string) (*EmailTemplateDTO, error) {
	if req.Name == "" || req.Subject == "" || req.BodyHTML == "" || req.OrgID == "" {
		return nil, fmt.Errorf("org_id, name, subject, body_html are required")
	}
	vars := req.Variables
	if vars == nil {
		vars = []string{}
	}
	t := &EmailTemplate{
		OrgID:     uuid.MustParse(req.OrgID),
		Name:      req.Name,
		Subject:   req.Subject,
		BodyHTML:  req.BodyHTML,
		Variables: vars,
		CreatedBy: uuid.MustParse(createdBy),
	}
	if err := createTemplate(t); err != nil {
		return nil, err
	}
	dto := templateToDTO(*t)
	return &dto, nil
}

func updateTemplateService(id string, req UpdateTemplateRequest) error {
	updates := map[string]interface{}{}
	if req.Name != "" {
		updates["name"] = req.Name
	}
	if req.Subject != "" {
		updates["subject"] = req.Subject
	}
	if req.BodyHTML != "" {
		updates["body_html"] = req.BodyHTML
	}
	if req.Variables != nil {
		updates["variables"] = req.Variables
	}
	return updateTemplate(id, updates)
}

func deleteTemplateService(id string) error {
	return deleteTemplate(id)
}

func templateToDTO(t EmailTemplate) EmailTemplateDTO {
	vars := t.Variables
	if vars == nil {
		vars = []string{}
	}
	return EmailTemplateDTO{
		ID:        t.ID.String(),
		OrgID:     t.OrgID.String(),
		Name:      t.Name,
		Subject:   t.Subject,
		BodyHTML:  t.BodyHTML,
		Variables: vars,
		CreatedBy: t.CreatedBy.String(),
		CreatedAt: t.CreatedAt,
		UpdatedAt: t.UpdatedAt,
	}
}

// ── Campaigns ────────────────────────────────────────────────────

func listCampaignsService(orgID string, page, perPage int) ([]EmailCampaignDTO, int64, error) {
	list, total, err := listCampaigns(orgID, page, perPage)
	if err != nil {
		return nil, 0, err
	}
	result := make([]EmailCampaignDTO, 0, len(list))
	for _, c := range list {
		result = append(result, campaignToDTO(c))
	}
	return result, total, nil
}

func createCampaignService(req CreateCampaignRequest, createdBy string) (*EmailCampaignDTO, error) {
	if req.OrgID == "" || req.Name == "" || req.Subject == "" || req.BodyHTML == "" {
		return nil, fmt.Errorf("org_id, name, subject, body_html are required")
	}
	c := &EmailCampaign{
		OrgID:     uuid.MustParse(req.OrgID),
		Name:      req.Name,
		Subject:   req.Subject,
		BodyHTML:  req.BodyHTML,
		Audience:  req.Audience,
		Status:    "draft",
		CreatedBy: uuid.MustParse(createdBy),
	}
	if c.Audience == "" {
		c.Audience = "all_participants"
	}
	if req.CohortID != "" {
		uid := uuid.MustParse(req.CohortID)
		c.CohortID = &uid
	}
	if req.TemplateID != "" {
		uid := uuid.MustParse(req.TemplateID)
		c.TemplateID = &uid
	}
	if err := createCampaign(c); err != nil {
		return nil, err
	}
	dto := campaignToDTO(*c)
	return &dto, nil
}

func updateCampaignService(id string, req UpdateCampaignRequest) error {
	updates := map[string]interface{}{}
	if req.Name != "" {
		updates["name"] = req.Name
	}
	if req.Subject != "" {
		updates["subject"] = req.Subject
	}
	if req.BodyHTML != "" {
		updates["body_html"] = req.BodyHTML
	}
	if req.Audience != "" {
		updates["audience"] = req.Audience
	}
	if req.CohortID != "" {
		uid := uuid.MustParse(req.CohortID)
		updates["cohort_id"] = uid
	}
	if req.TemplateID != "" {
		uid := uuid.MustParse(req.TemplateID)
		updates["template_id"] = uid
	}
	return updateCampaign(id, updates)
}

func sendCampaignService(id, senderUserID string) error {
	camp, err := getCampaign(id)
	if err != nil {
		return fmt.Errorf("campaign not found")
	}
	if camp.Status == "sent" {
		return fmt.Errorf("campaign already sent")
	}

	cohortID := ""
	if camp.CohortID != nil {
		cohortID = camp.CohortID.String()
	}

	// Update status to sending
	now := time.Now()
	if err := updateCampaign(id, map[string]interface{}{"status": "sending"}); err != nil {
		return err
	}

	// Launch goroutine for async sending
	go func() {
		var recipients []recipientRow
		var fetchErr error
		if cohortID != "" {
			recipients, fetchErr = getRecipients(cohortID, camp.Audience)
			if fetchErr != nil {
				log.Printf("campaign %s: failed to get recipients: %v", id, fetchErr)
				return
			}
		}

		// Get cohort meta for variable substitution
		cohortName := ""
		programTitle := ""
		if cohortID != "" {
			meta, metaErr := getCohortMeta(cohortID)
			if metaErr == nil {
				cohortName = meta.CohortName
				programTitle = meta.ProgramTitle
			}
		}

		sentCount := 0
		campUUID := uuid.MustParse(id)

		for _, r := range recipients {
			vars := map[string]string{
				"participant_name":   r.Name,
				"cohort_name":        cohortName,
				"program_title":      programTitle,
				"days_inactive":      fmt.Sprintf("%d", getDaysInactive(r.UserID)),
				"completion_percent": fmt.Sprintf("%.0f", r.CompletionPct),
			}
			subject := substituteVars(camp.Subject, vars)
			body := substituteVars(camp.BodyHTML, vars)

			errStr := ""
			sendErr := email.Send(r.Email, subject, body)
			if sendErr != nil {
				errStr = sendErr.Error()
				log.Printf("campaign %s: email to %s failed: %v", id, r.Email, sendErr)
			} else {
				sentCount++
			}

			userUID, parseErr := uuid.Parse(r.UserID)
			if parseErr != nil {
				continue
			}

			l := &NotificationLog{
				OrgID:          camp.OrgID,
				CampaignID:     &campUUID,
				UserID:         userUID,
				Channel:        "email",
				RecipientEmail: r.Email,
				Subject:        subject,
				Status:         "sent",
				ErrorMsg:       errStr,
				SentAt:         time.Now(),
			}
			if sendErr != nil {
				l.Status = "failed"
			}
			if logErr := createLog(l); logErr != nil {
				log.Printf("campaign %s: failed to write log: %v", id, logErr)
			}

			// Also create in-app notification
			notif := &InAppNotification{
				UserID:     userUID,
				Title:      subject,
				Body:       stripHTMLTags(body),
				Type:       "info",
				CampaignID: &campUUID,
			}
			if createErr := createInAppNotification(notif); createErr != nil {
				log.Printf("campaign %s: failed to create in-app notification: %v", id, createErr)
			}
		}

		// Update campaign: sent
		finalUpdates := map[string]interface{}{
			"status":          "sent",
			"sent_at":         now,
			"recipient_count": len(recipients),
			"sent_count":      sentCount,
		}
		if updateErr := updateCampaign(id, finalUpdates); updateErr != nil {
			log.Printf("campaign %s: failed to update status: %v", id, updateErr)
		}
	}()

	return nil
}

func scheduleCampaignService(id string, scheduledAt time.Time) error {
	return updateCampaign(id, map[string]interface{}{
		"status":       "scheduled",
		"scheduled_at": scheduledAt,
	})
}

func deleteCampaignService(id string) error {
	camp, err := getCampaign(id)
	if err != nil {
		return fmt.Errorf("campaign not found")
	}
	if camp.Status != "draft" {
		return fmt.Errorf("only draft campaigns can be deleted")
	}
	return deleteCampaign(id)
}

func campaignToDTO(c EmailCampaign) EmailCampaignDTO {
	dto := EmailCampaignDTO{
		ID:             c.ID.String(),
		OrgID:          c.OrgID.String(),
		Name:           c.Name,
		Subject:        c.Subject,
		BodyHTML:       c.BodyHTML,
		Audience:       c.Audience,
		Status:         c.Status,
		ScheduledAt:    c.ScheduledAt,
		SentAt:         c.SentAt,
		RecipientCount: c.RecipientCount,
		SentCount:      c.SentCount,
		CreatedBy:      c.CreatedBy.String(),
		CreatedAt:      c.CreatedAt,
		UpdatedAt:      c.UpdatedAt,
	}
	if c.CohortID != nil {
		s := c.CohortID.String()
		dto.CohortID = &s
	}
	if c.TemplateID != nil {
		s := c.TemplateID.String()
		dto.TemplateID = &s
	}
	return dto
}

// ── Automation Rules ─────────────────────────────────────────────

func listRulesService(orgID string) ([]AutomationRuleDTO, error) {
	list, err := listRules(orgID)
	if err != nil {
		return nil, err
	}
	result := make([]AutomationRuleDTO, 0, len(list))
	for _, r := range list {
		result = append(result, ruleToDTO(r))
	}
	return result, nil
}

func createRuleService(req CreateRuleRequest, createdBy string) (*AutomationRuleDTO, error) {
	if req.OrgID == "" || req.Name == "" || req.TriggerType == "" {
		return nil, fmt.Errorf("org_id, name, trigger_type are required")
	}
	configBytes, err := json.Marshal(req.TriggerConfig)
	if err != nil {
		configBytes = []byte("{}")
	}
	r := &AutomationRule{
		OrgID:          uuid.MustParse(req.OrgID),
		Name:           req.Name,
		IsActive:       req.IsActive,
		TriggerType:    req.TriggerType,
		TriggerConfig:  configBytes,
		Channel:        req.Channel,
		MessageSubject: req.MessageSubject,
		MessageBody:    req.MessageBody,
		CreatedBy:      uuid.MustParse(createdBy),
	}
	if r.Channel == "" {
		r.Channel = "email"
	}
	if req.TemplateID != "" {
		uid := uuid.MustParse(req.TemplateID)
		r.TemplateID = &uid
	}
	if err := createRule(r); err != nil {
		return nil, err
	}
	dto := ruleToDTO(*r)
	return &dto, nil
}

func updateRuleService(id string, req UpdateRuleRequest) error {
	updates := map[string]interface{}{}
	if req.Name != "" {
		updates["name"] = req.Name
	}
	if req.IsActive != nil {
		updates["is_active"] = *req.IsActive
	}
	if req.TriggerType != "" {
		updates["trigger_type"] = req.TriggerType
	}
	if req.TriggerConfig != nil {
		b, _ := json.Marshal(req.TriggerConfig)
		updates["trigger_config"] = string(b)
	}
	if req.Channel != "" {
		updates["channel"] = req.Channel
	}
	if req.MessageSubject != "" {
		updates["message_subject"] = req.MessageSubject
	}
	if req.MessageBody != "" {
		updates["message_body"] = req.MessageBody
	}
	if req.TemplateID != "" {
		uid := uuid.MustParse(req.TemplateID)
		updates["template_id"] = uid
	}
	return updateRule(id, updates)
}

func deleteRuleService(id string) error {
	return deleteRule(id)
}

func ruleToDTO(r AutomationRule) AutomationRuleDTO {
	config := parseTriggerConfig(r.TriggerConfig)
	dto := AutomationRuleDTO{
		ID:             r.ID.String(),
		OrgID:          r.OrgID.String(),
		Name:           r.Name,
		IsActive:       r.IsActive,
		TriggerType:    r.TriggerType,
		TriggerConfig:  config,
		Channel:        r.Channel,
		MessageSubject: r.MessageSubject,
		MessageBody:    r.MessageBody,
		LastRunAt:      r.LastRunAt,
		CreatedBy:      r.CreatedBy.String(),
		CreatedAt:      r.CreatedAt,
		UpdatedAt:      r.UpdatedAt,
	}
	if r.TemplateID != nil {
		s := r.TemplateID.String()
		dto.TemplateID = &s
	}
	return dto
}

// ── In-App Notifications ─────────────────────────────────────────

func listNotificationsService(userID string) ([]InAppNotificationDTO, error) {
	list, err := listInAppNotifications(userID)
	if err != nil {
		return nil, err
	}
	result := make([]InAppNotificationDTO, 0, len(list))
	for _, n := range list {
		result = append(result, notifToDTO(n))
	}
	return result, nil
}

func markReadService(id, userID string) error {
	return markNotificationRead(id, userID)
}

func markAllReadService(userID string) error {
	return markAllNotificationsRead(userID)
}

func notifToDTO(n InAppNotification) InAppNotificationDTO {
	dto := InAppNotificationDTO{
		ID:        n.ID.String(),
		UserID:    n.UserID.String(),
		Title:     n.Title,
		Body:      n.Body,
		Type:      n.Type,
		ReadAt:    n.ReadAt,
		CreatedAt: n.CreatedAt,
	}
	if n.RuleID != nil {
		s := n.RuleID.String()
		dto.RuleID = &s
	}
	if n.CampaignID != nil {
		s := n.CampaignID.String()
		dto.CampaignID = &s
	}
	return dto
}

// ── Notification Logs ────────────────────────────────────────────

func listLogsService(orgID, campaignID, ruleID string, page, perPage int) ([]NotificationLogDTO, int64, error) {
	list, total, err := listLogs(orgID, campaignID, ruleID, page, perPage)
	if err != nil {
		return nil, 0, err
	}
	result := make([]NotificationLogDTO, 0, len(list))
	for _, l := range list {
		result = append(result, logToDTO(l))
	}
	return result, total, nil
}

func logToDTO(l NotificationLog) NotificationLogDTO {
	dto := NotificationLogDTO{
		ID:             l.ID.String(),
		OrgID:          l.OrgID.String(),
		UserID:         l.UserID.String(),
		Channel:        l.Channel,
		RecipientEmail: l.RecipientEmail,
		Subject:        l.Subject,
		Status:         l.Status,
		ErrorMsg:       l.ErrorMsg,
		SentAt:         l.SentAt,
	}
	if l.CampaignID != nil {
		s := l.CampaignID.String()
		dto.CampaignID = &s
	}
	if l.RuleID != nil {
		s := l.RuleID.String()
		dto.RuleID = &s
	}
	return dto
}

// ── Background Rule Evaluator ────────────────────────────────────

func StartRuleEvaluator() {
	ticker := time.NewTicker(1 * time.Hour)
	defer ticker.Stop()
	log.Println("communications: rule evaluator started")
	for range ticker.C {
		runRuleEvaluator()
	}
}

func runRuleEvaluator() {
	rules, err := listActiveRules()
	if err != nil {
		log.Printf("rule evaluator: failed to list rules: %v", err)
		return
	}

	for _, rule := range rules {
		config := parseTriggerConfig(rule.TriggerConfig)
		var targets []ruleTargetRow

		switch rule.TriggerType {
		case "not_logged_in_N_days":
			days := configInt(config, "days", 7)
			targets, err = findNotLoggedInUsers(days)
		case "activity_overdue_N_days":
			days := configInt(config, "days", 3)
			targets, err = findOverdueActivityUsers(days)
		case "phase_starts":
			targets, err = findPhaseStartsToday()
		case "phase_ends_in_N_days":
			days := configInt(config, "days", 3)
			targets, err = findPhaseEndsInNDays(days)
		case "completion_below_pct":
			pct := configFloat(config, "pct", 50)
			targets, err = findCompletionBelowUsers(pct)
		case "assessment_failed":
			targets, err = findAssessmentFailedUsers()
		case "cohort_starts_in_N_days":
			days := configInt(config, "days", 3)
			targets, err = findCohortStartsInNDays(days)
		case "milestone_day_X":
			dayX := configInt(config, "day_x", 14)
			targets, err = findMilestoneUsers(dayX)
		default:
			log.Printf("rule evaluator: unknown trigger type: %s", rule.TriggerType)
			continue
		}

		if err != nil {
			log.Printf("rule evaluator: rule %s (%s) query failed: %v", rule.ID, rule.TriggerType, err)
			continue
		}

		ruleID := rule.ID.String()
		for _, target := range targets {
			// Rate limiting: skip if already notified in last 24h
			exists, checkErr := recentLogExistsForRuleUser(ruleID, target.UserID)
			if checkErr != nil || exists {
				continue
			}

			vars := map[string]string{
				"participant_name":   target.Name,
				"cohort_name":        target.CohortName,
				"program_title":      target.ProgramTitle,
				"days_inactive":      fmt.Sprintf("%d", target.DaysInactive),
				"completion_percent": fmt.Sprintf("%.0f", target.CompletionPct),
			}

			subject := substituteVars(rule.MessageSubject, vars)
			body := substituteVars(rule.MessageBody, vars)

			// Use template if available
			if rule.TemplateID != nil {
				if tmpl, tmplErr := getTemplate(rule.TemplateID.String()); tmplErr == nil {
					subject = substituteVars(tmpl.Subject, vars)
					body = substituteVars(tmpl.BodyHTML, vars)
				}
			}

			userUID, parseErr := uuid.Parse(target.UserID)
			if parseErr != nil {
				continue
			}
			orgUID := rule.OrgID
			ruleUID := rule.ID

			// Send email
			if rule.Channel == "email" || rule.Channel == "both" {
				errStr := ""
				sendErr := email.Send(target.Email, subject, body)
				if sendErr != nil {
					errStr = sendErr.Error()
					log.Printf("rule %s: email to %s failed: %v", ruleID, target.Email, sendErr)
				}
				l := &NotificationLog{
					OrgID:          orgUID,
					RuleID:         &ruleUID,
					UserID:         userUID,
					Channel:        "email",
					RecipientEmail: target.Email,
					Subject:        subject,
					Status:         "sent",
					ErrorMsg:       errStr,
					SentAt:         time.Now(),
				}
				if sendErr != nil {
					l.Status = "failed"
				}
				_ = createLog(l)
			}

			// Create in-app notification
			if rule.Channel == "push" || rule.Channel == "both" {
				notif := &InAppNotification{
					UserID: userUID,
					Title:  subject,
					Body:   stripHTMLTags(body),
					Type:   "reminder",
					RuleID: &ruleUID,
				}
				_ = createInAppNotification(notif)

				// Also log it
				l := &NotificationLog{
					OrgID:   orgUID,
					RuleID:  &ruleUID,
					UserID:  userUID,
					Channel: "push",
					Subject: subject,
					Status:  "sent",
					SentAt:  time.Now(),
				}
				_ = createLog(l)
			}
		}

		_ = updateRuleLastRun(ruleID)
	}
}

func configInt(m map[string]interface{}, key string, defaultVal int) int {
	v, ok := m[key]
	if !ok {
		return defaultVal
	}
	switch val := v.(type) {
	case float64:
		return int(val)
	case int:
		return val
	}
	return defaultVal
}

func configFloat(m map[string]interface{}, key string, defaultVal float64) float64 {
	v, ok := m[key]
	if !ok {
		return defaultVal
	}
	if val, ok := v.(float64); ok {
		return val
	}
	return defaultVal
}

func stripHTMLTags(s string) string {
	var out strings.Builder
	inTag := false
	for _, c := range s {
		switch {
		case c == '<':
			inTag = true
		case c == '>':
			inTag = false
		case !inTag:
			out.WriteRune(c)
		}
	}
	return strings.TrimSpace(out.String())
}

// ── Direct in-app notify (internal, machine-to-machine) ──────────

// notifyDirectService writes a single in-app notification to one user. Used by
// other modules' loopback bridges to surface a targeted alert (e.g. "your
// assessment was graded") without importing this package or duplicating the
// InAppNotification write path.
func notifyDirectService(req DirectNotifyRequest) error {
	if req.UserID == "" || req.Title == "" {
		return fmt.Errorf("user_id and title are required")
	}
	uid, err := uuid.Parse(req.UserID)
	if err != nil {
		return fmt.Errorf("invalid user_id")
	}
	typ := req.Type
	if typ == "" {
		typ = "info"
	}
	notif := &InAppNotification{
		UserID: uid,
		Title:  req.Title,
		Body:   req.Body,
		Type:   typ,
	}
	return createInAppNotification(notif)
}

// ── Session-Started (internal, machine-to-machine) ───────────────

// These package-level seams let tests substitute fakes without touching a
// real database or SMTP server - same pattern as zoom's
// loadOrgCredentialFingerprint/fetchOrgAccessToken seams
// (see zoom/org_token_cache_test.go's withOrgCacheSeams).
var (
	sessionNotifyGetEngagementParticipants = getEngagementParticipants
	sessionNotifyGetEngagementOrgID        = getEngagementOrgID
	sessionNotifyGetRecipients             = getRecipients
	sessionNotifyGetCohortMeta             = getCohortMeta
	sessionNotifyGetRecipientsByProgram    = getRecipientsByProgram
	sessionNotifyGetProgramOrgID           = getProgramOrgID
	sessionNotifyCreateLog                 = createLog
	sessionNotifyCreateInAppNotification   = createInAppNotification
	sessionNotifyEmailSend                 = email.Send
)

// notifySessionStartedService is sessions' single hook point for
// participant notifications, reached via an internal loopback HTTP call
// (never user-facing) right after a session flips scheduled -> live. It
// mirrors sendCampaignService's exact recipient/email/log/in-app pattern,
// just with a different, event-driven recipient resolution:
//   - EngagementID set  -> coaching_engagement_participants (coach session)
//   - CohortID set      -> that cohort's enrollments (faculty session)
//   - ProgramID only    -> every cohort's enrollments under that program
//     (a cohort_id IS NULL "program-wide" Live Session)
func notifySessionStartedService(req SessionStartedNotifyRequest) error {
	if req.SessionID == "" || req.Title == "" {
		return fmt.Errorf("session_id and title are required")
	}

	recipients, orgID, err := resolveSessionStartedRecipients(req)
	if err != nil {
		return err
	}

	orgUUID, parseErr := uuid.Parse(orgID)
	if parseErr != nil {
		return fmt.Errorf("could not resolve org for session %s: %w", req.SessionID, parseErr)
	}

	// Fire-and-forget: a slow SMTP provider must never delay the caller
	// (sessions' loopback POST), same reasoning as sendCampaignService.
	go sendSessionStartedNotifications(req, recipients, orgUUID)

	return nil
}

// resolveSessionStartedRecipients picks the recipient-resolution path based
// on which of EngagementID/CohortID/ProgramID is set on req, and resolves
// the org those recipients belong to. Pure branching logic over the
// sessionNotify* seams, so it's unit-testable without a database.
func resolveSessionStartedRecipients(req SessionStartedNotifyRequest) ([]recipientRow, string, error) {
	switch {
	case req.EngagementID != "":
		recipients, err := sessionNotifyGetEngagementParticipants(req.EngagementID)
		if err != nil {
			return nil, "", err
		}
		orgID, err := sessionNotifyGetEngagementOrgID(req.EngagementID)
		if err != nil {
			return nil, "", err
		}
		return recipients, orgID, nil
	case req.CohortID != "":
		recipients, err := sessionNotifyGetRecipients(req.CohortID, "all_participants")
		if err != nil {
			return nil, "", err
		}
		meta, err := sessionNotifyGetCohortMeta(req.CohortID)
		if err != nil {
			return nil, "", err
		}
		return recipients, meta.OrgID, nil
	case req.ProgramID != "":
		recipients, err := sessionNotifyGetRecipientsByProgram(req.ProgramID)
		if err != nil {
			return nil, "", err
		}
		orgID, err := sessionNotifyGetProgramOrgID(req.ProgramID)
		if err != nil {
			return nil, "", err
		}
		return recipients, orgID, nil
	default:
		return nil, "", fmt.Errorf("one of engagement_id, cohort_id, or program_id is required")
	}
}

// buildSessionStartedContent formats the notification subject/body. Virtual
// (zoom_embedded) sessions with a join URL get a "Join now" link; everything
// else (in-person, or a virtual session whose meeting somehow has no URL)
// gets a location-only message. Pure function, no I/O.
func buildSessionStartedContent(req SessionStartedNotifyRequest) (subject, body string) {
	subject = fmt.Sprintf("Session started: %s", req.Title)
	when := req.ScheduledAt.Local().Format("Jan 2, 2006 3:04 PM")
	if req.MeetingType == "zoom_embedded" && req.JoinURL != "" {
		body = fmt.Sprintf(
			`<p>Your session <strong>%s</strong> (scheduled for %s) has just started.</p><p><a href="%s">Join now</a></p>`,
			req.Title, when, req.JoinURL,
		)
	} else {
		body = fmt.Sprintf(
			`<p>Your session <strong>%s</strong> (scheduled for %s) has just started. Please head to the in-person location.</p>`,
			req.Title, when,
		)
	}
	return subject, body
}

// sendSessionStartedNotifications is the actual email/log/in-app write loop,
// factored out of the goroutine in notifySessionStartedService so tests can
// call it synchronously (no goroutine timing to race against) with the
// sessionNotify* seams swapped to fakes.
func sendSessionStartedNotifications(req SessionStartedNotifyRequest, recipients []recipientRow, orgUUID uuid.UUID) {
	subject, body := buildSessionStartedContent(req)

	for _, r := range recipients {
		userUID, parseErr := uuid.Parse(r.UserID)
		if parseErr != nil {
			continue
		}

		errStr := ""
		sendErr := sessionNotifyEmailSend(r.Email, subject, body)
		if sendErr != nil {
			errStr = sendErr.Error()
			log.Printf("session-started %s: email to %s failed: %v", req.SessionID, r.Email, sendErr)
		}

		l := &NotificationLog{
			OrgID:          orgUUID,
			UserID:         userUID,
			Channel:        "email",
			RecipientEmail: r.Email,
			Subject:        subject,
			Status:         "sent",
			ErrorMsg:       errStr,
			SentAt:         time.Now(),
		}
		if sendErr != nil {
			l.Status = "failed"
		}
		if logErr := sessionNotifyCreateLog(l); logErr != nil {
			log.Printf("session-started %s: failed to write log: %v", req.SessionID, logErr)
		}

		notif := &InAppNotification{
			UserID: userUID,
			Title:  subject,
			Body:   stripHTMLTags(body),
			Type:   "session_started",
		}
		if createErr := sessionNotifyCreateInAppNotification(notif); createErr != nil {
			log.Printf("session-started %s: failed to create in-app notification: %v", req.SessionID, createErr)
		}
	}
}

// ── At-Risk Nudges ───────────────────────────────────────────────

// listAtRiskService returns the at-risk participants for the superadmin Nudge &
// Comms tab. orgID "" = all orgs. riskLevel "" = high+medium; or "high"/"medium".
func listAtRiskService(orgID, riskLevel string, page, limit int) ([]AtRiskParticipantDTO, int64, error) {
	offset := (page - 1) * limit
	rows, total, err := listAtRiskParticipants(orgID, riskLevel, offset, limit)
	if err != nil {
		return nil, 0, err
	}
	out := make([]AtRiskParticipantDTO, 0, len(rows))
	for _, r := range rows {
		dto := AtRiskParticipantDTO{
			UserID: r.UserID, Name: r.Name, Email: r.Email,
			Org: r.Org, OrgID: r.OrgID, Program: r.Program,
			Cohort: r.Cohort, CohortID: r.CohortID, RiskLevel: r.RiskLevel,
			CompletionPercent: r.CompletionPercent,
			DaysSinceActivity: r.DaysSinceActivity,
		}
		if r.NudgedAt != nil {
			dto.NudgedAt = r.NudgedAt.UTC().Format(time.RFC3339)
		}
		out = append(out, dto)
	}
	return out, total, nil
}

// sendNudgeService sends an in-app nudge to one participant, reusing the
// existing createInAppNotification send path, and records nudged_at.
func sendNudgeService(userIDStr, cohortID, message string) error {
	uid, err := uuid.Parse(userIDStr)
	if err != nil {
		return fmt.Errorf("invalid user_id")
	}
	body := strings.TrimSpace(message)
	if body == "" {
		body = "We noticed you've fallen behind in your program. Your team is here to help - jump back in when you can."
	}
	notif := &InAppNotification{
		UserID: uid,
		Title:  "A nudge from your program team",
		Body:   body,
		Type:   "nudge",
	}
	if err := createInAppNotification(notif); err != nil {
		return err
	}
	if cohortID != "" {
		_ = markNudged(userIDStr, cohortID)
	}
	return nil
}
