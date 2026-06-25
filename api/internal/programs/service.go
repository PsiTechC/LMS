package programs

import (
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
)

var ErrPublishNotReady = errors.New("program is not ready to publish")

// ── Programs ──────────────────────────────────────────────────────

func listPublicProgramsService() ([]ProgramDTO, error) {
	list, err := listActivePrograms()
	if err != nil {
		return nil, err
	}
	result := make([]ProgramDTO, 0, len(list))
	for _, p := range list {
		pc, ac, _ := countPhasesAndActivities(p.ID.String())
		result = append(result, programToDTO(p, pc, ac))
	}
	return result, nil
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

	result := make([]ProgramDTO, 0, len(list))
	for _, p := range list {
		pc, ac, _ := countPhasesAndActivities(p.ID.String())
		result = append(result, programToDTO(p, pc, ac))
	}
	return result, nil
}

func getProgramService(id string) (*ProgramDetailDTO, error) {
	p, err := getProgramWithPhases(id)
	if err != nil {
		return nil, err
	}
	return programToDetailDTO(*p), nil
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

	dto := programToDTO(*p, 0, 0)
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

	a := &Activity{
		PhaseID:      uuid.MustParse(req.PhaseID),
		Title:        req.Title,
		Description:  desc,
		Type:         req.Type,
		DeliveryMode: mode,
		SortOrder:    sortOrder,
		DurationMins: dur,
		DueDayOffset: offset,
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
		IsMandatory:  a.IsMandatory,
	}
	if a.Description != nil {
		dto.Description = *a.Description
	}
	return dto
}
