package coaching

import (
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/xa-lms/api/internal/shared"
	"github.com/xa-lms/api/pkg/database"
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

// ── Participants ──────────────────────────────────────────────────

func listCoachingParticipantsService(facultyID string) ([]CoachingParticipantDTO, error) {
	rows, err := listCoachingParticipants(facultyID)
	if err != nil {
		return nil, err
	}
	dtos := make([]CoachingParticipantDTO, len(rows))
	for i, r := range rows {
		dtos[i] = CoachingParticipantDTO{
			UserID:    r.UserID.String(),
			Name:      r.Name,
			Email:     r.Email,
			AvatarURL: r.AvatarURL,
		}
	}
	return dtos, nil
}

// ── Tracker ───────────────────────────────────────────────────────

func getTrackerService(participantID, facultyID string) (*CoachingTrackerDTO, error) {
	row, err := getTrackerForParticipant(participantID, facultyID)
	if err != nil {
		return nil, err
	}
	var followThrough float64
	if row.ActionsTotal > 0 {
		followThrough = float64(row.ActionsComplete) / float64(row.ActionsTotal) * 100
	}
	return &CoachingTrackerDTO{
		ParticipantID:    participantID,
		SessionsDone:     row.SessionsDone,
		GoalsSet:         row.GoalsSet,
		ActionsPending:   row.ActionsPending,
		FollowThroughPct: followThrough,
	}, nil
}

func getCoachingKPIService(facultyID string) (*CoachingKPIDTO, error) {
	participants, err := listCoachingParticipants(facultyID)
	if err != nil {
		return nil, err
	}
	var totalActionsPending int64
	var totalGoals int64
	var totalSessions int64
	for _, p := range participants {
		row, err := getTrackerForParticipant(p.UserID.String(), facultyID)
		if err != nil {
			continue
		}
		totalActionsPending += row.ActionsPending
		totalGoals += row.GoalsSet
		totalSessions += row.SessionsDone
	}
	n := int64(len(participants))
	var avgGoalPct float64
	if n > 0 && totalGoals > 0 {
		// Use goals set as a proxy for progress (completed goals / total)
		var completedGoals int64
		database.DB.Model(&ParticipantGoal{}).
			Where("faculty_id = ? AND status = 'completed'", facultyID).
			Count(&completedGoals)
		avgGoalPct = float64(completedGoals) / float64(totalGoals) * 100
	}
	return &CoachingKPIDTO{
		TotalParticipants:  n,
		SessionsDone:       totalSessions,
		ActionsPending:     totalActionsPending,
		AvgGoalProgressPct: avgGoalPct,
	}, nil
}

// ── Goals ─────────────────────────────────────────────────────────

func createGoalService(req CreateGoalRequest, facultyID string) (*GoalDTO, error) {
	if strings.TrimSpace(req.Title) == "" {
		return nil, errors.New("title is required")
	}
	pID, err := uuid.Parse(req.ParticipantID)
	if err != nil {
		return nil, errors.New("invalid participant_id")
	}
	fID, err := uuid.Parse(facultyID)
	if err != nil {
		return nil, errors.New("invalid faculty_id")
	}
	g := &ParticipantGoal{
		ParticipantID: pID,
		FacultyID:     fID,
		Title:         req.Title,
		Description:   req.Description,
		Status:        "active",
		PmCanView:     req.PmCanView,
		CreatedAt:     time.Now(),
		UpdatedAt:     time.Now(),
	}
	if req.TargetDate != nil && *req.TargetDate != "" {
		t, err := time.Parse("2006-01-02", *req.TargetDate)
		if err == nil {
			g.TargetDate = &t
		}
	}
	if err := createGoal(g); err != nil {
		return nil, err
	}
	dto := goalToDTO(*g)
	return &dto, nil
}

func listGoalsService(participantID, facultyID string) ([]GoalDTO, error) {
	goals, err := listGoals(participantID, facultyID)
	if err != nil {
		return nil, err
	}
	dtos := make([]GoalDTO, len(goals))
	for i, g := range goals {
		dtos[i] = goalToDTO(g)
	}
	return dtos, nil
}

func updateGoalService(id string, req UpdateGoalRequest, facultyID string) (*GoalDTO, error) {
	fID, err := uuid.Parse(facultyID)
	if err != nil {
		return nil, errors.New("invalid faculty_id")
	}
	g, err := updateGoal(id, fID, req)
	if err != nil {
		return nil, err
	}
	dto := goalToDTO(*g)
	return &dto, nil
}

func deleteGoalService(id, facultyID string) error {
	fID, err := uuid.Parse(facultyID)
	if err != nil {
		return errors.New("invalid faculty_id")
	}
	return deleteGoal(id, fID)
}

func goalToDTO(g ParticipantGoal) GoalDTO {
	dto := GoalDTO{
		ID:            g.ID.String(),
		ParticipantID: g.ParticipantID.String(),
		FacultyID:     g.FacultyID.String(),
		Title:         g.Title,
		Description:   g.Description,
		Status:        g.Status,
		PmCanView:     g.PmCanView,
		CreatedAt:     g.CreatedAt.Format(time.RFC3339),
		UpdatedAt:     g.UpdatedAt.Format(time.RFC3339),
	}
	if g.TargetDate != nil {
		s := g.TargetDate.Format("2006-01-02")
		dto.TargetDate = &s
	}
	return dto
}

// ── Dev Notes ─────────────────────────────────────────────────────

func createDevNoteService(req CreateDevNoteRequest, facultyID string) (*DevNoteDTO, error) {
	if strings.TrimSpace(req.Content) == "" {
		return nil, errors.New("content is required")
	}
	pID, err := uuid.Parse(req.ParticipantID)
	if err != nil {
		return nil, errors.New("invalid participant_id")
	}
	fID, err := uuid.Parse(facultyID)
	if err != nil {
		return nil, errors.New("invalid faculty_id")
	}
	d := &CoachingDevNote{
		ParticipantID: pID,
		FacultyID:     fID,
		Content:       req.Content,
		PmCanView:     req.PmCanView,
		CreatedAt:     time.Now(),
		UpdatedAt:     time.Now(),
	}
	if err := createDevNote(d); err != nil {
		return nil, err
	}
	dto := devNoteToDTO(*d)
	return &dto, nil
}

func listDevNotesService(participantID, facultyID, callerRole string) ([]DevNoteDTO, error) {
	// PM can only read dev notes if pm_can_view=true; faculty sees all their own notes
	if callerRole != shared.RoleFaculty && callerRole != shared.RoleProgramManager && callerRole != shared.RoleSuperAdmin {
		return nil, ErrForbidden
	}
	notes, err := listDevNotes(participantID, facultyID, callerRole)
	if err != nil {
		return nil, err
	}
	dtos := make([]DevNoteDTO, len(notes))
	for i, d := range notes {
		dtos[i] = devNoteToDTO(d)
	}
	return dtos, nil
}

func updateDevNoteService(id string, req UpdateDevNoteRequest, facultyID string) (*DevNoteDTO, error) {
	fID, err := uuid.Parse(facultyID)
	if err != nil {
		return nil, errors.New("invalid faculty_id")
	}
	d, err := updateDevNote(id, fID, req)
	if err != nil {
		return nil, err
	}
	dto := devNoteToDTO(*d)
	return &dto, nil
}

func devNoteToDTO(d CoachingDevNote) DevNoteDTO {
	return DevNoteDTO{
		ID:            d.ID.String(),
		ParticipantID: d.ParticipantID.String(),
		FacultyID:     d.FacultyID.String(),
		Content:       d.Content,
		PmCanView:     d.PmCanView,
		CreatedAt:     d.CreatedAt.Format(time.RFC3339),
		UpdatedAt:     d.UpdatedAt.Format(time.RFC3339),
	}
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
