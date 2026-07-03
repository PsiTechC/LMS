package coaching

import (
	"encoding/json"
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

// â”€â”€ Participants â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

func listCoachingParticipantsService(facultyID, cohortID string) ([]CoachingParticipantDTO, error) {
	rows, err := listCoachingParticipants(facultyID, cohortID)
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

// â”€â”€ Tracker â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

func getCoachingKPIService(facultyID, cohortID string) (*CoachingKPIDTO, error) {
	participants, err := listCoachingParticipants(facultyID, cohortID)
	if err != nil {
		return nil, err
	}
	var totalActionsPending int64
	var totalGoals int64
	var totalSessions int64
	participantIDs := make([]string, 0, len(participants))
	for _, p := range participants {
		row, err := getTrackerForParticipant(p.UserID.String(), facultyID)
		if err != nil {
			continue
		}
		totalActionsPending += row.ActionsPending
		totalGoals += row.GoalsSet
		totalSessions += row.SessionsDone
		participantIDs = append(participantIDs, p.UserID.String())
	}
	n := int64(len(participants))
	var avgGoalPct float64
	if n > 0 && totalGoals > 0 {
		var completedGoals int64
		db := database.DB.Model(&ParticipantGoal{}).Where("faculty_id = ? AND status = 'completed'", facultyID)
		if len(participantIDs) > 0 {
			db = db.Where("participant_id IN (?)", participantIDs)
		}
		db.Count(&completedGoals)
		avgGoalPct = float64(completedGoals) / float64(totalGoals) * 100
	}
	return &CoachingKPIDTO{
		TotalParticipants:  n,
		SessionsDone:       totalSessions,
		ActionsPending:     totalActionsPending,
		AvgGoalProgressPct: avgGoalPct,
	}, nil
}

// â”€â”€ Goals â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

// ── Participant self-view ─────────────────────────────────────────

// getMyCoachingService assembles the participant's read-only coaching view:
// their assigned coach + session progress (from the engagement), their goals,
// and non-private session notes. Returns an empty (HasEngagement=false) DTO
// when the participant has no coaching engagement yet.
func getMyCoachingService(participantID string, programID string) (*MyCoachingDTO, error) {
	dto := &MyCoachingDTO{
		Goals:        []MyCoachingGoalDTO{},
		SessionNotes: []MyCoachingNoteDTO{},
	}

	eng, err := getMyEngagement(participantID, programID)
	if err != nil && !errors.Is(err, ErrNotFound) {
		return nil, err
	}
	if eng != nil {
		dto.HasEngagement = true
		dto.CoachName = eng.CoachName
		dto.CoachCredential = "Executive Coach" // credential not yet stored on the coach profile
		dto.EngagementName = eng.EngagementName
		dto.AssignmentType = eng.AssignmentType
		dto.Frequency = eng.Frequency
		dto.Status = eng.Status
		dto.TotalSessions = eng.TotalSessions
		dto.CompletedSessions = eng.CompletedSessions
	}

	goals, err := listGoalsForParticipant(participantID)
	if err != nil {
		return nil, err
	}
	for _, g := range goals {
		gd := MyCoachingGoalDTO{ID: g.ID.String(), Title: g.Title, Description: g.Description, Status: g.Status}
		if g.TargetDate != nil {
			s := g.TargetDate.Format("2006-01-02")
			gd.TargetDate = &s
		}
		dto.Goals = append(dto.Goals, gd)
	}

	notes, err := listSessionNotesForParticipant(participantID)
	if err != nil {
		return nil, err
	}
	for _, n := range notes {
		dto.SessionNotes = append(dto.SessionNotes, MyCoachingNoteDTO{
			ID: n.ID.String(), Notes: n.Notes, CreatedAt: n.CreatedAt.Format(time.RFC3339),
		})
	}

	return dto, nil
}

// â”€â”€ Dev Notes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

// -- PM coaching admin ---------------------------------------------

func adminOptionsService(orgID string) (*CoachingAdminOptionsDTO, error) {
	programs, err := listAdminPrograms(orgID)
	if err != nil {
		return nil, err
	}
	cohorts, err := listAdminCohorts(orgID)
	if err != nil {
		return nil, err
	}
	participants, err := listAdminParticipants(orgID)
	if err != nil {
		return nil, err
	}
	coaches, err := listAdminCoaches(orgID)
	if err != nil {
		return nil, err
	}
	return &CoachingAdminOptionsDTO{Programs: programs, Cohorts: cohorts, Participants: participants, Coaches: coaches}, nil
}

func listAdminEngagementsService(orgID string) ([]CoachingEngagementDTO, error) {
	rows, err := listAdminEngagements(orgID)
	if err != nil {
		return nil, err
	}
	parts, err := listEngagementParticipants(orgID)
	if err != nil {
		return nil, err
	}
	byEngagement := map[string][]CoachingAdminOptionDTO{}
	for _, p := range parts {
		key := p.EngagementID.String()
		byEngagement[key] = append(byEngagement[key], CoachingAdminOptionDTO{ID: p.UserID.String(), Name: p.Name, Email: p.Email})
	}
	dtos := make([]CoachingEngagementDTO, 0, len(rows))
	for _, r := range rows {
		dtos = append(dtos, engagementToDTO(r, byEngagement[r.ID.String()]))
	}
	return dtos, nil
}

func createAdminEngagementService(req CreateCoachingEngagementRequest, assignedBy string) (*CoachingEngagementDTO, error) {
	req.OrgID = strings.TrimSpace(req.OrgID)
	req.ProgramID = strings.TrimSpace(req.ProgramID)
	req.CoachID = strings.TrimSpace(req.CoachID)
	req.AssignmentType = strings.TrimSpace(req.AssignmentType)
	req.Frequency = strings.TrimSpace(req.Frequency)
	req.Name = strings.TrimSpace(req.Name)
	if req.OrgID == "" || req.ProgramID == "" || req.CoachID == "" {
		return nil, errors.New("org_id, program_id and coach_id are required")
	}
	if req.AssignmentType != "individual" && req.AssignmentType != "group" {
		return nil, errors.New("assignment_type must be individual or group")
	}
	if req.TotalSessions < 1 {
		req.TotalSessions = 6
	}
	if req.TotalSessions > 24 {
		return nil, errors.New("total_sessions cannot exceed 24")
	}
	if req.Frequency == "" {
		req.Frequency = "Bi-weekly"
	}
	participantIDs := uniqueNonEmpty(req.ParticipantIDs)
	if req.AssignmentType == "individual" && len(participantIDs) != 1 {
		return nil, errors.New("individual coaching requires exactly one participant")
	}
	if req.AssignmentType == "group" && len(participantIDs) < 2 {
		return nil, errors.New("group coaching requires at least two participants")
	}
	req.ParticipantIDs = participantIDs
	if req.StartDate != nil && strings.TrimSpace(*req.StartDate) != "" {
		if _, err := time.Parse("2006-01-02", strings.TrimSpace(*req.StartDate)); err != nil {
			return nil, errors.New("start_date must be YYYY-MM-DD")
		}
	}
	if n, err := countOrgProgram(req.OrgID, req.ProgramID); err != nil || n == 0 {
		if err != nil {
			return nil, err
		}
		return nil, errors.New("program does not belong to this org")
	}
	if req.CohortID != nil && strings.TrimSpace(*req.CohortID) != "" {
		if n, err := countOrgCohort(req.OrgID, strings.TrimSpace(*req.CohortID), req.ProgramID); err != nil || n == 0 {
			if err != nil {
				return nil, err
			}
			return nil, errors.New("cohort does not belong to this program")
		}
	}
	if n, err := countOrgCoach(req.OrgID, req.CoachID); err != nil || n == 0 {
		if err != nil {
			return nil, err
		}
		return nil, errors.New("coach is not active faculty in this org")
	}
	if n, err := countOrgParticipants(req.OrgID, req.ParticipantIDs); err != nil || n != int64(len(req.ParticipantIDs)) {
		if err != nil {
			return nil, err
		}
		return nil, errors.New("one or more participants are not in this org")
	}
	goals := make([]string, 0, len(req.Goals))
	for _, g := range req.Goals {
		if trimmed := strings.TrimSpace(g); trimmed != "" {
			goals = append(goals, trimmed)
		}
	}
	goalsJSON, err := json.Marshal(goals)
	if err != nil {
		return nil, err
	}
	assignerID, err := uuid.Parse(assignedBy)
	if err != nil {
		return nil, errors.New("invalid assigned_by")
	}
	row, err := createAdminEngagement(req, assignerID, goalsJSON)
	if err != nil {
		return nil, err
	}
	parts, err := listEngagementParticipants(req.OrgID)
	if err != nil {
		return nil, err
	}
	byEngagement := map[string][]CoachingAdminOptionDTO{}
	for _, p := range parts {
		key := p.EngagementID.String()
		byEngagement[key] = append(byEngagement[key], CoachingAdminOptionDTO{ID: p.UserID.String(), Name: p.Name, Email: p.Email})
	}
	dto := engagementToDTO(*row, byEngagement[row.ID.String()])
	return &dto, nil
}

func engagementToDTO(r CoachingEngagementRow, participants []CoachingAdminOptionDTO) CoachingEngagementDTO {
	var goals []string
	_ = json.Unmarshal([]byte(r.GoalsJSON), &goals)
	var cohortID *string
	if r.CohortID != nil {
		s := r.CohortID.String()
		cohortID = &s
	}
	var startDate *string
	if r.StartDate != nil {
		s := r.StartDate.Format("2006-01-02")
		startDate = &s
	}
	return CoachingEngagementDTO{
		ID:                r.ID.String(),
		OrgID:             r.OrgID.String(),
		ProgramID:         r.ProgramID.String(),
		ProgramTitle:      r.ProgramTitle,
		CohortID:          cohortID,
		CohortName:        r.CohortName,
		CoachID:           r.CoachID.String(),
		CoachName:         r.CoachName,
		AssignedByID:      r.AssignedByID.String(),
		AssignedByName:    r.AssignedByName,
		AssignmentType:    r.AssignmentType,
		Name:              r.Name,
		Status:            r.Status,
		StartDate:         startDate,
		Frequency:         r.Frequency,
		TotalSessions:     r.TotalSessions,
		CompletedSessions: r.CompletedSessions,
		Goals:             goals,
		Participants:      participants,
		CreatedAt:         r.CreatedAt.Format(time.RFC3339),
		UpdatedAt:         r.UpdatedAt.Format(time.RFC3339),
	}
}

func uniqueNonEmpty(in []string) []string {
	seen := map[string]bool{}
	out := []string{}
	for _, v := range in {
		v = strings.TrimSpace(v)
		if v == "" || seen[v] {
			continue
		}
		seen[v] = true
		out = append(out, v)
	}
	return out
}
