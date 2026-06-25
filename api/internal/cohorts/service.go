package cohorts

import (
	"errors"
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

func nudgeParticipantService(enrollmentID string) error {
	_, err := getEnrollmentByID(enrollmentID)
	if err != nil {
		return err
	}
	return setNudgedAt(enrollmentID)
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
