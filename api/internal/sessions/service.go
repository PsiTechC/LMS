package sessions

import (
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/xa-lms/api/internal/shared"
)

func listSessionsService(q ListSessionsQuery) ([]SessionResponse, int64, error) {
	if q.Page < 1 {
		q.Page = 1
	}
	if q.Limit < 1 || q.Limit > 100 {
		q.Limit = 20
	}
	rows, total, err := listSessions(q.CohortID, q.FacultyID, q.Status, (q.Page-1)*q.Limit, q.Limit)
	if err != nil {
		return nil, 0, err
	}
	result := make([]SessionResponse, 0, len(rows))
	for _, s := range rows {
		result = append(result, sessionToDTO(s))
	}
	return result, total, nil
}

func getSessionService(id string) (*SessionResponse, error) {
	s, err := getSessionByID(id)
	if err != nil {
		return nil, err
	}
	dto := sessionToDTO(*s)
	return &dto, nil
}

func createSessionService(req CreateSessionRequest, facultyID string) (*SessionResponse, error) {
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
	cohortID, err := uuid.Parse(req.CohortID)
	if err != nil {
		return nil, errors.New("invalid cohort_id")
	}
	fid, err := uuid.Parse(facultyID)
	if err != nil {
		return nil, errors.New("invalid faculty_id")
	}

	sessionType := req.SessionType
	if sessionType == "" {
		sessionType = "classroom"
	}
	durationMins := req.DurationMins
	if durationMins <= 0 {
		durationMins = 60
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
		CohortID:     cohortID,
		FacultyID:    fid,
		Title:        req.Title,
		Description:  desc,
		SessionType:  sessionType,
		VirtualLink:  link,
		ScheduledAt:  scheduledAt,
		DurationMins: durationMins,
		Status:       "scheduled",
	}
	if err := createSession(s); err != nil {
		return nil, err
	}
	dto := sessionToDTO(*s)
	return &dto, nil
}

func updateSessionService(id string, req UpdateSessionRequest, callerID, callerRole string) (*SessionResponse, error) {
	existing, err := getSessionByID(id)
	if err != nil {
		return nil, err
	}

	// Faculty can only update their own sessions
	if callerRole == shared.RoleFaculty && existing.FacultyID.String() != callerID {
		return nil, errors.New("forbidden")
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
	if req.Status != "" {
		fields["status"] = req.Status
	}
	if req.DurationMins > 0 {
		fields["duration_mins"] = req.DurationMins
	}
	if req.ScheduledAt != "" {
		t, err := time.Parse(time.RFC3339, req.ScheduledAt)
		if err != nil {
			return nil, errors.New("scheduled_at must be RFC3339 format")
		}
		fields["scheduled_at"] = t
	}
	if len(fields) == 0 {
		return nil, errors.New("no fields to update")
	}

	if err := updateSession(id, fields); err != nil {
		return nil, err
	}
	return getSessionService(id)
}

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

func sessionToDTO(s ClassSession) SessionResponse {
	r := SessionResponse{
		ID:           s.ID.String(),
		ProgramID:    s.ProgramID.String(),
		CohortID:     s.CohortID.String(),
		FacultyID:    s.FacultyID.String(),
		Title:        s.Title,
		Description:  s.Description,
		SessionType:  s.SessionType,
		VirtualLink:  s.VirtualLink,
		ScheduledAt:  s.ScheduledAt.Format(time.RFC3339),
		DurationMins: s.DurationMins,
		Status:       s.Status,
		CreatedAt:    s.CreatedAt.Format(time.RFC3339),
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
