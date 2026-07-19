package submissions

import (
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/xa-lms/api/internal/leaderboard"
)

// listGradingAdminService assembles the superadmin grading view (submissions +
// capstones). orgID "" = all orgs; status "" | pending | graded | capstone.
func listGradingAdminService(orgID, status string, page, limit int) ([]GradingAdminDTO, int64, error) {
	offset := (page - 1) * limit
	rows, total, err := listGradingAdmin(orgID, status, offset, limit)
	if err != nil {
		return nil, 0, err
	}
	out := make([]GradingAdminDTO, 0, len(rows))
	for _, r := range rows {
		dto := GradingAdminDTO{
			ID:          r.ID,
			Source:      r.Source,
			Type:        r.Type,
			Participant: r.Participant,
			Org:         r.Org,
			OrgID:       r.OrgID,
			Program:     r.Program,
			Title:       r.Title,
			Status:      r.Status,
			Grade:       r.Grade,
		}
		if r.SubmittedAt != nil {
			dto.SubmittedAt = r.SubmittedAt.UTC().Format(time.RFC3339)
		}
		if r.Faculty != nil {
			dto.Faculty = *r.Faculty
		}
		out = append(out, dto)
	}
	return out, total, nil
}

func submitService(req CreateSubmissionRequest, participantID string) (*SubmissionResponse, error) {
	if strings.TrimSpace(req.ActivityID) == "" {
		return nil, errors.New("activity_id is required")
	}
	if strings.TrimSpace(req.Content) == "" && strings.TrimSpace(req.FileURL) == "" {
		return nil, errors.New("content or file_url is required")
	}

	actID, err := uuid.Parse(req.ActivityID)
	if err != nil {
		return nil, errors.New("invalid activity_id")
	}
	pID, err := uuid.Parse(participantID)
	if err != nil {
		return nil, errors.New("invalid participant_id")
	}

	exists, err := existsByParticipantAndActivity(participantID, req.ActivityID)
	if err != nil {
		return nil, err
	}
	if exists {
		return nil, ErrDuplicate
	}

	var content *string
	if req.Content != "" {
		content = &req.Content
	}
	var fileURL *string
	if req.FileURL != "" {
		fileURL = &req.FileURL
	}

	s := &Submission{
		ActivityID:    actID,
		ParticipantID: pID,
		Content:       content,
		FileURL:       fileURL,
		Status:        "submitted",
		SubmittedAt:   time.Now(),
	}
	if err := createSubmission(s); err != nil {
		return nil, err
	}
	if err := leaderboard.AwardSubmission(pID, actID, s.ID, s.SubmittedAt); err != nil {
		return nil, err
	}
	dto := submissionToDTO(*s)
	return &dto, nil
}

func getSubmissionService(id string) (*SubmissionResponse, error) {
	s, err := getByID(id)
	if err != nil {
		return nil, err
	}
	dto := submissionToDTO(*s)
	return &dto, nil
}

func getMySubmissionService(participantID, activityID string) (*SubmissionResponse, error) {
	s, err := getByParticipantAndActivity(participantID, activityID)
	if err != nil {
		return nil, err
	}
	dto := submissionToDTO(*s)
	return &dto, nil
}

func listSubmissionsService(q ListSubmissionsQuery) ([]SubmissionResponse, int64, error) {
	if q.Page < 1 {
		q.Page = 1
	}
	if q.Limit < 1 || q.Limit > 100 {
		q.Limit = 20
	}
	rows, total, err := listByActivity(q.ActivityID, (q.Page-1)*q.Limit, q.Limit)
	if err != nil {
		return nil, 0, err
	}
	result := make([]SubmissionResponse, 0, len(rows))
	for _, s := range rows {
		result = append(result, submissionToDTO(s))
	}
	return result, total, nil
}

func gradeService(id string, req GradeRequest, gradedByID string) (*SubmissionResponse, error) {
	if err := gradeSubmission(id, req.Grade, req.Feedback, gradedByID); err != nil {
		return nil, err
	}
	return getSubmissionService(id)
}

func facultyStatsService(facultyID string) (StatsRow, error) {
	return facultySubmissionStats(facultyID)
}

func submissionToDTO(s Submission) SubmissionResponse {
	r := SubmissionResponse{
		ID:            s.ID.String(),
		ActivityID:    s.ActivityID.String(),
		ParticipantID: s.ParticipantID.String(),
		Content:       s.Content,
		FileURL:       s.FileURL,
		Status:        s.Status,
		Grade:         s.Grade,
		Feedback:      s.Feedback,
		SubmittedAt:   s.SubmittedAt.Format(time.RFC3339),
	}
	if s.GradedBy != nil {
		str := s.GradedBy.String()
		r.GradedBy = &str
	}
	return r
}
