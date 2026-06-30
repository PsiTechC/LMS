package compliance

import (
	"fmt"

	"github.com/google/uuid"
)

// ── Completion Gates ─────────────────────────────────────────────────────────

func listGates(programID string) ([]CompletionGateDTO, error) {
	gates, err := listGatesByProgram(programID)
	if err != nil {
		return nil, err
	}
	dtos := make([]CompletionGateDTO, 0, len(gates))
	for _, g := range gates {
		dtos = append(dtos, gateToDTO(g))
	}
	return dtos, nil
}

func createOrUpdateGate(orgID string, req CreateGateRequest) (*CompletionGateDTO, error) {
	if req.ProgramID == "" || req.ActivityID == "" || req.PrereqActivityID == "" {
		return nil, fmt.Errorf("program_id, activity_id and prereq_activity_id are required")
	}
	if req.ActivityID == req.PrereqActivityID {
		return nil, fmt.Errorf("activity_id and prereq_activity_id must be different")
	}

	orgUUID, err := uuid.Parse(orgID)
	if err != nil {
		return nil, fmt.Errorf("invalid org_id")
	}
	programUUID, err := uuid.Parse(req.ProgramID)
	if err != nil {
		return nil, fmt.Errorf("invalid program_id")
	}
	activityUUID, err := uuid.Parse(req.ActivityID)
	if err != nil {
		return nil, fmt.Errorf("invalid activity_id")
	}
	prereqUUID, err := uuid.Parse(req.PrereqActivityID)
	if err != nil {
		return nil, fmt.Errorf("invalid prereq_activity_id")
	}

	escalationDays := req.EscalationDays
	if escalationDays <= 0 {
		escalationDays = 3
	}

	gate := &CompletionGate{
		OrgID:            orgUUID,
		ProgramID:        programUUID,
		ActivityID:       activityUUID,
		PrereqActivityID: prereqUUID,
		EscalationEmail:  req.EscalationEmail,
		EscalationDays:   escalationDays,
	}
	if err := upsertGate(gate); err != nil {
		return nil, err
	}
	dto := gateToDTO(*gate)
	return &dto, nil
}

func deleteGateSvc(id string) error {
	return deleteGate(id)
}

// ── Data Retention Policies ──────────────────────────────────────────────────

func getRetentionPolicySvc(programID string) (*DataRetentionPolicyDTO, error) {
	p, err := getRetentionPolicy(programID)
	if err != nil {
		return nil, err
	}
	dto := retentionToDTO(*p)
	return &dto, nil
}

func createOrUpdateRetentionPolicy(orgID, userID string, req UpsertRetentionRequest) (*DataRetentionPolicyDTO, error) {
	if req.ProgramID == "" {
		return nil, fmt.Errorf("program_id is required")
	}

	orgUUID, err := uuid.Parse(orgID)
	if err != nil {
		return nil, fmt.Errorf("invalid org_id")
	}
	programUUID, err := uuid.Parse(req.ProgramID)
	if err != nil {
		return nil, fmt.Errorf("invalid program_id")
	}
	userUUID, err := uuid.Parse(userID)
	if err != nil {
		return nil, fmt.Errorf("invalid user_id in token")
	}

	submissionsDays := req.SubmissionsDays
	if submissionsDays <= 0 {
		submissionsDays = 365
	}
	recordingsDays := req.RecordingsDays
	if recordingsDays <= 0 {
		recordingsDays = 90
	}
	chatLogsDays := req.ChatLogsDays
	if chatLogsDays <= 0 {
		chatLogsDays = 30
	}

	p := &DataRetentionPolicy{
		OrgID:           orgUUID,
		ProgramID:       programUUID,
		SubmissionsDays: submissionsDays,
		RecordingsDays:  recordingsDays,
		ChatLogsDays:    chatLogsDays,
		UpdatedBy:       userUUID,
	}
	if err := upsertRetentionPolicy(p); err != nil {
		return nil, err
	}
	dto := retentionToDTO(*p)
	return &dto, nil
}

// ── GDPR Acknowledgements ────────────────────────────────────────────────────

func ackGDPR(userID string, req AckGDPRRequest) error {
	if req.Context == "" {
		return fmt.Errorf("context is required")
	}
	userUUID, err := uuid.Parse(userID)
	if err != nil {
		return fmt.Errorf("invalid user_id")
	}
	ack := &GDPRAcknowledgement{
		UserID:  userUUID,
		Context: req.Context,
	}
	return recordGDPRAck(ack)
}

// ── Attendance Register ───────────────────────────────────────────────────────

func getAttendanceRegisterSvc(cohortID string) (*AttendanceRegisterResponse, error) {
	if cohortID == "" {
		return nil, fmt.Errorf("cohort_id is required")
	}
	rows, err := getAttendanceRegister(cohortID)
	if err != nil {
		return nil, err
	}
	return &AttendanceRegisterResponse{
		CohortID: cohortID,
		Rows:     rows,
	}, nil
}

// ── Audit Logs ───────────────────────────────────────────────────────────────

func listAuditLogsSvc(q AuditQueryDTO) ([]AuditLogDTO, int64, error) {
	return listAuditLogs(q)
}

// ── DTO conversion helpers ────────────────────────────────────────────────────

func gateToDTO(g CompletionGate) CompletionGateDTO {
	return CompletionGateDTO{
		ID:               g.ID.String(),
		ProgramID:        g.ProgramID.String(),
		ActivityID:       g.ActivityID.String(),
		PrereqActivityID: g.PrereqActivityID.String(),
		EscalationEmail:  g.EscalationEmail,
		EscalationDays:   g.EscalationDays,
		CreatedAt:        g.CreatedAt.Format("2006-01-02T15:04:05Z"),
	}
}

func retentionToDTO(p DataRetentionPolicy) DataRetentionPolicyDTO {
	return DataRetentionPolicyDTO{
		ID:              p.ID.String(),
		ProgramID:       p.ProgramID.String(),
		SubmissionsDays: p.SubmissionsDays,
		RecordingsDays:  p.RecordingsDays,
		ChatLogsDays:    p.ChatLogsDays,
		UpdatedAt:       p.UpdatedAt.Format("2006-01-02T15:04:05Z"),
	}
}
