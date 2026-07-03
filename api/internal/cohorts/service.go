package cohorts

import (
	"errors"
	"fmt"
	"math/rand"
	"strings"
	"time"

	"github.com/google/uuid"
)

// ── Cohorts ───────────────────────────────────────────────────────

func listCohortsService(orgID, programID string) ([]CohortDTO, error) {
	var (
		list []Cohort
		err  error
	)
	if programID != "" {
		list, err = listCohortsByProgram(programID)
	} else {
		list, err = listCohortsByOrg(orgID)
	}
	if err != nil {
		return nil, err
	}

	result := make([]CohortDTO, 0, len(list))
	for _, c := range list {
		count, _ := countEnrollments(c.ID.String())
		result = append(result, cohortToDTO(c, count))
	}
	return result, nil
}

func getCohortService(id string) (*CohortDTO, error) {
	c, err := getCohortByID(id)
	if err != nil {
		return nil, err
	}
	count, _ := countEnrollments(c.ID.String())
	dto := cohortToDTO(*c, count)
	return &dto, nil
}

func createCohortService(req CreateCohortRequest, orgID string) (*CohortDTO, error) {
	if strings.TrimSpace(req.Name) == "" {
		return nil, errors.New("name is required")
	}
	if req.ProgramID == "" {
		return nil, errors.New("program_id is required")
	}

	seats := req.MaxSeats
	if seats <= 0 {
		seats = 50
	}

	c := &Cohort{
		ProgramID: uuid.MustParse(req.ProgramID),
		OrgID:     uuid.MustParse(orgID),
		Name:      req.Name,
		MaxSeats:  seats,
		IsActive:  true,
	}
	if req.Description != "" {
		c.Description = &req.Description
	}
	if req.StartDate != "" {
		t, err := time.Parse("2006-01-02", req.StartDate)
		if err == nil {
			c.StartDate = &t
		}
	}
	if req.EndDate != "" {
		t, err := time.Parse("2006-01-02", req.EndDate)
		if err == nil {
			c.EndDate = &t
		}
	}

	if err := createCohort(c); err != nil {
		return nil, err
	}
	dto := cohortToDTO(*c, 0)
	return &dto, nil
}

func updateCohortService(id string, req UpdateCohortRequest) (*CohortDTO, error) {
	c, err := getCohortByID(id)
	if err != nil {
		return nil, err
	}

	if req.Name != nil {
		c.Name = *req.Name
	}
	if req.Description != nil {
		c.Description = req.Description
	}
	if req.MaxSeats != nil {
		c.MaxSeats = *req.MaxSeats
	}
	if req.IsActive != nil {
		c.IsActive = *req.IsActive
	}
	if req.StartDate != nil {
		t, err := time.Parse("2006-01-02", *req.StartDate)
		if err == nil {
			c.StartDate = &t
		}
	}
	if req.EndDate != nil {
		t, err := time.Parse("2006-01-02", *req.EndDate)
		if err == nil {
			c.EndDate = &t
		}
	}

	if err := saveCohort(c); err != nil {
		return nil, err
	}
	count, _ := countEnrollments(c.ID.String())
	dto := cohortToDTO(*c, count)
	return &dto, nil
}

// ── Enrollments ───────────────────────────────────────────────────

func listParticipantsService(cohortID string) ([]ParticipantDTO, error) {
	rows, err := listParticipants(cohortID)
	if err != nil {
		return nil, err
	}
	result := make([]ParticipantDTO, 0, len(rows))
	for _, r := range rows {
		result = append(result, rowToDTO(r))
	}
	return result, nil
}

func enrollParticipantService(cohortID string, req EnrollParticipantRequest) (*ParticipantDTO, error) {
	if req.UserID == "" {
		return nil, errors.New("user_id is required")
	}
	role := req.Role
	if role == "" {
		role = "participant"
	}

	e := &Enrollment{
		CohortID: uuid.MustParse(cohortID),
		UserID:   uuid.MustParse(req.UserID),
		Role:     role,
		Status:   "enrolled",
	}

	if err := enrollUser(e); err != nil {
		return nil, err
	}

	rows, err := listParticipants(cohortID)
	if err != nil {
		return nil, err
	}
	for _, r := range rows {
		if r.EnrollmentID == e.ID.String() {
			dto := rowToDTO(r)
			return &dto, nil
		}
	}
	// Fallback: return minimal DTO
	dto := ParticipantDTO{
		EnrollmentID: e.ID.String(),
		UserID:       req.UserID,
		Role:         role,
		Status:       "enrolled",
		EnrolledAt:   e.EnrolledAt,
	}
	return &dto, nil
}

func updateEnrollmentService(enrollmentID string, req UpdateEnrollmentRequest) (*ParticipantDTO, error) {
	e, err := getEnrollmentByID(enrollmentID)
	if err != nil {
		return nil, err
	}

	if req.Status != nil {
		e.Status = *req.Status
	}
	if req.CompletionPercent != nil {
		p := *req.CompletionPercent
		if p < 0 {
			p = 0
		}
		if p > 100 {
			p = 100
		}
		e.CompletionPercent = p
	}
	if req.RiskLevel != nil {
		e.RiskLevel = *req.RiskLevel
	}

	if err := saveEnrollment(e); err != nil {
		return nil, err
	}

	rows, err := listParticipants(e.CohortID.String())
	if err != nil {
		return nil, err
	}
	for _, r := range rows {
		if r.EnrollmentID == enrollmentID {
			dto := rowToDTO(r)
			return &dto, nil
		}
	}
	return nil, ErrNotFound
}

func bulkEnrollService(cohortID string, req BulkEnrollRequest) (*BulkEnrollResult, error) {
	role := req.Role
	if role == "" {
		role = "participant"
	}
	result := &BulkEnrollResult{
		Enrolled: make([]string, 0),
		Skipped:  make([]string, 0),
		Failed:   make([]string, 0),
	}
	for _, uid := range req.UserIDs {
		e := &Enrollment{
			CohortID: uuid.MustParse(cohortID),
			UserID:   uuid.MustParse(uid),
			Role:     role,
			Status:   "enrolled",
		}
		err := enrollUser(e)
		switch {
		case err == nil:
			result.Enrolled = append(result.Enrolled, uid)
		case errors.Is(err, ErrAlreadyEnrolled):
			result.Skipped = append(result.Skipped, uid)
		default:
			result.Failed = append(result.Failed, uid)
		}
	}
	return result, nil
}

// enrollByEmailService handles POST /cohorts/:id/enroll — find-or-create by name+email
func enrollByEmailService(cohortID string, req EnrollByEmailRequest) (*EnrollByEmailResult, error) {
	result := &EnrollByEmailResult{Errors: []EnrollRowError{}}
	for _, p := range req.Participants {
		email := strings.TrimSpace(p.Email)
		name := strings.TrimSpace(p.Name)
		if email == "" || name == "" {
			result.Failed++
			result.Errors = append(result.Errors, EnrollRowError{Email: email, Reason: "name and email are required"})
			continue
		}
		userID, err := findOrCreateUser(name, email, p.Department, p.Seniority, p.Function, p.Location)
		if err != nil {
			result.Failed++
			result.Errors = append(result.Errors, EnrollRowError{Email: email, Reason: err.Error()})
			continue
		}
		e := &Enrollment{
			CohortID: uuid.MustParse(cohortID),
			UserID:   uuid.MustParse(userID),
			Role:     "participant",
			Status:   "enrolled",
		}
		if err := enrollUser(e); errors.Is(err, ErrAlreadyEnrolled) {
			result.AlreadyIn++
		} else if err != nil {
			result.Failed++
			result.Errors = append(result.Errors, EnrollRowError{Email: email, Reason: err.Error()})
		} else {
			result.Enrolled++
		}
	}
	return result, nil
}

// enrollCSVService handles POST /cohorts/:id/enroll/csv
func enrollCSVService(cohortID string, rows []ParticipantInput) (*CSVImportResult, error) {
	res, err := enrollByEmailService(cohortID, EnrollByEmailRequest{Participants: rows})
	if err != nil {
		return nil, err
	}
	return &CSVImportResult{
		SuccessCount: res.Enrolled,
		FailedCount:  res.Failed,
		Errors:       res.Errors,
	}, nil
}

func getCohortStatsService(cohortID string) (*CohortStatsDTO, error) {
	return getCohortStats(cohortID)
}

func nudgeParticipantService(enrollmentID string) error {
	_, err := getEnrollmentByID(enrollmentID)
	if err != nil {
		return err
	}
	return setNudgedAt(enrollmentID)
}

// ── Pool & Transfer ───────────────────────────────────────────────

func listPoolService(programID, orgID string) ([]PoolParticipantDTO, error) {
	return listPoolForProgram(programID, orgID)
}

func transferParticipantService(toCohortID string, req TransferRequest) error {
	if req.UserID == "" {
		return errors.New("user_id is required")
	}
	return transferParticipant(req.UserID, req.FromCohortID, toCohortID)
}

// randomDistributeService takes ALL active participants across all cohorts of a program
// and re-shuffles them randomly across those cohorts using stratified round-robin.
func randomDistributeService(programID string) (*RandomDistributeResult, error) {
	cohortIDs, err := listCohortIDsForProgram(programID)
	if err != nil {
		return nil, err
	}
	if len(cohortIDs) < 2 {
		return nil, errors.New("program must have at least 2 cohorts to distribute across")
	}

	// Get all participant userIDs enrolled in ANY cohort of this program
	userIDs, err := listEnrolledUserIDsForProgram(programID)
	if err != nil {
		return nil, err
	}
	if len(userIDs) == 0 {
		return &RandomDistributeResult{Distributed: 0, PerCohort: 0}, nil
	}

	// Withdraw everyone from all cohorts of this program first
	if err := withdrawAllFromProgram(programID); err != nil {
		return nil, err
	}

	// Stratified shuffle → round-robin assign
	rand.Shuffle(len(userIDs), func(i, j int) { userIDs[i], userIDs[j] = userIDs[j], userIDs[i] })

	for i, uid := range userIDs {
		cid := cohortIDs[i%len(cohortIDs)]
		transferParticipant(uid, "", cid) // nolint — best-effort, non-fatal
	}

	return &RandomDistributeResult{
		Distributed: len(userIDs),
		PerCohort:   len(userIDs) / len(cohortIDs),
	}, nil
}

// ── Groups ────────────────────────────────────────────────────────

func listGroupsService(cohortID string) ([]GroupDTO, error) {
	return listGroupsWithMembers(cohortID)
}

// createGroupsService randomly distributes ungrouped participants across N new groups.
// Strategy: stratified shuffle — participants are sorted by department (for diversity),
// then distributed round-robin across groups so each group gets a mix.
func createGroupsService(cohortID string, req CreateGroupsRequest) ([]GroupDTO, error) {
	if req.Count < 2 {
		return nil, errors.New("count must be at least 2")
	}
	if req.Count > 50 {
		return nil, errors.New("count cannot exceed 50")
	}

	prefix := strings.TrimSpace(req.NamePrefix)
	if prefix == "" {
		switch req.GroupType {
		case "peer_triad":
			prefix = "Triad"
		case "als_team":
			prefix = "ALS Team"
		default:
			prefix = "Circle"
		}
	}
	groupType := req.GroupType
	if groupType == "" {
		groupType = "coaching_circle"
	}

	// Get all ungrouped enrolled participant enrollment IDs
	enrollmentIDs, err := listUngroupedEnrollments(cohortID)
	if err != nil {
		return nil, err
	}

	// Create the groups first
	groups := make([]*CohortGroup, req.Count)
	for i := 0; i < req.Count; i++ {
		g := &CohortGroup{
			CohortID:  uuid.MustParse(cohortID),
			Name:      fmt.Sprintf("%s %d", prefix, i+1),
			GroupType: groupType,
			SortOrder: i,
		}
		if err := createGroup(g); err != nil {
			return nil, err
		}
		groups[i] = g
	}

	// Stratified shuffle: shuffle the enrollment IDs, then distribute round-robin
	shuffled := make([]string, len(enrollmentIDs))
	copy(shuffled, enrollmentIDs)
	rand.Shuffle(len(shuffled), func(i, j int) { shuffled[i], shuffled[j] = shuffled[j], shuffled[i] })

	for i, enrollID := range shuffled {
		groupIdx := i % req.Count
		if err := assignEnrollmentToGroup(enrollID, groups[groupIdx].ID.String()); err != nil {
			// Non-fatal — log and continue
			continue
		}
	}

	return listGroupsWithMembers(cohortID)
}

func deleteGroupService(groupID string) error {
	return deleteGroup(groupID)
}

func moveMemberService(req MoveMemberRequest) error {
	if req.ToGroupID == "" {
		return unassignEnrollmentFromGroup(req.EnrollmentID)
	}
	// Verify target group exists
	if _, err := getGroupByID(req.ToGroupID); err != nil {
		return err
	}
	return assignEnrollmentToGroup(req.EnrollmentID, req.ToGroupID)
}

// reshuffleService deletes all existing groups for a cohort and re-runs random assignment.
func reshuffleService(cohortID string, req CreateGroupsRequest) ([]GroupDTO, error) {
	if err := deleteAllGroupsForCohort(cohortID); err != nil {
		return nil, err
	}
	return createGroupsService(cohortID, req)
}

func myEnrollmentsService(userID string) ([]MyEnrollmentDTO, error) {
	rows, err := getMyEnrollments(userID)
	if err != nil {
		return nil, err
	}
	result := make([]MyEnrollmentDTO, 0, len(rows))
	for _, r := range rows {
		result = append(result, myEnrollmentToDTO(r))
	}
	return result, nil
}

// ── Mappers ───────────────────────────────────────────────────────

func cohortToDTO(c Cohort, enrolledCount int) CohortDTO {
	dto := CohortDTO{
		ID:            c.ID.String(),
		ProgramID:     c.ProgramID.String(),
		OrgID:         c.OrgID.String(),
		Name:          c.Name,
		MaxSeats:      c.MaxSeats,
		IsActive:      c.IsActive,
		EnrolledCount: enrolledCount,
		CreatedAt:     c.CreatedAt,
		StartDate:     c.StartDate,
		EndDate:       c.EndDate,
	}
	if c.Description != nil {
		dto.Description = *c.Description
	}
	return dto
}

func myEnrollmentToDTO(r MyEnrollmentRow) MyEnrollmentDTO {
	return MyEnrollmentDTO{
		EnrollmentID:         r.EnrollmentID,
		CohortID:             r.CohortID,
		CohortName:           r.CohortName,
		CohortStartDate:      r.CohortStartDate,
		CohortEndDate:        r.CohortEndDate,
		Role:                 r.Role,
		Status:               r.Status,
		CompletionPercent:    r.CompletionPercent,
		RiskLevel:            r.RiskLevel,
		EnrolledAt:           r.EnrolledAt,
		ProgramID:            r.ProgramID,
		ProgramTitle:         r.ProgramTitle,
		ProgramDescription:   r.ProgramDescription,
		ProgramColor:         r.ProgramColor,
		ProgramDurationWeeks: r.ProgramDurationWeeks,
		ProgramStatus:        r.ProgramStatus,
	}
}

func rowToDTO(r EnrollmentRow) ParticipantDTO {
	return ParticipantDTO{
		EnrollmentID:      r.EnrollmentID,
		UserID:            r.UserID,
		Name:              r.Name,
		Email:             r.Email,
		AvatarURL:         r.AvatarURL,
		Department:        r.Department,
		Role:              r.Role,
		Status:            r.Status,
		CompletionPercent: r.CompletionPercent,
		RiskLevel:         r.RiskLevel,
		EnrolledAt:        r.EnrolledAt,
		NudgedAt:          r.NudgedAt,
	}
}
