package capstone

import (
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
)

var (
	ErrForbidden  = errors.New("forbidden")
	ErrValidation = errors.New("validation error")
	ErrNoTeam     = errors.New("no capstone team")
)

// getMyCapstoneService assembles the participant's full capstone view. Returns
// HasTeam=false when the participant isn't in a capstone (als_team) group yet.
func getMyCapstoneService(userID uuid.UUID) (*MyCapstoneDTO, error) {
	dto := &MyCapstoneDTO{
		SubmissionStatus: "not_submitted",
		Members:          []TeamMemberDTO{},
		Files:            []TeamFileDTO{},
		PeerAssignments:  []PeerAssignmentDTO{},
		Panel:            []PanelFeedbackDTO{},
	}

	team, mine, err := resolveTeam(userID)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return dto, nil // no team yet — HasTeam stays false
		}
		return nil, err
	}
	dto.HasTeam = true
	dto.TeamID = team.ID.String()
	dto.Title = team.Title
	dto.TeamName = mine.GroupName
	dto.ProgramName = mine.ProgramName
	dto.CohortName = mine.CohortName
	dto.Description = team.Description
	dto.Format = team.Format
	dto.Audience = team.Audience
	dto.Evaluation = team.Evaluation
	// Deadline: the capstone's own config takes priority; else fall back to the
	// program end date.
	if team.Deadline != nil {
		s := team.Deadline.Format("2006-01-02")
		dto.Deadline = &s
	} else if mine.EndDate != nil {
		s := mine.EndDate.Format("2006-01-02")
		dto.Deadline = &s
	}
	dto.SubmissionStatus = team.SubmissionStatus
	dto.FileURL = team.FileURL
	dto.FileName = team.FileName
	dto.AIFeedback = team.AIFeedback
	if team.SubmittedAt != nil {
		s := team.SubmittedAt.Format(time.RFC3339)
		dto.SubmittedAt = &s
	}

	groupID := uuid.MustParse(mine.GroupID)

	// Members
	members, err := teamMembers(groupID)
	if err != nil {
		return nil, err
	}
	for _, m := range members {
		md := TeamMemberDTO{UserID: m.UserID, Name: m.Name, Email: m.Email, IsMe: m.UserID == userID.String()}
		if m.Department != nil {
			md.Department = *m.Department
		}
		dto.Members = append(dto.Members, md)
	}

	// Files
	files, err := teamFiles(team.ID)
	if err != nil {
		return nil, err
	}
	for _, f := range files {
		fd := TeamFileDTO{ID: f.ID, Title: f.Title, FileURL: f.FileURL, CreatedAt: f.CreatedAt.Format(time.RFC3339)}
		if f.UploadedByID != nil {
			fd.UploadedByID = *f.UploadedByID
		}
		if f.UploadedBy != nil {
			fd.UploadedBy = *f.UploadedBy
		}
		dto.Files = append(dto.Files, fd)
	}

	// Peer assignments (for this reviewer's team)
	assigns, err := peerAssignmentsForUser(team.ID, userID)
	if err != nil {
		return nil, err
	}
	for _, a := range assigns {
		pd := PeerAssignmentDTO{AssignmentID: a.AssignmentID, TargetTeam: a.TargetTeam, Reviewed: a.MyRating != nil, MyRating: a.MyRating}
		if a.DueDate != nil {
			s := a.DueDate.Format("2006-01-02")
			pd.DueDate = &s
		}
		dto.PeerAssignments = append(dto.PeerAssignments, pd)
	}

	// Panel — only exposed when released post-event.
	dto.PanelReleased = team.PanelStatus == "released"
	if dto.PanelReleased {
		panel, err := panelFeedback(team.ID)
		if err != nil {
			return nil, err
		}
		var sum float64
		for _, p := range panel {
			pf := PanelFeedbackDTO{PanelistName: p.PanelistName, Rating: p.Rating, CreatedAt: p.CreatedAt.Format(time.RFC3339)}
			if p.PanelistRole != nil {
				pf.PanelistRole = *p.PanelistRole
			}
			if p.Comment != nil {
				pf.Comment = *p.Comment
			}
			dto.Panel = append(dto.Panel, pf)
			sum += float64(p.Rating)
		}
		if len(panel) > 0 {
			avg := round1(sum / float64(len(panel)))
			dto.PanelAvg = &avg
		}
	}

	return dto, nil
}

// submitCapstoneService records/replaces the team's submission. Any team member
// may submit. Also refreshes the AI feedback preview.
func submitCapstoneService(userID uuid.UUID, req SubmitRequest) (*MyCapstoneDTO, error) {
	team, _, err := resolveTeam(userID)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return nil, ErrNoTeam
		}
		return nil, err
	}
	url := strings.TrimSpace(req.FileURL)
	if url == "" {
		return nil, errValidation("file_url is required (upload link or video URL)")
	}
	name := strings.TrimSpace(req.FileName)
	if name == "" {
		name = "Capstone Submission"
	}
	fields := map[string]any{
		"file_url":          url,
		"file_name":         name,
		"submission_status": "submitted",
		"submitted_by":      userID,
		"submitted_at":      time.Now(),
	}
	if err := updateTeam(team.ID, fields); err != nil {
		return nil, err
	}
	return getMyCapstoneService(userID)
}

// addFileService adds a shared file to the team workspace.
func addFileService(userID uuid.UUID, req AddFileRequest) (*MyCapstoneDTO, error) {
	team, _, err := resolveTeam(userID)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return nil, ErrNoTeam
		}
		return nil, err
	}
	title := strings.TrimSpace(req.Title)
	url := strings.TrimSpace(req.FileURL)
	if title == "" || url == "" {
		return nil, errValidation("title and file_url are required")
	}
	f := &CapstoneFile{ID: uuid.New(), CapstoneTeamID: team.ID, Title: title, FileURL: url, UploadedBy: &userID, CreatedAt: time.Now()}
	if err := addFile(f); err != nil {
		return nil, err
	}
	return getMyCapstoneService(userID)
}

// submitPeerReviewService records a peer review by the caller. The assignment
// must belong to the caller's team (authorization boundary).
func submitPeerReviewService(userID uuid.UUID, req SubmitPeerReviewRequest) (*MyCapstoneDTO, error) {
	team, _, err := resolveTeam(userID)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return nil, ErrNoTeam
		}
		return nil, err
	}
	aid, err := uuid.Parse(req.AssignmentID)
	if err != nil {
		return nil, errValidation("invalid assignment_id")
	}
	if req.Rating < 1 || req.Rating > 5 {
		return nil, errValidation("rating must be 1-5")
	}
	assign, err := getAssignment(aid)
	if err != nil {
		return nil, err
	}
	if assign.ReviewerTeamID != team.ID {
		return nil, ErrForbidden
	}
	r := &CapstonePeerReview{AssignmentID: aid, ReviewerID: userID, Rating: req.Rating, CreatedAt: time.Now()}
	if strings.TrimSpace(req.Comment) != "" {
		c := req.Comment
		r.Comment = &c
	}
	if err := upsertPeerReview(r); err != nil {
		return nil, err
	}
	return getMyCapstoneService(userID)
}

// resolveTeam finds the participant's team and get-or-creates the capstone row.
func resolveTeam(userID uuid.UUID) (*CapstoneTeam, *myTeamRow, error) {
	mine, err := findMyTeam(userID)
	if err != nil {
		return nil, nil, err
	}
	orgID := uuid.MustParse(mine.OrgID)
	programID := uuid.MustParse(mine.ProgramID)
	groupID := uuid.MustParse(mine.GroupID)
	team, err := getOrCreateTeam(orgID, programID, groupID)
	if err != nil {
		return nil, nil, err
	}
	return team, mine, nil
}

func errValidation(msg string) error { return errors.New("validation: " + msg) }

func round1(v float64) float64 { return float64(int(v*10+0.5)) / 10 }
