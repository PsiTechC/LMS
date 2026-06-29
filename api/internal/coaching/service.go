package coaching

import (
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/xa-lms/api/internal/shared"
)

func createNoteService(req CreateNoteRequest, facultyID string) (*CoachingNoteResponse, error) {
	if strings.TrimSpace(req.SessionID) == "" {
		return nil, errors.New("session_id is required")
	}
	if strings.TrimSpace(req.ParticipantID) == "" {
		return nil, errors.New("participant_id is required")
	}
	if strings.TrimSpace(req.Notes) == "" {
		return nil, errors.New("notes is required")
	}

	sessID, err := uuid.Parse(req.SessionID)
	if err != nil {
		return nil, errors.New("invalid session_id")
	}
	partID, err := uuid.Parse(req.ParticipantID)
	if err != nil {
		return nil, errors.New("invalid participant_id")
	}
	facID, err := uuid.Parse(facultyID)
	if err != nil {
		return nil, errors.New("invalid faculty_id")
	}

	n := &CoachingNote{
		SessionID:     sessID,
		FacultyID:     facID,
		ParticipantID: partID,
		Notes:         req.Notes,
		IsPrivate:     req.IsPrivate,
		CreatedAt:     time.Now(),
		UpdatedAt:     time.Now(),
	}
	if err := createNote(n); err != nil {
		return nil, err
	}
	dto := noteToDTO(*n)
	return &dto, nil
}

func listBySessionService(q ListNotesQuery, callerRole string) ([]CoachingNoteResponse, int64, error) {
	if q.Page < 1 {
		q.Page = 1
	}
	if q.Limit < 1 || q.Limit > 100 {
		q.Limit = 20
	}
	includePrivate := callerRole == shared.RoleFaculty || callerRole == shared.RoleProgramManager || callerRole == shared.RoleSuperAdmin
	rows, total, err := listBySession(q.SessionID, includePrivate, (q.Page-1)*q.Limit, q.Limit)
	if err != nil {
		return nil, 0, err
	}
	result := make([]CoachingNoteResponse, 0, len(rows))
	for _, n := range rows {
		result = append(result, noteToDTO(n))
	}
	return result, total, nil
}

func listByParticipantService(participantID string, q ListNotesQuery, callerRole string) ([]CoachingNoteResponse, int64, error) {
	if q.Page < 1 {
		q.Page = 1
	}
	if q.Limit < 1 || q.Limit > 100 {
		q.Limit = 20
	}
	includePrivate := callerRole == shared.RoleFaculty || callerRole == shared.RoleProgramManager || callerRole == shared.RoleSuperAdmin
	rows, total, err := listByParticipant(participantID, includePrivate, (q.Page-1)*q.Limit, q.Limit)
	if err != nil {
		return nil, 0, err
	}
	result := make([]CoachingNoteResponse, 0, len(rows))
	for _, n := range rows {
		result = append(result, noteToDTO(n))
	}
	return result, total, nil
}

func updateNoteService(id string, req UpdateNoteRequest, callerID string) (*CoachingNoteResponse, error) {
	facID, err := uuid.Parse(callerID)
	if err != nil {
		return nil, errors.New("invalid caller id")
	}
	n, err := updateNote(id, facID, req)
	if err != nil {
		return nil, err
	}
	dto := noteToDTO(*n)
	return &dto, nil
}

func noteToDTO(n CoachingNote) CoachingNoteResponse {
	return CoachingNoteResponse{
		ID:            n.ID.String(),
		SessionID:     n.SessionID.String(),
		FacultyID:     n.FacultyID.String(),
		ParticipantID: n.ParticipantID.String(),
		Notes:         n.Notes,
		IsPrivate:     n.IsPrivate,
		CreatedAt:     n.CreatedAt.Format(time.RFC3339),
		UpdatedAt:     n.UpdatedAt.Format(time.RFC3339),
	}
}
