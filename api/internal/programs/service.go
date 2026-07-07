package programs

import (
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/xa-lms/api/internal/shared"
	"github.com/xa-lms/api/pkg/database"
	"github.com/xa-lms/api/pkg/seed"
)

var ErrForbidden = errors.New("access denied")

// ── Programs ──────────────────────────────────────────────────────

func listPublicProgramsService() ([]ProgramDTO, error) {
	list, err := listActivePrograms()
	if err != nil {
		return nil, err
	}
	return programsToDTO(list)
}

var ErrNotOpen = errors.New("program is not open for enrollment")

// enrollPublicProgramService self-enrolls a logged-in visitor into an Open
// Program. The learner lands in the platform-wide "XA-LMS" org, in the program's
// default "Unassigned" cohort. Idempotent — re-enrolling is a no-op.
func enrollPublicProgramService(programID, userID string) (string, error) {
	p, err := getProgramByID(programID)
	if err != nil {
		return "", err
	}
	if !p.IsOpen {
		return "", ErrNotOpen
	}

	orgID := seed.DefaultOrgID()
	if orgID == "" {
		return "", errors.New("default organization is not available")
	}

	cohortID, err := ensureUnassignedCohort(orgID, programID)
	if err != nil {
		return "", err
	}
	if err := enrollSelfInCohort(userID, orgID, cohortID); err != nil {
		return "", err
	}
	return programID, nil
}

func listProgramsService(orgID, callerRole, callerID string) ([]ProgramDTO, error) {
	var (
		list []Program
		err  error
	)
	switch {
	case callerRole == shared.RoleFaculty:
		list, err = listProgramsByFaculty(callerID)
	case (callerRole == shared.RoleSuperAdmin || callerRole == shared.RoleSuperAdminSecondary) && orgID == "":
		// Superadmin viewing "All Orgs" — no org filter applied.
		list, err = listAllPrograms()
	default:
		// Superadmin with a specific org selected, and all other org-scoped
		// roles (which always pass a concrete org_id), are filtered by org.
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
	enrollStats, _ := batchEnrollmentStats(ids) // non-fatal; zeros on error
	result := make([]ProgramDTO, 0, len(list))
	for _, p := range list {
		c := counts[p.ID.String()]
		es := enrollStats[p.ID.String()]
		result = append(result, programToDTO(p, c[0], c[1], es[0], es[1]))
	}
	return result, nil
}

// checkFacultyAccess returns ErrForbidden if the faculty neither created the
// program nor has at least one assigned activity within it.
// Non-faculty roles always pass.
func checkFacultyAccess(programID, callerRole, callerID string) error {
	if callerRole != shared.RoleFaculty {
		return nil
	}
	ok, err := isFacultyAuthorisedForProgram(programID, callerID)
	if err != nil {
		return err
	}
	if !ok {
		return ErrForbidden
	}
	return nil
}

func getProgramService(id string) (*ProgramDetailDTO, error) {
	p, err := getProgramWithPhases(id)
	if err != nil {
		return nil, err
	}
	detail := programToDetailDTO(*p)

	// Batch-load faculty for all live_session/coaching activities in one query —
	// these can be flat phase activities OR nested inside a module's pre/post slots.
	var allActIDs []string
	collectID := func(a ActivityDTO) {
		if a.Type == "live_session" || a.Type == "coaching" {
			allActIDs = append(allActIDs, a.ID)
		}
	}
	for _, ph := range detail.Phases {
		for _, a := range ph.Activities {
			collectID(a)
		}
		for _, m := range ph.Modules {
			for _, a := range m.Pre {
				collectID(a)
			}
			for _, a := range m.Post {
				collectID(a)
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
				for mi, m := range ph.Modules {
					for ai, a := range m.Pre {
						if f, ok := facultyMap[a.ID]; ok {
							detail.Phases[pi].Modules[mi].Pre[ai].Faculty = f
						}
					}
					for ai, a := range m.Post {
						if f, ok := facultyMap[a.ID]; ok {
							detail.Phases[pi].Modules[mi].Post[ai].Faculty = f
						}
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

	dto := programToDTO(*p, 0, 0, 0, 0)
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
	dto := programToDTO(*p, pc, ac, 0, 0)
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
	if req.IsOpen != nil {
		p.IsOpen = *req.IsOpen
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
	dto := programToDTO(*p, pc, ac, 0, 0)
	return &dto, nil
}

func publishProgramService(id string) (*ProgramDTO, error) {
	p, err := getProgramWithPhases(id)
	if err != nil {
		return nil, err
	}

	phaseActivityCount := func(ph ProgramPhase) int {
		n := len(ph.Activities)
		for _, m := range ph.Modules {
			n += len(m.Activities)
		}
		return n
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
		ac += phaseActivityCount(ph)
	}
	dto := programToDTO(*p, pc, ac, 0, 0)
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
	if req.PhaseType != "" {
		if !isValidPhaseType(req.PhaseType) {
			return nil, errors.New("invalid phase_type")
		}
		ph.PhaseType = req.PhaseType
	} else if phaseID == nil {
		ph.PhaseType = "custom"
	}
	if req.DeliveryMode != "" {
		ph.DeliveryMode = req.DeliveryMode
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

// ── Modules ───────────────────────────────────────────────────────

func createModuleService(phaseID string, req UpsertModuleRequest) (*ModuleDTO, error) {
	if strings.TrimSpace(req.Title) == "" {
		return nil, errors.New("title is required")
	}
	mode := req.DeliveryMode
	if mode != "virtual" && mode != "in-person" {
		mode = "virtual"
	}
	sortOrder, _ := nextModuleSortOrder(phaseID)

	m := &ProgramModule{
		PhaseID:      uuid.MustParse(phaseID),
		Title:        req.Title,
		DeliveryMode: mode,
		SortOrder:    sortOrder,
	}
	if req.SessionDate != "" {
		if t, err := time.Parse("2006-01-02", req.SessionDate); err == nil {
			m.SessionDate = &t
		}
	}
	if err := createModule(m); err != nil {
		return nil, err
	}
	dto := moduleToDTO(*m)
	return &dto, nil
}

func updateModuleService(id string, req UpsertModuleRequest) (*ModuleDTO, error) {
	m, err := getModuleByID(id)
	if err != nil {
		return nil, err
	}
	if req.Title != "" {
		m.Title = req.Title
	}
	if req.DeliveryMode == "virtual" || req.DeliveryMode == "in-person" {
		m.DeliveryMode = req.DeliveryMode
	}
	if req.SessionDate != "" {
		if t, err := time.Parse("2006-01-02", req.SessionDate); err == nil {
			m.SessionDate = &t
		}
	}
	if err := saveModule(m); err != nil {
		return nil, err
	}
	dto := moduleToDTO(*m)
	return &dto, nil
}

func deleteModuleService(id string) error {
	if _, err := getModuleByID(id); err != nil {
		return err
	}
	return deleteModule(id)
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

	if err := validateActivityConfig(req.Type, req.Config); err != nil {
		return nil, err
	}
	cfg := req.Config
	if len(cfg) == 0 {
		cfg = []byte("{}")
	}

	if req.ModuleID != "" {
		if req.Slot != "pre" && req.Slot != "post" {
			return nil, errors.New("slot must be 'pre' or 'post' when module_id is set")
		}
	} else if req.Slot != "" {
		return nil, errors.New("slot requires module_id")
	}

	a := &Activity{
		PhaseID:      uuid.MustParse(req.PhaseID),
		Slot:         req.Slot,
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
		ConfigJSON:   cfg,
	}
	if req.ModuleID != "" {
		mid := uuid.MustParse(req.ModuleID)
		a.ModuleID = &mid
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
	if len(req.Config) > 0 {
		if err := validateActivityConfig(a.Type, req.Config); err != nil {
			return nil, err
		}
		a.ConfigJSON = req.Config
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

func listOrgFacultyProfilesService(orgID string) ([]OrgFacultyProfileDTO, error) {
	rows, err := listOrgFaculty(orgID)
	if err != nil {
		return nil, err
	}
	statsMap, _ := getFacultySessionStats(orgID)
	l1Map, _ := getFacultyL1Scores(orgID)

	out := make([]OrgFacultyProfileDTO, 0, len(rows))
	for _, r := range rows {
		var certs []string
		if r.Certifications != "" {
			for _, c := range splitComma(r.Certifications) {
				if c != "" {
					certs = append(certs, c)
				}
			}
		}
		if certs == nil {
			certs = []string{}
		}

		st := statsMap[r.ID]
		l1 := l1Map[r.ID]

		programIDs, programTitles, _ := getFacultyProgramLinks(r.ID)
		if programIDs == nil {
			programIDs = []string{}
		}
		if programTitles == nil {
			programTitles = []string{}
		}

		out = append(out, OrgFacultyProfileDTO{
			ID:               r.ID,
			Name:             r.Name,
			Email:            r.Email,
			AvatarURL:        r.AvatarURL,
			Specialization:   r.Specialization,
			Bio:              r.Bio,
			Phone:            r.Phone,
			Location:         r.Location,
			LinkedinURL:      r.LinkedinURL,
			Certifications:   certs,
			OnboardingStatus: r.OnboardingStatus,
			SessionsCount:    st.Sessions,
			ScheduledCount:   st.Scheduled,
			EngagementPct:    st.EngagementPct,
			AvgL1Score:       l1.AvgScore,
			ProgramIDs:       programIDs,
			ProgramTitles:    programTitles,
		})
	}
	return out, nil
}

func getFacultyDashboardService(orgID string) (*FacultyDashboardDTO, error) {
	profiles, err := listOrgFacultyProfilesService(orgID)
	if err != nil {
		return nil, err
	}

	var totalSessions, totalEngagement int
	var totalL1 float64
	l1Count := 0

	rows := make([]FacultyPerformanceRow, 0, len(profiles))
	for _, p := range profiles {
		totalSessions += p.SessionsCount
		totalEngagement += p.EngagementPct
		if p.AvgL1Score > 0 {
			totalL1 += p.AvgL1Score
			l1Count++
		}
		rows = append(rows, FacultyPerformanceRow{
			FacultyID:      p.ID,
			FacultyName:    p.Name,
			AvatarURL:      p.AvatarURL,
			Specialization: p.Specialization,
			Sessions:       p.SessionsCount,
			Scheduled:      p.ScheduledCount,
			EngagementPct:  p.EngagementPct,
			AvgL1Score:     p.AvgL1Score,
			Status:         p.OnboardingStatus,
		})
	}

	avgEng := 0
	if len(profiles) > 0 {
		avgEng = totalEngagement / len(profiles)
	}
	avgL1 := 0.0
	if l1Count > 0 {
		avgL1 = totalL1 / float64(l1Count)
	}

	return &FacultyDashboardDTO{
		TotalFaculty:      len(profiles),
		SessionsDelivered: totalSessions,
		AvgEngagement:     avgEng,
		AvgL1Reaction:     avgL1,
		FacultyRows:       rows,
	}, nil
}

func getFacultyL1L4SummaryService(orgID string) ([]FacultyL1L4SummaryDTO, error) {
	rows, err := listOrgFaculty(orgID)
	if err != nil {
		return nil, err
	}
	l1Map, _ := getFacultyL1Scores(orgID)
	l234Map, _ := getFacultyL2L3L4Scores(orgID)

	out := make([]FacultyL1L4SummaryDTO, 0, len(rows))
	for _, r := range rows {
		l1 := l1Map[r.ID]
		l234 := l234Map[r.ID]
		out = append(out, FacultyL1L4SummaryDTO{
			FacultyID:      r.ID,
			FacultyName:    r.Name,
			AvatarURL:      r.AvatarURL,
			Specialization: r.Specialization,
			AvgL1:          l1.AvgScore,
			AvgL2:          l234.AvgL2,
			AvgL3:          l234.AvgL3,
			AvgL4:          l234.AvgL4,
			L1Responses:    l1.TotalResp,
			L2Responses:    l234.L2Resp,
			L3Responses:    l234.L3Resp,
			L4Responses:    l234.L4Resp,
		})
	}
	return out, nil
}

func updateFacultyProfileService(userID string, req UpdateFacultyProfileRequest) error {
	return updateFacultyProfile(userID, req)
}

func splitComma(s string) []string {
	if s == "" {
		return nil
	}
	var out []string
	start := 0
	for i := 0; i <= len(s); i++ {
		if i == len(s) || s[i] == ',' {
			part := s[start:i]
			out = append(out, part)
			start = i + 1
		}
	}
	return out
}

// ── Mappers ───────────────────────────────────────────────────────

func programToDTO(p Program, phaseCount, actCount, enrolledCount, avgCompletion int) ProgramDTO {
	dto := ProgramDTO{
		ID:            p.ID.String(),
		OrgID:         p.OrgID.String(),
		Title:         p.Title,
		Status:        p.Status,
		Color:         p.Color,
		IsOpen:        p.IsOpen,
		DurationWeeks: p.DurationWeeks,
		StartDate:     p.StartDate,
		EndDate:       p.EndDate,
		PublishedAt:   p.PublishedAt,
		PhaseCount:    phaseCount,
		ActivityCount: actCount,
		EnrolledCount: enrolledCount,
		AvgCompletion: avgCompletion,
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
		for _, m := range ph.Modules {
			ac += len(m.Activities)
		}
	}
	detail := &ProgramDetailDTO{
		ProgramDTO: programToDTO(p, pc, ac, 0, 0),
		Phases:     make([]PhaseDTO, 0, len(p.Phases)),
	}
	for _, ph := range p.Phases {
		detail.Phases = append(detail.Phases, phaseToDTO(ph))
	}
	return detail
}

func phaseToDTO(ph ProgramPhase) PhaseDTO {
	dto := PhaseDTO{
		ID:           ph.ID.String(),
		ProgramID:    ph.ProgramID.String(),
		Title:        ph.Title,
		PhaseNumber:  ph.PhaseNumber,
		Color:        ph.Color,
		StartDay:     ph.StartDay,
		EndDay:       ph.EndDay,
		PhaseType:    ph.PhaseType,
		DeliveryMode: ph.DeliveryMode,
		Modules:      make([]ModuleDTO, 0, len(ph.Modules)),
		Activities:   make([]ActivityDTO, 0, len(ph.Activities)),
	}
	if ph.Description != nil {
		dto.Description = *ph.Description
	}
	if ph.WeekLabel != nil {
		dto.WeekLabel = *ph.WeekLabel
	}
	for _, m := range ph.Modules {
		dto.Modules = append(dto.Modules, moduleToDTO(m))
	}
	for _, a := range ph.Activities {
		dto.Activities = append(dto.Activities, activityToDTO(a))
	}
	return dto
}

func moduleToDTO(m ProgramModule) ModuleDTO {
	dto := ModuleDTO{
		ID:           m.ID.String(),
		PhaseID:      m.PhaseID.String(),
		Title:        m.Title,
		DeliveryMode: m.DeliveryMode,
		SortOrder:    m.SortOrder,
		Pre:          []ActivityDTO{},
		Post:         []ActivityDTO{},
	}
	if m.SessionDate != nil {
		dto.SessionDate = m.SessionDate.Format("2006-01-02")
	}
	for _, a := range m.Activities {
		ad := activityToDTO(a)
		if a.Slot == "pre" {
			dto.Pre = append(dto.Pre, ad)
		} else if a.Slot == "post" {
			dto.Post = append(dto.Post, ad)
		}
	}
	return dto
}

func activityToDTO(a Activity) ActivityDTO {
	dto := ActivityDTO{
		ID:           a.ID.String(),
		PhaseID:      a.PhaseID.String(),
		Slot:         a.Slot,
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
	if a.ModuleID != nil {
		dto.ModuleID = a.ModuleID.String()
	}
	if a.Description != nil {
		dto.Description = *a.Description
	}
	if len(a.ConfigJSON) > 0 && string(a.ConfigJSON) != "{}" {
		dto.Config = json.RawMessage(a.ConfigJSON)
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

// ── Program Materials ─────────────────────────────────────────────

func listProgramMaterialsService(programID string) ([]ProgramMaterialDTO, error) {
	mats, err := listProgramMaterials(programID)
	if err != nil {
		return nil, err
	}
	dtos := make([]ProgramMaterialDTO, len(mats))
	for i, m := range mats {
		dtos[i] = ProgramMaterialDTO{
			ID:         m.ID.String(),
			ProgramID:  m.ProgramID.String(),
			UploadedBy: m.UploadedBy.String(),
			Title:      m.Title,
			Type:       m.Type,
			URL:        m.URL,
			SizeBytes:  m.SizeBytes,
			CreatedAt:  m.CreatedAt.Format(time.RFC3339),
		}
	}
	return dtos, nil
}

func addProgramMaterialService(programID, uploaderID string, req AddProgramMaterialRequest) (*ProgramMaterialDTO, error) {
	if req.Title == "" || req.URL == "" || req.Type == "" {
		return nil, errors.New("title, type and url are required")
	}
	pID, err := uuid.Parse(programID)
	if err != nil {
		return nil, errors.New("invalid program_id")
	}
	uID, err := uuid.Parse(uploaderID)
	if err != nil {
		return nil, errors.New("invalid uploader id")
	}
	m := &ProgramMaterial{
		ProgramID:  pID,
		UploadedBy: uID,
		Title:      req.Title,
		Type:       req.Type,
		URL:        req.URL,
		SizeBytes:  req.SizeBytes,
	}
	if err := createProgramMaterial(m); err != nil {
		return nil, err
	}
	dto := &ProgramMaterialDTO{
		ID:         m.ID.String(),
		ProgramID:  m.ProgramID.String(),
		UploadedBy: m.UploadedBy.String(),
		Title:      m.Title,
		Type:       m.Type,
		URL:        m.URL,
		SizeBytes:  m.SizeBytes,
		CreatedAt:  m.CreatedAt.Format(time.RFC3339),
	}
	return dto, nil
}

func deleteProgramMaterialService(materialID, programID string) error {
	return deleteProgramMaterial(materialID, programID)
}

// ── Session Scheduling ────────────────────────────────────────────────────────

// scheduleSessionService creates a class_sessions row from the PM's scheduling form.
// It calls the sessions package via the shared database connection to avoid cross-package imports.
func scheduleSessionService(req ScheduleSessionRequest) (*ScheduledSessionDTO, error) {
	if req.ActivityID == "" {
		return nil, errors.New("activity_id is required")
	}
	if req.ProgramID == "" {
		return nil, errors.New("program_id is required")
	}
	if req.FacultyID == "" {
		return nil, errors.New("faculty_id is required")
	}
	if req.ScheduledAt == "" {
		return nil, errors.New("scheduled_at is required")
	}

	actID, err := uuid.Parse(req.ActivityID)
	if err != nil {
		return nil, errors.New("invalid activity_id")
	}
	progID, err := uuid.Parse(req.ProgramID)
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
	facID, err := uuid.Parse(req.FacultyID)
	if err != nil {
		return nil, errors.New("invalid faculty_id")
	}

	scheduledAt, err := time.Parse(time.RFC3339, req.ScheduledAt)
	if err != nil {
		return nil, errors.New("scheduled_at must be RFC3339 format")
	}

	sessionType := req.SessionType
	if sessionType == "" {
		sessionType = "classroom"
	}
	dur := req.DurationMins
	if dur <= 0 {
		dur = 60
	}
	title := strings.TrimSpace(req.Title)
	if title == "" {
		title = "Session"
	}

	var desc *string
	if req.Description != "" {
		desc = &req.Description
	}
	var link *string
	if req.VirtualLink != "" {
		link = &req.VirtualLink
	}

	// Fetch faculty name for the DTO
	var facultyName string
	database.DB.Raw("SELECT name FROM users WHERE id = ?", facID).Scan(&facultyName)

	s, err := createScheduledSession(actID, progID, cohortID, facID, title, desc, sessionType, link, scheduledAt, dur)
	if err != nil {
		return nil, err
	}

	return &ScheduledSessionDTO{
		ID:           s.ID,
		ActivityID:   s.ActivityID,
		ProgramID:    s.ProgramID,
		CohortID:     s.CohortID,
		FacultyID:    s.FacultyID,
		FacultyName:  facultyName,
		Title:        s.Title,
		Description:  s.Description,
		SessionType:  s.SessionType,
		VirtualLink:  s.VirtualLink,
		ScheduledAt:  s.ScheduledAt,
		DurationMins: s.DurationMins,
		Status:       s.Status,
		CreatedAt:    s.CreatedAt,
	}, nil
}

func listSessionsByActivityService(activityID string) ([]ScheduledSessionDTO, error) {
	rows, err := listSessionsByActivity(activityID)
	if err != nil {
		return nil, err
	}
	dtos := make([]ScheduledSessionDTO, 0, len(rows))
	for _, r := range rows {
		dtos = append(dtos, ScheduledSessionDTO{
			ID:           r.ID,
			ActivityID:   r.ActivityID,
			ProgramID:    r.ProgramID,
			CohortID:     r.CohortID,
			FacultyID:    r.FacultyID,
			FacultyName:  r.FacultyName,
			Title:        r.Title,
			Description:  r.Description,
			SessionType:  r.SessionType,
			VirtualLink:  r.VirtualLink,
			ScheduledAt:  r.ScheduledAt,
			DurationMins: r.DurationMins,
			Status:       r.Status,
			CreatedAt:    r.CreatedAt,
		})
	}
	return dtos, nil
}
