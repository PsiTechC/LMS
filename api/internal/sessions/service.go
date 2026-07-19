package sessions

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/xa-lms/api/internal/leaderboard"
	"github.com/xa-lms/api/internal/shared"
	"github.com/xa-lms/api/internal/teams"
)

// ── Session CRUD ───────────────────────────────────────────────────────────

func listSessionsService(q ListSessionsQuery, callerID, callerRole string) ([]SessionResponse, int64, error) {
	if q.Page < 1 {
		q.Page = 1
	}
	if q.Limit < 1 || q.Limit > 100 {
		q.Limit = 20
	}
	var (
		rows  []ClassSession
		total int64
		err   error
	)
	if callerRole == shared.RoleFaculty {
		// Faculty see sessions they own (faculty_id) OR are assigned to via activity_faculty.
		// cohort_id filter is respected when provided (e.g. when viewing a specific cohort overview).
		rows, total, err = listSessionsByFaculty(callerID, q.CohortID, q.Status, (q.Page-1)*q.Limit, q.Limit)
	} else {
		rows, total, err = listSessions(q.CohortID, q.FacultyID, q.Status, (q.Page-1)*q.Limit, q.Limit)
	}
	if err != nil {
		return nil, 0, err
	}
	result := make([]SessionResponse, 0, len(rows))
	for _, s := range rows {
		result = append(result, sessionToDTO(s))
	}
	return result, total, nil
}

// checkSessionReadAccess returns ErrForbidden if the caller is a faculty member
// who neither owns the session nor is assigned to its program via activity_faculty.
func checkSessionReadAccess(sessionID, callerID, callerRole string) error {
	if callerRole != shared.RoleFaculty {
		return nil
	}
	ok, err := isFacultyAuthorisedForSession(sessionID, callerID)
	if err != nil {
		return err
	}
	if !ok {
		return ErrForbidden
	}
	return nil
}

func getSessionService(id string) (*SessionResponse, error) {
	s, err := getSessionByID(id)
	if err != nil {
		return nil, err
	}
	dto := sessionToDTO(*s)
	return &dto, nil
}

func createSessionService(req CreateSessionRequest, callerID, callerRole string) (*SessionResponse, error) {
	if strings.TrimSpace(req.Title) == "" {
		return nil, errors.New("title is required")
	}
	if req.ScheduledAt == "" {
		return nil, errors.New("scheduled_at is required")
	}

	scheduledAt, err := time.Parse(time.RFC3339, req.ScheduledAt)
	if err != nil {
		return nil, errors.New("scheduled_at must be RFC3339 format")
	}
	programID, err := uuid.Parse(req.ProgramID)
	if err != nil {
		return nil, errors.New("invalid program_id")
	}
	var cohortID *uuid.UUID
	if req.CohortID != "" {
		cid, err := uuid.Parse(req.CohortID)
		if err != nil {
			return nil, errors.New("invalid cohort_id")
		}
		cohortID = &cid
	}

	// PM/SA may specify a faculty_id to create a session on behalf of another user.
	// Faculty always own their own sessions.
	resolvedFacultyID := callerID
	if req.FacultyID != "" && (callerRole == shared.RoleProgramManager || callerRole == shared.RoleSuperAdmin) {
		resolvedFacultyID = req.FacultyID
	}
	fid, err := uuid.Parse(resolvedFacultyID)
	if err != nil {
		return nil, errors.New("invalid faculty_id")
	}

	// Optional activity link
	var activityID *uuid.UUID
	if req.ActivityID != "" {
		aid, err := uuid.Parse(req.ActivityID)
		if err != nil {
			return nil, errors.New("invalid activity_id")
		}
		activityID = &aid
	}

	sessionType := req.SessionType
	if sessionType == "" {
		sessionType = "classroom"
	}
	durationMins := req.DurationMins
	if durationMins <= 0 {
		durationMins = 60
	}
	meetingType := req.MeetingType
	if meetingType == "" {
		meetingType = "external_link"
	}
	if !isValidMeetingType(meetingType) {
		return nil, errors.New("meeting_type must be one of: in_person, external_link, zoom_embedded")
	}

	var desc *string
	if req.Description != "" {
		desc = &req.Description
	}
	var link *string
	if req.VirtualLink != "" {
		link = &req.VirtualLink
	}

	s := &ClassSession{
		ProgramID:    programID,
		CohortID:     cohortID, // nil when no cohort selected
		ActivityID:   activityID,
		FacultyID:    fid,
		Title:        req.Title,
		Description:  desc,
		SessionType:  sessionType,
		VirtualLink:  link,
		MeetingType:  meetingType,
		ScheduledAt:  scheduledAt,
		DurationMins: durationMins,
		Status:       "scheduled",
		Agenda:       []byte("[]"),
	}
	if err := createSession(s); err != nil {
		return nil, err
	}
	// Keep session persistence authoritative. A Teams provisioning failure is
	// recorded on the saved session so an administrator can retry it, rather
	// than losing an otherwise valid LMS session.
	if meetingType == "microsoft_teams" {
		if _, err := createTeamsMeetingService(context.Background(), s.ID.String(), callerID, callerRole); err != nil {
			log.Printf("teams: automatic meeting creation failed for session %s: %v", s.ID, err)
		}
		return getSessionService(s.ID.String())
	}
	dto := sessionToDTO(*s)
	return &dto, nil
}

func updateSessionService(id string, req UpdateSessionRequest, callerID, callerRole string) (*SessionResponse, error) {
	existing, err := getSessionByID(id)
	if err != nil {
		return nil, err
	}
	if callerRole == shared.RoleFaculty {
		ok, err := isFacultyAuthorisedForSession(id, callerID)
		if err != nil || !ok {
			return nil, errors.New("forbidden")
		}
	}
	if existing.MeetingProvider != nil && *existing.MeetingProvider == "microsoft_teams" &&
		req.MeetingType != "" && req.MeetingType != "microsoft_teams" {
		return nil, errors.New("a Teams meeting provider cannot be changed")
	}
	if existing.MeetingProvider != nil && *existing.MeetingProvider == "microsoft_teams" && req.VirtualLink != "" {
		return nil, errors.New("the Teams join link is managed by Microsoft")
	}

	fields := map[string]any{}
	if req.Title != "" {
		fields["title"] = req.Title
	}
	if req.Description != "" {
		fields["description"] = req.Description
	}
	if req.VirtualLink != "" {
		fields["virtual_link"] = req.VirtualLink
	}
	if req.MeetingType != "" {
		if !isValidMeetingType(req.MeetingType) {
			return nil, errors.New("meeting_type must be one of: in_person, external_link, zoom_embedded, microsoft_teams")
		}
		fields["meeting_type"] = req.MeetingType
	}
	if req.WhiteboardURL != "" {
		fields["whiteboard_url"] = req.WhiteboardURL
	}
	if req.Status != "" {
		fields["status"] = req.Status
	}
	if req.DurationMins > 0 {
		fields["duration_mins"] = req.DurationMins
	}
	if req.ScheduledAt != "" {
		scheduledAt, parseErr := time.Parse(time.RFC3339, req.ScheduledAt)
		if parseErr != nil {
			return nil, errors.New("scheduled_at must be RFC3339 format")
		}
		fields["scheduled_at"] = scheduledAt
	}
	if req.ReminderEnabled != nil {
		fields["reminder_enabled"] = *req.ReminderEnabled
	}
	if len(fields) == 0 {
		return nil, errors.New("no fields to update")
	}

	if isTeamsCalendarEvent(existing) && teamsEventFieldsChanged(req) {
		if err := syncTeamsCalendarEvent(id, existing, req, fields); err != nil {
			return nil, err
		}
	}
	if err := updateSession(id, fields); err != nil {
		return nil, err
	}
	return getSessionService(id)
}

func isTeamsCalendarEvent(s *ClassSession) bool {
	return s.MeetingProvider != nil && *s.MeetingProvider == "microsoft_teams" &&
		s.ProviderEventID != nil && *s.ProviderEventID != ""
}

func teamsEventFieldsChanged(req UpdateSessionRequest) bool {
	return req.Title != "" || req.Description != "" || req.ScheduledAt != "" || req.DurationMins > 0
}

func syncTeamsCalendarEvent(id string, existing *ClassSession, req UpdateSessionRequest, fields map[string]any) error {
	updating := "updating"
	if err := updateSession(id, map[string]any{"meeting_status": updating, "meeting_error": nil}); err != nil {
		return err
	}
	title := existing.Title
	if req.Title != "" {
		title = req.Title
	}
	description := ""
	if existing.Description != nil {
		description = *existing.Description
	}
	if req.Description != "" {
		description = req.Description
	}
	start := existing.ScheduledAt
	if value, ok := fields["scheduled_at"].(time.Time); ok {
		start = value
	}
	duration := existing.DurationMins
	if req.DurationMins > 0 {
		duration = req.DurationMins
	}
	attendeeRows, err := sessionMeetingAttendees(existing)
	if err != nil {
		return markTeamsUpdateFailed(id)
	}
	attendees := make([]teams.Attendee, 0, len(attendeeRows))
	for _, attendee := range attendeeRows {
		attendees = append(attendees, teams.Attendee{Name: attendee.Name, Email: attendee.Email})
	}
	service, err := teams.DefaultService()
	if err != nil {
		return markTeamsUpdateFailed(id)
	}
	india := time.FixedZone("IST", 5*60*60+30*60)
	if err := service.UpdateCalendarEvent(context.Background(), teams.UpdateCalendarEventRequest{
		EventID:     *existing.ProviderEventID,
		Subject:     title,
		Description: description,
		StartTime:   start.In(india),
		EndTime:     start.Add(time.Duration(duration) * time.Minute).In(india),
		Attendees:   attendees,
	}); err != nil {
		return markTeamsUpdateFailed(id)
	}
	fields["meeting_status"] = "created"
	fields["meeting_error"] = nil
	return nil
}

func markTeamsUpdateFailed(id string) error {
	return updateSession(id, map[string]any{
		"meeting_status": "update_failed",
		"meeting_error":  "Microsoft Teams calendar update failed",
	})
}

// ── Lifecycle ──────────────────────────────────────────────────────────────

func startSessionService(id, callerID, callerRole string) (*StartSessionResponse, error) {
	existing, err := getSessionByID(id)
	if err != nil {
		return nil, err
	}
	if callerRole == shared.RoleFaculty || callerRole == shared.RoleCoach {
		ok, err := isFacultyAuthorisedForSession(id, callerID)
		if err != nil || !ok {
			return nil, errors.New("forbidden")
		}
	}
	if existing.Status != "scheduled" {
		return nil, errors.New("session is not in scheduled state")
	}

	// Virtual sessions must have a real provider link before the status flip.
	// This prevents a session from appearing live while faculty and students
	// have nowhere to join. Zoom creates/reuses its meeting here; Teams must
	// already have a successful calendar-backed event and join URL.
	var joinURL string
	if existing.MeetingType == "zoom_embedded" {
		joinURL, err = ensureZoomMeeting(existing, callerID, callerRole)
		if err != nil {
			return nil, fmt.Errorf("could not start session: %w", err)
		}
	}
	if existing.MeetingType == "microsoft_teams" {
		if existing.VirtualLink == nil || *existing.VirtualLink == "" {
			return nil, errors.New("Teams meeting has not been created yet; check the Microsoft Teams configuration and retry")
		}
		joinURL = *existing.VirtualLink
	}

	if err := startSessionDB(id); err != nil {
		return nil, err
	}

	// A coaching engagement (coaching_engagements) is created 'scheduled' and
	// nothing else ever advances it — starting the first real session tied to
	// it is the signal that the coaching relationship has actually begun, so
	// flip it to 'active' here. Guarded to only move scheduled->active (never
	// clobbers completed/cancelled) and is a no-op after the first session
	// (already 'active'). coaching is a separate module (no Go import across
	// modules per CLAUDE.md) so this is a direct statement against the
	// shared table, not a cross-module call.
	if existing.EngagementID != nil {
		if err := activateCoachingEngagement(existing.EngagementID.String()); err != nil {
			log.Printf("sessions: failed to activate coaching engagement %s: %v", existing.EngagementID, err)
		}
	}

	// Fire-and-forget: notify every participant the session just went live.
	// This only ever reaches here on a genuine scheduled -> live transition
	// (guarded above), never on a re-start. Must not delay this response.
	go notifySessionStarted(existing, callerID, callerRole, joinURL)

	dto, err := getSessionService(id)
	if err != nil {
		return nil, err
	}
	return &StartSessionResponse{SessionResponse: *dto}, nil
}

func endSessionService(id, callerID, callerRole string) (*SessionResponse, error) {
	existing, err := getSessionByID(id)
	if err != nil {
		return nil, err
	}
	if callerRole == shared.RoleFaculty || callerRole == shared.RoleCoach {
		ok, err := isFacultyAuthorisedForSession(id, callerID)
		if err != nil || !ok {
			return nil, errors.New("forbidden")
		}
	}
	if existing.Status != "live" {
		return nil, errors.New("session is not live")
	}
	if err := endSessionDB(id); err != nil {
		return nil, err
	}
	// Only coaching sessions have an engagement ID. The durable completed
	// class-session is the idempotent source record for participant awards.
	if existing.EngagementID != nil {
		completedAt := time.Now()
		if err := leaderboard.AwardCompletedCoachingSession(existing.ID, completedAt); err != nil {
			return nil, err
		}
	}
	return getSessionService(id)
}

// ── Agenda ─────────────────────────────────────────────────────────────────

// cancelSessionService removes the external Teams event first. Cancellation
// remains idempotent when Graph already deleted the event (404).
func cancelSessionService(id, callerID, callerRole string) error {
	existing, err := getSessionByID(id)
	if err != nil {
		return err
	}
	if callerRole == shared.RoleFaculty || callerRole == shared.RoleCoach {
		ok, err := isFacultyAuthorisedForSession(id, callerID)
		if err != nil || !ok {
			return errors.New("forbidden")
		}
	}
	if isTeamsCalendarEvent(existing) {
		if err := updateSession(id, map[string]any{"meeting_status": "deleting", "meeting_error": nil}); err != nil {
			return err
		}
		service, err := teams.DefaultService()
		if err == nil {
			err = service.DeleteCalendarEvent(context.Background(), *existing.ProviderEventID)
		}
		if err != nil {
			_ = updateSession(id, map[string]any{"meeting_status": "delete_failed", "meeting_error": "Microsoft Teams calendar deletion failed"})
			return err
		}
	}
	fields := map[string]any{"status": "cancelled"}
	if isTeamsCalendarEvent(existing) {
		fields["meeting_status"] = "cancelled"
		fields["meeting_error"] = nil
	}
	return updateSession(id, fields)
}

func updateAgendaService(id string, items []AgendaItem, callerID, callerRole string) error {
	if _, err := getSessionByID(id); err != nil {
		return err
	}
	if callerRole == shared.RoleFaculty {
		ok, err := isFacultyAuthorisedForSession(id, callerID)
		if err != nil || !ok {
			return errors.New("forbidden")
		}
	}
	return updateSessionAgendaDB(id, items)
}

// ── Notes ──────────────────────────────────────────────────────────────────

func updateNotesService(id, notes, callerID, callerRole string) error {
	if _, err := getSessionByID(id); err != nil {
		return err
	}
	if callerRole == shared.RoleFaculty {
		ok, err := isFacultyAuthorisedForSession(id, callerID)
		if err != nil || !ok {
			return errors.New("forbidden")
		}
	}
	return updateSessionNotesDB(id, notes)
}

// ── Materials ──────────────────────────────────────────────────────────────

func addMaterialService(sessionID, uploaderID string, req AddMaterialRequest) (*MaterialResponse, error) {
	if strings.TrimSpace(req.Title) == "" {
		return nil, errors.New("title is required")
	}
	if strings.TrimSpace(req.URL) == "" {
		return nil, errors.New("url is required")
	}

	sid, err := uuid.Parse(sessionID)
	if err != nil {
		return nil, errors.New("invalid session_id")
	}
	uid, err := uuid.Parse(uploaderID)
	if err != nil {
		return nil, errors.New("invalid uploader_id")
	}

	m := &SessionMaterial{
		SessionID:  sid,
		UploadedBy: uid,
		Title:      req.Title,
		Type:       req.Type,
		URL:        req.URL,
		SizeBytes:  req.SizeBytes,
	}
	if err := addMaterial(m); err != nil {
		return nil, err
	}
	dto := materialToDTO(*m)
	return &dto, nil
}

func listMaterialsService(sessionID string) ([]MaterialResponse, error) {
	rows, err := listMaterials(sessionID)
	if err != nil {
		return nil, err
	}
	result := make([]MaterialResponse, 0, len(rows))
	for _, m := range rows {
		result = append(result, materialToDTO(m))
	}
	return result, nil
}

func deleteMaterialService(sessionID, materialID string) error {
	return deleteMaterial(sessionID, materialID)
}

// ── Attendance ─────────────────────────────────────────────────────────────

func markAttendanceService(sessionID string, req MarkAttendanceRequest) error {
	sid, err := uuid.Parse(sessionID)
	if err != nil {
		return errors.New("invalid session_id")
	}
	return markAttendance(sid, req.Entries)
}

func getAttendanceService(sessionID string) ([]AttendanceResponse, error) {
	rows, err := getAttendance(sessionID)
	if err != nil {
		return nil, err
	}
	result := make([]AttendanceResponse, 0, len(rows))
	for _, a := range rows {
		result = append(result, AttendanceResponse{
			SessionID: a.SessionID.String(),
			UserID:    a.UserID.String(),
			Status:    a.Status,
			MarkedAt:  a.MarkedAt.Format(time.RFC3339),
		})
	}
	return result, nil
}

// ── Polls ──────────────────────────────────────────────────────────────────

func listPollsService(sessionID string) ([]PollResponse, error) {
	rows, err := listPolls(sessionID)
	if err != nil {
		return nil, err
	}
	result := make([]PollResponse, 0, len(rows))
	for _, p := range rows {
		result = append(result, pollToDTO(p))
	}
	return result, nil
}

func createPollService(sessionID, creatorID string, req CreatePollRequest) (*PollResponse, error) {
	if strings.TrimSpace(req.Question) == "" {
		return nil, errors.New("question is required")
	}
	if len(req.Options) < 2 {
		return nil, errors.New("at least 2 options required")
	}

	sid, err := uuid.Parse(sessionID)
	if err != nil {
		return nil, errors.New("invalid session_id")
	}
	cid, err := uuid.Parse(creatorID)
	if err != nil {
		return nil, errors.New("invalid creator_id")
	}

	optsJSON, _ := json.Marshal(req.Options)
	p := &SessionPoll{
		SessionID: sid,
		CreatedBy: cid,
		Question:  req.Question,
		Options:   optsJSON,
	}
	if err := createPoll(p); err != nil {
		return nil, err
	}
	dto := pollToDTO(*p)
	return &dto, nil
}

func activatePollService(sessionID, pollID string) error {
	return activatePollDB(sessionID, pollID)
}

func deactivatePollService(pollID string) error {
	return deactivatePollDB(pollID)
}

func getPollResultsService(pollID string) (*PollResultsResponse, error) {
	p, err := getPollByID(pollID)
	if err != nil {
		return nil, err
	}
	opts := parsePollOptions(p.Options)
	counts, err := getPollVoteCounts(pollID)
	if err != nil {
		return nil, err
	}

	countMap := map[int]int{}
	total := 0
	for _, c := range counts {
		countMap[c.OptionIndex] = c.Count
		total += c.Count
	}

	votes := make([]VoteCount, len(opts))
	for i, opt := range opts {
		votes[i] = VoteCount{
			OptionIndex: i,
			Option:      opt,
			Count:       countMap[i],
		}
	}

	return &PollResultsResponse{
		PollID:   p.ID.String(),
		Question: p.Question,
		Options:  opts,
		Votes:    votes,
		Total:    total,
	}, nil
}

func submitVoteService(pollID, userID string, req SubmitVoteRequest) error {
	pid, err := uuid.Parse(pollID)
	if err != nil {
		return errors.New("invalid poll_id")
	}
	uid, err := uuid.Parse(userID)
	if err != nil {
		return errors.New("invalid user_id")
	}
	p, err := getPollByID(pollID)
	if err != nil {
		return err
	}
	opts := parsePollOptions(p.Options)
	if req.OptionIndex < 0 || req.OptionIndex >= len(opts) {
		return errors.New("invalid option_index")
	}
	v := &SessionPollVote{
		PollID:      pid,
		UserID:      uid,
		OptionIndex: req.OptionIndex,
	}
	return submitVote(v)
}

// ── Action Items ───────────────────────────────────────────────────────────

func listActionItemsService(sessionID string) ([]ActionItemResponse, error) {
	rows, err := listActionItems(sessionID)
	if err != nil {
		return nil, err
	}
	result := make([]ActionItemResponse, 0, len(rows))
	for _, a := range rows {
		result = append(result, actionItemToDTO(a))
	}
	return result, nil
}

func createActionItemService(sessionID, creatorID string, req CreateActionItemRequest) (*ActionItemResponse, error) {
	if strings.TrimSpace(req.Description) == "" {
		return nil, errors.New("description is required")
	}

	sid, err := uuid.Parse(sessionID)
	if err != nil {
		return nil, errors.New("invalid session_id")
	}
	cid, err := uuid.Parse(creatorID)
	if err != nil {
		return nil, errors.New("invalid creator_id")
	}

	a := &SessionActionItem{
		SessionID:   sid,
		Description: req.Description,
		CreatedBy:   cid,
		Status:      "open",
	}

	if req.ParticipantID != "" {
		pid, err := uuid.Parse(req.ParticipantID)
		if err != nil {
			return nil, errors.New("invalid participant_id")
		}
		a.ParticipantID = &pid
	}

	if req.DueDate != "" {
		t, err := time.Parse("2006-01-02", req.DueDate)
		if err != nil {
			return nil, errors.New("due_date must be YYYY-MM-DD")
		}
		a.DueDate = &t
	}

	if err := createActionItem(a); err != nil {
		return nil, err
	}
	dto := actionItemToDTO(*a)
	return &dto, nil
}

// ── Reflections ───────────────────────────────────────────────────────────

func createReflectionService(sessionID, participantID string, req CreateReflectionRequest) (*ReflectionResponse, error) {
	if strings.TrimSpace(req.AgendaItemID) == "" {
		return nil, errors.New("agenda_item_id is required")
	}
	if strings.TrimSpace(req.Content) == "" {
		return nil, errors.New("content is required")
	}
	sid, err := uuid.Parse(sessionID)
	if err != nil {
		return nil, errors.New("invalid session_id")
	}
	pid, err := uuid.Parse(participantID)
	if err != nil {
		return nil, errors.New("invalid participant_id")
	}
	r := &SessionReflection{
		SessionID:     sid,
		AgendaItemID:  req.AgendaItemID,
		ParticipantID: pid,
		Content:       req.Content,
	}
	if err := createOrUpdateReflection(r); err != nil {
		return nil, err
	}
	dto := reflectionToDTO(*r)
	return &dto, nil
}

func listReflectionsService(sessionID, agendaItemID string) ([]ReflectionResponse, error) {
	rows, err := listReflectionsBySession(sessionID, agendaItemID)
	if err != nil {
		return nil, err
	}
	result := make([]ReflectionResponse, 0, len(rows))
	for _, r := range rows {
		result = append(result, reflectionToDTO(r))
	}
	return result, nil
}

func getMyReflectionService(sessionID, agendaItemID, participantID string) (*ReflectionResponse, error) {
	r, err := getReflectionByParticipant(sessionID, agendaItemID, participantID)
	if err != nil {
		return nil, err
	}
	if r == nil {
		return nil, nil
	}
	dto := reflectionToDTO(*r)
	return &dto, nil
}

func addReflectionCommentService(reflectionID, facultyID string, req AddReflectionCommentRequest) error {
	if strings.TrimSpace(req.Comment) == "" {
		return errors.New("comment is required")
	}
	return addCommentToReflection(reflectionID, facultyID, req.Comment)
}

func reflectionToDTO(r SessionReflection) ReflectionResponse {
	dto := ReflectionResponse{
		ID:             r.ID.String(),
		SessionID:      r.SessionID.String(),
		AgendaItemID:   r.AgendaItemID,
		ParticipantID:  r.ParticipantID.String(),
		Content:        r.Content,
		FacultyComment: r.FacultyComment,
		CreatedAt:      r.CreatedAt.Format(time.RFC3339),
		UpdatedAt:      r.UpdatedAt.Format(time.RFC3339),
	}
	if r.CommentedBy != nil {
		s := r.CommentedBy.String()
		dto.CommentedBy = &s
	}
	if r.CommentedAt != nil {
		s := r.CommentedAt.Format(time.RFC3339)
		dto.CommentedAt = &s
	}
	return dto
}

func updateActionItemService(itemID string, req UpdateActionItemRequest) error {
	fields := map[string]any{}
	if req.Status != "" {
		fields["status"] = req.Status
	}
	if req.Description != "" {
		fields["description"] = req.Description
	}
	if len(fields) == 0 {
		return nil
	}
	return updateActionItemDB(itemID, fields)
}

// isValidMeetingType guards against arbitrary strings being persisted into a
// column the frontend switches on (in_person | external_link | zoom_embedded).
func isValidMeetingType(v string) bool {
	switch v {
	case "in_person", "external_link", "zoom_embedded", "microsoft_teams":
		return true
	default:
		return false
	}
}

// ── DTO helpers ────────────────────────────────────────────────────────────

func sessionToDTO(s ClassSession) SessionResponse {
	r := SessionResponse{
		ID:        s.ID.String(),
		ProgramID: s.ProgramID.String(),
		CohortID: func() string {
			if s.CohortID != nil {
				return s.CohortID.String()
			}
			return ""
		}(),
		FacultyID:             s.FacultyID.String(),
		Title:                 s.Title,
		Description:           s.Description,
		SessionType:           s.SessionType,
		VirtualLink:           s.VirtualLink,
		WhiteboardURL:         s.WhiteboardURL,
		MeetingType:           s.MeetingType,
		MeetingProvider:       s.MeetingProvider,
		ProviderEventID:       s.ProviderEventID,
		ProviderWebLink:       s.ProviderWebLink,
		MeetingOrganizerEmail: s.MeetingOrganizerEmail,
		MeetingStatus:         s.MeetingStatus,
		MeetingError:          s.MeetingError,
		JoinURL:               s.ZoomJoinURL,
		ScheduledAt:           s.ScheduledAt.Format(time.RFC3339),
		DurationMins:          s.DurationMins,
		Status:                s.Status,
		Agenda:                parseAgenda(s.Agenda),
		Notes:                 s.Notes,
		ReminderEnabled:       s.ReminderEnabled,
		CreatedAt:             s.CreatedAt.Format(time.RFC3339),
	}
	if s.ActivityID != nil {
		r.ActivityID = s.ActivityID.String()
	}
	if s.EngagementID != nil {
		r.EngagementID = s.EngagementID.String()
	}
	if s.StartedAt != nil {
		t := s.StartedAt.Format(time.RFC3339)
		r.StartedAt = &t
	}
	if s.EndedAt != nil {
		t := s.EndedAt.Format(time.RFC3339)
		r.EndedAt = &t
	}
	return r
}

func materialToDTO(m SessionMaterial) MaterialResponse {
	return MaterialResponse{
		ID:         m.ID.String(),
		SessionID:  m.SessionID.String(),
		UploadedBy: m.UploadedBy.String(),
		Title:      m.Title,
		Type:       m.Type,
		URL:        m.URL,
		CreatedAt:  m.CreatedAt.Format(time.RFC3339),
	}
}

func pollToDTO(p SessionPoll) PollResponse {
	return PollResponse{
		ID:        p.ID.String(),
		SessionID: p.SessionID.String(),
		Question:  p.Question,
		Options:   parsePollOptions(p.Options),
		IsActive:  p.IsActive,
		CreatedAt: p.CreatedAt.Format(time.RFC3339),
	}
}

func actionItemToDTO(a SessionActionItem) ActionItemResponse {
	r := ActionItemResponse{
		ID:          a.ID.String(),
		SessionID:   a.SessionID.String(),
		Description: a.Description,
		Status:      a.Status,
		CreatedBy:   a.CreatedBy.String(),
		CreatedAt:   a.CreatedAt.Format(time.RFC3339),
		UpdatedAt:   a.UpdatedAt.Format(time.RFC3339),
	}
	if a.ParticipantID != nil {
		s := a.ParticipantID.String()
		r.ParticipantID = &s
	}
	if a.DueDate != nil {
		s := a.DueDate.Format("2006-01-02")
		r.DueDate = &s
	}
	return r
}

// ── Admin aggregate (superadmin Live Sessions) ────────────────────

// listAdminSessionsService assembles the superadmin Live Sessions view. Status
// is computed from scheduled_at + duration vs now (a stored status can drift
// from real time), platform is derived from the virtual link, and attendance is
// present/enrolled for done sessions only. Summary KPIs are computed from the
// same rows. orgID "" = all orgs.
func listAdminSessionsService(orgID string) (*AdminSessionsResponseDTO, error) {
	rows, err := listAdminSessions(orgID)
	if err != nil {
		return nil, err
	}
	now := time.Now().UTC()

	out := make([]AdminSessionDTO, 0, len(rows))
	var liveNow, upcoming, thisMonth, attSum, attCount int
	for _, r := range rows {
		scheduled := r.ScheduledAt.UTC()
		end := scheduled.Add(time.Duration(r.DurationMins) * time.Minute)

		// Computed status — time first, but an explicitly ended session is done.
		status := "upcoming"
		switch {
		case r.EndedAt != nil || r.StoredStatus == "completed" || !now.Before(end):
			status = "done"
		case !now.Before(scheduled) || r.StartedAt != nil:
			status = "live_now"
		}

		dto := AdminSessionDTO{
			ID: r.ID, Title: r.Title, Faculty: r.Faculty, DurationMins: r.DurationMins,
			Program: r.Program, Org: r.Org, OrgID: r.OrgID,
			ScheduledAt: scheduled.Format(time.RFC3339),
			Platform:    derivePlatform(r.MeetingType, r.ZoomJoinURL, r.VirtualLink),
			Enrolled:    r.Enrolled, Present: r.Present, Status: status,
			VirtualLink: r.VirtualLink, MeetingType: r.MeetingType, JoinURL: r.ZoomJoinURL,
			RecordingURL: r.RecordingURL,
		}
		// Attendance % only for done sessions with a known enrolment.
		if status == "done" && r.Enrolled > 0 {
			pct := int(float64(r.Present)/float64(r.Enrolled)*100 + 0.5)
			dto.AttendancePct = &pct
			attSum += pct
			attCount++
		}
		out = append(out, dto)

		switch status {
		case "live_now":
			liveNow++
		case "upcoming":
			upcoming++
		}
		if scheduled.Year() == now.Year() && scheduled.Month() == now.Month() {
			thisMonth++
		}
	}

	summary := AdminSessionsSummaryDTO{
		SessionsThisMonth: thisMonth, LiveNow: liveNow, Upcoming: upcoming,
	}
	if attCount > 0 {
		avg := int(float64(attSum)/float64(attCount) + 0.5)
		summary.AvgAttendance = &avg
	}

	return &AdminSessionsResponseDTO{Summary: summary, Sessions: out}, nil
}

// derivePlatform maps a session's stored meeting configuration to a human
// platform name. meetingType is the source of truth (set at creation time,
// see sessions.dto.go CreateSessionRequest.MeetingType) — a zoom_embedded
// session's actual join link lives on its zoom_meetings row (zoomJoinURL),
// not class_sessions.virtual_link, so checking virtualLink alone would
// wrongly report every Zoom session as "In-person" until a Zoom meeting had
// been created against it. in_person always wins regardless of any stray
// link value; external_link falls back to parsing the URL for a known
// platform name.
func derivePlatform(meetingType string, zoomJoinURL, virtualLink *string) string {
	switch meetingType {
	case "in_person":
		return "In-person"
	case "zoom_embedded":
		return "Zoom"
	}
	link := virtualLink
	if zoomJoinURL != nil && strings.TrimSpace(*zoomJoinURL) != "" {
		link = zoomJoinURL
	}
	if link == nil || strings.TrimSpace(*link) == "" {
		return "In-person"
	}
	l := strings.ToLower(*link)
	switch {
	case strings.Contains(l, "zoom."):
		return "Zoom"
	case strings.Contains(l, "meet.google"):
		return "Google Meet"
	case strings.Contains(l, "teams.microsoft") || strings.Contains(l, "teams.live"):
		return "Microsoft Teams"
	case strings.Contains(l, "webex."):
		return "Webex"
	default:
		return "Virtual"
	}
}

// createTeamsMeetingService creates one calendar-backed Teams meeting for a
// session. The persisted provider event ID makes retries idempotent.
func createTeamsMeetingService(ctx context.Context, id, callerID, callerRole string) (*SessionResponse, error) {
	session, err := getSessionByID(id)
	if err != nil {
		return nil, err
	}
	if callerRole == shared.RoleFaculty || callerRole == shared.RoleCoach {
		allowed, accessErr := isFacultyAuthorisedForSession(id, callerID)
		if accessErr != nil || !allowed {
			return nil, errors.New("forbidden")
		}
	}
	if session.ProviderEventID != nil && *session.ProviderEventID != "" && session.VirtualLink != nil && *session.VirtualLink != "" {
		return getSessionService(id)
	}

	creating := "creating"
	if err := updateSession(id, map[string]any{
		"meeting_provider": "microsoft_teams",
		"meeting_status":   creating,
		"meeting_error":    nil,
	}); err != nil {
		return nil, err
	}

	attendeeRows, err := sessionMeetingAttendees(session)
	if err != nil {
		log.Printf("teams: attendee lookup failed for session %s: %v", id, err)
		return markTeamsMeetingFailed(id, err)
	}
	attendees := make([]teams.Attendee, 0, len(attendeeRows))
	for _, attendee := range attendeeRows {
		attendees = append(attendees, teams.Attendee{Name: attendee.Name, Email: attendee.Email})
	}

	service, err := teams.DefaultService()
	if err != nil {
		log.Printf("teams: configuration unavailable for session %s: %v", id, err)
		return markTeamsMeetingFailed(id, err)
	}
	description := ""
	if session.Description != nil {
		description = *session.Description
	}
	event, err := service.CreateCalendarEvent(ctx, teams.CreateCalendarEventRequest{
		Subject:       session.Title,
		Description:   description,
		StartTime:     session.ScheduledAt.In(time.FixedZone("IST", 5*60*60+30*60)),
		EndTime:       session.ScheduledAt.Add(time.Duration(session.DurationMins) * time.Minute).In(time.FixedZone("IST", 5*60*60+30*60)),
		TransactionID: session.ID.String(),
		Attendees:     attendees,
	})
	if err != nil {
		log.Printf("teams: Graph calendar event creation failed for session %s: %v", id, err)
		return markTeamsMeetingFailed(id, err)
	}

	created := "created"
	if err := updateSession(id, map[string]any{
		"meeting_type":            "microsoft_teams",
		"meeting_provider":        "microsoft_teams",
		"provider_event_id":       event.ID,
		"provider_web_link":       event.WebLink,
		"meeting_organizer_email": event.Organizer,
		"meeting_status":          created,
		"meeting_error":           nil,
		"virtual_link":            event.JoinURL,
	}); err != nil {
		return nil, err
	}
	return getSessionService(id)
}

func markTeamsMeetingFailed(id string, cause error) (*SessionResponse, error) {
	failed := "failed"
	message := "Microsoft Teams could not create the meeting"
	var graphErr *teams.GraphError
	if errors.As(cause, &graphErr) {
		switch graphErr.Status {
		case 401, 404:
			message = "Microsoft Teams organizer cannot be found or accessed. Set MICROSOFT_TEAMS_ORGANIZER to an active Member user in this tenant with a Teams and Exchange Online mailbox."
		case 403:
			message = "Microsoft Graph denied calendar access. Ask a tenant administrator to grant Calendars.ReadWrite application permission and admin consent."
		}
	}
	if err := updateSession(id, map[string]any{
		"meeting_provider": "microsoft_teams",
		"meeting_status":   failed,
		"meeting_error":    message,
	}); err != nil {
		return nil, err
	}
	return nil, errors.New(message)
}
