package programs

import (
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/xa-lms/api/pkg/database"
)

var ErrPublishNotReady = errors.New("program is not ready to publish")

// ── Programs ──────────────────────────────────────────────────────

func listPublicProgramsService() ([]ProgramDTO, error) {
	list, err := listActivePrograms()
	if err != nil {
		return nil, err
	}
	return programsToDTO(list)
}

func listProgramsService(orgID string, isSuperAdmin bool) ([]ProgramDTO, error) {
	var (
		list []Program
		err  error
	)
	if isSuperAdmin {
		list, err = listAllPrograms()
	} else {
		list, err = listProgramsByOrg(orgID)
	}
	if err != nil {
		return nil, err
	}
	return programsToDTO(list)
}

func programsToDTO(list []Program) ([]ProgramDTO, error) {
	if len(list) == 0 {
		return []ProgramDTO{}, nil
	}
	ids := make([]string, len(list))
	for i, p := range list {
		ids[i] = p.ID.String()
	}
	counts, err := batchCountPhasesAndActivities(ids)
	if err != nil {
		return nil, err
	}
	result := make([]ProgramDTO, 0, len(list))
	for _, p := range list {
		c := counts[p.ID.String()]
		result = append(result, programToDTO(p, c[0], c[1]))
	}
	return result, nil
}

func getProgramService(id string) (*ProgramDetailDTO, error) {
	p, err := getProgramWithPhases(id)
	if err != nil {
		return nil, err
	}
	detail := programToDetailDTO(*p)

	// Batch-load faculty for all activities in one query
	var allActIDs []string
	for _, ph := range detail.Phases {
		for _, a := range ph.Activities {
			if a.Type == "live_session" || a.Type == "coaching" {
				allActIDs = append(allActIDs, a.ID)
			}
		}
	}
	if len(allActIDs) > 0 {
		facultyRows, err := listActivitiesFacultyBulk(allActIDs)
		if err == nil {
			// Build map: activityID -> []ActivityFacultyDTO
			facultyMap := make(map[string][]ActivityFacultyDTO)
			for _, r := range facultyRows {
				facultyMap[r.ActivityID] = append(facultyMap[r.ActivityID], afRowToDTO(r))
			}
			// Inject into detail DTO
			for pi, ph := range detail.Phases {
				for ai, a := range ph.Activities {
					if f, ok := facultyMap[a.ID]; ok {
						detail.Phases[pi].Activities[ai].Faculty = f
					}
				}
			}
		}
	}
	return detail, nil
}

func createProgramService(req CreateProgramRequest, orgID, userID string) (*ProgramDTO, error) {
	if strings.TrimSpace(req.Title) == "" {
		return nil, errors.New("title is required")
	}

	color := req.Color
	if color == "" {
		color = "#EF4E24"
	}
	weeks := req.DurationWeeks
	if weeks <= 0 {
		weeks = 20
	}

	var desc *string
	if req.Description != "" {
		desc = &req.Description
	}

	p := &Program{
		OrgID:         uuid.MustParse(orgID),
		CreatedBy:     uuid.MustParse(userID),
		Title:         req.Title,
		Description:   desc,
		Status:        "draft",
		Color:         color,
		DurationWeeks: weeks,
	}

	if err := createProgram(p); err != nil {
		return nil, err
	}
	bustProgramsCache(orgID)

	dto := programToDTO(*p, 0, 0)
	return &dto, nil
}

func deleteProgramService(id string) error {
	p, err := getProgramByID(id)
	if err != nil {
		return err
	}
	if err := deleteProgram(id); err != nil {
		return err
	}
	bustProgramsCache(p.OrgID.String())
	return nil
}

func duplicateProgramService(id string, userID string) (*ProgramDTO, error) {
	src, err := getProgramByID(id)
	if err != nil {
		return nil, err
	}
	newTitle := src.Title + " (Copy)"
	p, err := duplicateProgram(id, newTitle, userID)
	if err != nil {
		return nil, err
	}
	bustProgramsCache(p.OrgID.String())
	pc, ac, _ := countPhasesAndActivities(p.ID.String())
	dto := programToDTO(*p, pc, ac)
	return &dto, nil
}

func updateProgramService(id string, req UpdateProgramRequest) (*ProgramDTO, error) {
	p, err := getProgramByID(id)
	if err != nil {
		return nil, err
	}

	if req.Title != nil {
		p.Title = *req.Title
	}
	if req.Description != nil {
		p.Description = req.Description
	}
	if req.Color != nil {
		p.Color = *req.Color
	}
	if req.DurationWeeks != nil {
		p.DurationWeeks = *req.DurationWeeks
	}
	if req.StartDate != nil {
		t, err := time.Parse("2006-01-02", *req.StartDate)
		if err == nil {
			p.StartDate = &t
		}
	}
	if req.EndDate != nil {
		t, err := time.Parse("2006-01-02", *req.EndDate)
		if err == nil {
			p.EndDate = &t
		}
	}

	if err := saveProgram(p); err != nil {
		return nil, err
	}
	bustProgramsCache(p.OrgID.String())

	pc, ac, _ := countPhasesAndActivities(p.ID.String())
	dto := programToDTO(*p, pc, ac)
	return &dto, nil
}

func publishProgramService(id string) (*ProgramDTO, error) {
	p, err := getProgramWithPhases(id)
	if err != nil {
		return nil, err
	}

	if len(p.Phases) < 1 {
		return nil, ErrPublishNotReady
	}
	for _, ph := range p.Phases {
		if len(ph.Activities) == 0 {
			return nil, ErrPublishNotReady
		}
	}

	now := time.Now()
	p.Status = "active"
	p.PublishedAt = &now

	if err := saveProgram(p); err != nil {
		return nil, err
	}
	bustProgramsCache(p.OrgID.String())

	pc, ac := len(p.Phases), 0
	for _, ph := range p.Phases {
		ac += len(ph.Activities)
	}
	dto := programToDTO(*p, pc, ac)
	return &dto, nil
}

// ── Phases ────────────────────────────────────────────────────────

func upsertPhaseService(programID string, phaseID *string, req UpsertPhaseRequest) (*PhaseDTO, error) {
	color := req.Color
	if color == "" {
		color = "#EF4E24"
	}

	var ph *ProgramPhase
	var err error

	if phaseID != nil {
		ph, err = getPhaseByID(*phaseID)
		if err != nil {
			return nil, err
		}
	} else {
		ph = &ProgramPhase{ProgramID: uuid.MustParse(programID)}
	}

	ph.Title = req.Title
	ph.PhaseNumber = req.PhaseNumber
	ph.Color = color
	if req.StartDay > 0 {
		ph.StartDay = req.StartDay
	}
	if req.EndDay > 0 {
		ph.EndDay = req.EndDay
	}
	if req.WeekLabel != "" {
		ph.WeekLabel = &req.WeekLabel
	}
	if req.Description != "" {
		ph.Description = &req.Description
	}

	if phaseID != nil {
		err = savePhase(ph)
	} else {
		err = createPhase(ph)
	}
	if err != nil {
		return nil, err
	}

	dto := phaseToDTO(*ph)
	return &dto, nil
}

func deletePhaseService(id string) error {
	_, err := getPhaseByID(id)
	if err != nil {
		return err
	}
	return deletePhase(id)
}

func reorderPhasesService(programID string, req ReorderPhasesRequest) error {
	return reorderPhases(programID, req.PhaseIDs)
}

// ── Activities ────────────────────────────────────────────────────

func createActivityService(req CreateActivityRequest) (*ActivityDTO, error) {
	if strings.TrimSpace(req.Title) == "" {
		return nil, errors.New("title is required")
	}
	if req.Type == "" {
		return nil, errors.New("type is required")
	}

	mode := req.DeliveryMode
	if mode == "" {
		mode = "self_paced"
	}
	dur := req.DurationMins
	if dur <= 0 {
		dur = 30
	}
	offset := req.DueDayOffset
	if offset <= 0 {
		offset = 7
	}

	sortOrder, _ := nextActivitySortOrder(req.PhaseID)

	var desc *string
	if req.Description != "" {
		desc = &req.Description
	}

	startDay := req.StartDay
	if startDay <= 0 {
		startDay = 1
	}
	durDays := req.DurationDays
	if durDays <= 0 {
		durDays = 3
	}

	a := &Activity{
		PhaseID:      uuid.MustParse(req.PhaseID),
		Title:        req.Title,
		Description:  desc,
		Type:         req.Type,
		DeliveryMode: mode,
		SortOrder:    sortOrder,
		DurationMins: dur,
		DueDayOffset: offset,
		StartDay:     startDay,
		DurationDays: durDays,
		IsMandatory:  req.IsMandatory,
	}

	if err := createActivity(a); err != nil {
		return nil, err
	}

	dto := activityToDTO(*a)
	return &dto, nil
}

func updateActivityService(id string, req UpdateActivityRequest) (*ActivityDTO, error) {
	a, err := getActivityByID(id)
	if err != nil {
		return nil, err
	}

	if req.Title != nil {
		a.Title = *req.Title
	}
	if req.Description != nil {
		a.Description = req.Description
	}
	if req.DeliveryMode != nil {
		a.DeliveryMode = *req.DeliveryMode
	}
	if req.DurationMins != nil {
		a.DurationMins = *req.DurationMins
	}
	if req.DueDayOffset != nil {
		a.DueDayOffset = *req.DueDayOffset
	}
	if req.StartDay != nil {
		a.StartDay = *req.StartDay
	}
	if req.DurationDays != nil {
		a.DurationDays = *req.DurationDays
	}
	if req.IsMandatory != nil {
		a.IsMandatory = *req.IsMandatory
	}
	if req.SortOrder != nil {
		a.SortOrder = *req.SortOrder
	}

	if err := saveActivity(a); err != nil {
		return nil, err
	}

	dto := activityToDTO(*a)
	return &dto, nil
}

func deleteActivityService(id string) error {
	_, err := getActivityByID(id)
	if err != nil {
		return err
	}
	return deleteActivity(id)
}

// ── Activity Faculty ──────────────────────────────────────────────

func assignFacultyService(activityID string, req AssignFacultyRequest) (*CheckConflictResponse, *ActivityFacultyDTO, error) {
	if req.FacultyUserID == "" {
		return nil, nil, errors.New("faculty_user_id is required")
	}
	role := req.Role
	if role == "" {
		role = "Lead"
	}

	// Check for conflicts first
	conflicts, err := checkFacultyConflicts(req.FacultyUserID, activityID)
	if err != nil {
		return nil, nil, err
	}

	// If conflicts exist and no override note provided, return conflict info for client to handle
	if len(conflicts) > 0 && (req.OverrideNote == nil || *req.OverrideNote == "") {
		dtos := make([]ConflictDTO, 0, len(conflicts))
		for _, c := range conflicts {
			dtos = append(dtos, ConflictDTO{
				ActivityID:    c.ActivityID,
				ActivityTitle: c.ActivityTitle,
				ProgramTitle:  c.ProgramTitle,
				CohortName:    c.CohortName,
				StartDate:     c.StartDate,
				EndDate:       c.EndDate,
				Role:          c.Role,
			})
		}
		return &CheckConflictResponse{HasConflict: true, Conflicts: dtos}, nil, nil
	}

	// Upsert: if already assigned, update role/override_note
	existing, err := getAssignment(activityID, req.FacultyUserID)
	if err != nil {
		return nil, nil, err
	}

	// Parse optional cohort_id
	var cohortUUID *uuid.UUID
	if req.CohortID != "" {
		parsed, err2 := uuid.Parse(req.CohortID)
		if err2 == nil {
			cohortUUID = &parsed
		}
	}

	if existing != nil {
		existing.Role = role
		existing.OverrideNote = req.OverrideNote
		existing.CohortID = cohortUUID
		if err := database.DB.Save(existing).Error; err != nil {
			return nil, nil, err
		}
	} else {
		af := &ActivityFaculty{
			ActivityID:    uuid.MustParse(activityID),
			FacultyUserID: uuid.MustParse(req.FacultyUserID),
			CohortID:      cohortUUID,
			Role:          role,
			OverrideNote:  req.OverrideNote,
		}
		if err := assignFaculty(af); err != nil {
			return nil, nil, err
		}
	}

	// Return the updated faculty list for this activity
	rows, err := listActivityFaculty(activityID)
	if err != nil {
		return nil, nil, err
	}
	for _, r := range rows {
		if r.FacultyUserID == req.FacultyUserID {
			dto := afRowToDTO(r)
			return &CheckConflictResponse{HasConflict: false}, &dto, nil
		}
	}
	return &CheckConflictResponse{HasConflict: false}, nil, nil
}

func removeFacultyService(activityID, facultyUserID string) error {
	return removeFaculty(activityID, facultyUserID)
}

func listActivityFacultyService(activityID string) ([]ActivityFacultyDTO, error) {
	rows, err := listActivityFaculty(activityID)
	if err != nil {
		return nil, err
	}
	out := make([]ActivityFacultyDTO, 0, len(rows))
	for _, r := range rows {
		out = append(out, afRowToDTO(r))
	}
	return out, nil
}

func getFacultyScheduleService(facultyUserID string) ([]FacultyScheduleDay, error) {
	rows, err := listFacultySchedule(facultyUserID)
	if err != nil {
		return nil, err
	}
	out := make([]FacultyScheduleDay, 0, len(rows))
	for _, r := range rows {
		out = append(out, FacultyScheduleDay{
			Date:         r.Date,
			IsBusy:       true,
			SessionID:    r.ActivityID,
			SessionTitle: r.ActivityTitle,
			ProgramTitle: r.ProgramTitle,
			Role:         r.Role,
		})
	}
	return out, nil
}

func listFacultyAssignmentsService(facultyUserID string) ([]FacultyAssignmentDTO, error) {
	rows, err := listFacultyAssignments(facultyUserID)
	if err != nil {
		return nil, err
	}
	out := make([]FacultyAssignmentDTO, 0, len(rows))
	for _, r := range rows {
		out = append(out, FacultyAssignmentDTO{
			ActivityID:    r.ActivityID,
			ActivityTitle: r.ActivityTitle,
			ActivityType:  r.ActivityType,
			PhaseName:     r.PhaseName,
			ProgramID:     r.ProgramID,
			ProgramTitle:  r.ProgramTitle,
			ProgramColor:  r.ProgramColor,
			CohortID:      r.CohortID,
			CohortName:    r.CohortName,
			Role:          r.Role,
			StartDay:      r.StartDay,
			DurationDays:  r.DurationDays,
		})
	}
	return out, nil
}

func listOrgFacultyService(orgID string) ([]map[string]string, error) {
	rows, err := listOrgFaculty(orgID)
	if err != nil {
		return nil, err
	}
	out := make([]map[string]string, 0, len(rows))
	for _, r := range rows {
		out = append(out, map[string]string{
			"id": r.ID, "name": r.Name, "email": r.Email, "avatar_url": r.AvatarURL,
		})
	}
	return out, nil
}

// ── Mappers ───────────────────────────────────────────────────────

func programToDTO(p Program, phaseCount, actCount int) ProgramDTO {
	dto := ProgramDTO{
		ID:            p.ID.String(),
		OrgID:         p.OrgID.String(),
		Title:         p.Title,
		Status:        p.Status,
		Color:         p.Color,
		DurationWeeks: p.DurationWeeks,
		StartDate:     p.StartDate,
		EndDate:       p.EndDate,
		PublishedAt:   p.PublishedAt,
		PhaseCount:    phaseCount,
		ActivityCount: actCount,
		CreatedAt:     p.CreatedAt,
	}
	if p.Description != nil {
		dto.Description = *p.Description
	}
	return dto
}

func programToDetailDTO(p Program) *ProgramDetailDTO {
	pc, ac := len(p.Phases), 0
	for _, ph := range p.Phases {
		ac += len(ph.Activities)
	}
	detail := &ProgramDetailDTO{
		ProgramDTO: programToDTO(p, pc, ac),
		Phases:     make([]PhaseDTO, 0, len(p.Phases)),
	}
	for _, ph := range p.Phases {
		detail.Phases = append(detail.Phases, phaseToDTO(ph))
	}
	return detail
}

func phaseToDTO(ph ProgramPhase) PhaseDTO {
	dto := PhaseDTO{
		ID:          ph.ID.String(),
		ProgramID:   ph.ProgramID.String(),
		Title:       ph.Title,
		PhaseNumber: ph.PhaseNumber,
		Color:       ph.Color,
		StartDay:    ph.StartDay,
		EndDay:      ph.EndDay,
		Activities:  make([]ActivityDTO, 0, len(ph.Activities)),
	}
	if ph.Description != nil {
		dto.Description = *ph.Description
	}
	if ph.WeekLabel != nil {
		dto.WeekLabel = *ph.WeekLabel
	}
	for _, a := range ph.Activities {
		dto.Activities = append(dto.Activities, activityToDTO(a))
	}
	return dto
}

func activityToDTO(a Activity) ActivityDTO {
	dto := ActivityDTO{
		ID:           a.ID.String(),
		PhaseID:      a.PhaseID.String(),
		Title:        a.Title,
		Type:         a.Type,
		DeliveryMode: a.DeliveryMode,
		SortOrder:    a.SortOrder,
		DurationMins: a.DurationMins,
		DueDayOffset: a.DueDayOffset,
		StartDay:     a.StartDay,
		DurationDays: a.DurationDays,
		IsMandatory:  a.IsMandatory,
		Faculty:      []ActivityFacultyDTO{},
	}
	if a.Description != nil {
		dto.Description = *a.Description
	}
	return dto
}

func afRowToDTO(r activityFacultyRow) ActivityFacultyDTO {
	return ActivityFacultyDTO{
		ID:            r.ID,
		ActivityID:    r.ActivityID,
		FacultyUserID: r.FacultyUserID,
		CohortID:      r.CohortID,
		CohortName:    r.CohortName,
		Name:          r.Name,
		Email:         r.Email,
		AvatarURL:     r.AvatarURL,
		Role:          r.Role,
		OverrideNote:  r.OverrideNote,
	}
}
