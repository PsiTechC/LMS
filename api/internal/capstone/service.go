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
func getMyCapstoneService(userID uuid.UUID, programID *uuid.UUID) (*MyCapstoneDTO, error) {
	dto := &MyCapstoneDTO{
		SubmissionStatus: "not_submitted",
		CompletionStatus: "in_progress",
		Members:          []TeamMemberDTO{},
		Files:            []TeamFileDTO{},
		PeerAssignments:  []PeerAssignmentDTO{},
		Panel:            []PanelFeedbackDTO{},
		Milestones:       []MilestoneDTO{},
	}

	team, mine, err := resolveTeam(userID, programID)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			// No group team - check for an individual capstone before giving up.
			if it, ierr := findIndividualTeam(userID, programID); ierr == nil {
				return getMyIndividualCapstone(userID, it, dto)
			}
			// No existing individual team row either - this is exactly the case
			// of a participant who enrolled AFTER faculty ran "Assign" on an
			// individual-structure capstone: assignConfigService only snapshot
			// the roster at that moment (unlike group capstones, which
			// self-heal via getOrCreateTeam), so nothing was ever created for
			// them. Self-heal here the same way, but only after independently
			// verifying the user is actually enrolled in that program - never
			// trust a caller-supplied program_id alone for this.
			if it, ierr := getOrCreateIndividualTeamIfEnrolled(userID, programID); ierr == nil {
				return getMyIndividualCapstone(userID, it, dto)
			}
			return dto, nil // no capstone at all - HasTeam stays false
		}
		return nil, err
	}
	dto.HasTeam = true
	dto.TeamID = team.ID.String()
	dto.Title = team.Title
	dto.TeamName = mine.GroupName
	dto.ProgramName = mine.ProgramName
	dto.CohortName = mine.CohortName
	dto.CompletionStatus = team.CompletionStatus
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

	// Files (public + my own personal)
	files, err := teamFiles(team.ID, userID)
	if err != nil {
		return nil, err
	}
	for _, f := range files {
		fd := TeamFileDTO{ID: f.ID, Title: f.Title, FileURL: f.FileURL, Visibility: f.Visibility, CreatedAt: f.CreatedAt.Format(time.RFC3339)}
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

	// Panel - only exposed when released post-event.
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

	// Authoring layer: config brief, milestones, released grade.
	enrichFromConfig(userID, team, dto)

	return dto, nil
}

// getMyIndividualCapstone builds the participant view for an individual capstone
// (no cohort_group; members = just the participant). Files/peer-review tabs are
// team-scoped but for an individual the "team" is the single participant.
func getMyIndividualCapstone(userID uuid.UUID, team *CapstoneTeam, dto *MyCapstoneDTO) (*MyCapstoneDTO, error) {
	dto.HasTeam = true
	dto.IsIndividual = true
	dto.TeamID = team.ID.String()
	dto.Title = team.Title
	dto.SubmissionStatus = team.SubmissionStatus
	dto.CompletionStatus = team.CompletionStatus
	dto.FileURL = team.FileURL
	dto.FileName = team.FileName
	dto.AIFeedback = team.AIFeedback
	if team.Deadline != nil {
		s := team.Deadline.Format("2006-01-02")
		dto.Deadline = &s
	}
	if team.SubmittedAt != nil {
		s := team.SubmittedAt.Format(time.RFC3339)
		dto.SubmittedAt = &s
	}

	// Member = just the participant.
	if rows, e := singleUser(userID); e == nil {
		for _, r := range rows {
			dto.Members = append(dto.Members, TeamMemberDTO{UserID: r.UserID, Name: r.Name, Email: r.Email, IsMe: true})
		}
	}

	// Files (own workspace).
	if files, e := teamFiles(team.ID, userID); e == nil {
		for _, f := range files {
			fd := TeamFileDTO{ID: f.ID, Title: f.Title, FileURL: f.FileURL, Visibility: f.Visibility, CreatedAt: f.CreatedAt.Format(time.RFC3339)}
			if f.UploadedByID != nil {
				fd.UploadedByID = *f.UploadedByID
			}
			if f.UploadedBy != nil {
				fd.UploadedBy = *f.UploadedBy
			}
			dto.Files = append(dto.Files, fd)
		}
	}

	enrichFromConfig(userID, team, dto)
	return dto, nil
}

// enrichFromConfig fills the authored brief, milestones and released grade onto
// the DTO from the team's linked capstone_config (no-op if unlinked).
func enrichFromConfig(userID uuid.UUID, team *CapstoneTeam, dto *MyCapstoneDTO) {
	if team.ConfigID == nil {
		return
	}
	cfg, err := getConfig(*team.ConfigID)
	if err != nil {
		return
	}
	if cfg.Theme != nil {
		dto.Theme = *cfg.Theme
	}
	if cfg.ProblemStatement != nil {
		dto.ProblemStatement = *cfg.ProblemStatement
	}
	if cfg.Objectives != nil {
		dto.Objectives = *cfg.Objectives
	}
	dto.DeliverableFormat = jsonStrings(cfg.DeliverableFormat)
	dto.Rubric = jsonRubric(cfg.Rubric)
	dto.Resources = jsonResources(cfg.Resources)
	dto.ReferenceFiles = jsonRefFiles(cfg.ReferenceFiles)
	dto.TeamStructure = cfg.TeamStructure
	thr := cfg.PassingThreshold
	dto.PassingThreshold = &thr
	if cfg.Deadline != nil && dto.Deadline == nil {
		s := cfg.Deadline.Format("2006-01-02")
		dto.Deadline = &s
	}
	if strings.TrimSpace(cfg.Title) != "" {
		dto.Title = cfg.Title
	}

	// Milestones
	if ms, e := listMilestones(*team.ConfigID); e == nil {
		for _, m := range ms {
			md := MilestoneDTO{ID: m.ID.String(), Title: m.Title, Status: m.Status, SortOrder: m.SortOrder}
			if m.DueDate != nil {
				md.DueDate = m.DueDate.Format("2006-01-02")
			}
			dto.Milestones = append(dto.Milestones, md)
		}
	}

	// Released grade: individual grade wins over team grade.
	if tg, ig, e := releasedGradeForTeam(team.ID, userID); e == nil {
		chosen := ig
		isIndividual := true
		if chosen == nil {
			chosen = tg
			isIndividual = false
		}
		if chosen != nil {
			dto.GradeReleased = true
			dto.MyGrade = &ParticipantGrade{
				Score:        chosen.Score,
				PerCriterion: jsonCriterionScores(chosen.PerCriterion),
				IsIndividual: isIndividual,
			}
			if chosen.Comments != nil {
				dto.MyGrade.Comments = *chosen.Comments
			}
		}
	}
}

// submitCapstoneService records/replaces the team's submission. Any team member
// may submit. Also refreshes the AI feedback preview.
func submitCapstoneService(userID uuid.UUID, programID *uuid.UUID, req SubmitRequest) (*MyCapstoneDTO, error) {
	teamID, _, err := resolveAnyTeamID(userID, programID)
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
	if err := updateTeam(teamID, fields); err != nil {
		return nil, err
	}
	return getMyCapstoneService(userID, programID)
}

// addFileService adds a file to the team/individual workspace. Group capstones
// force public visibility so teammates can see each other's work; individual
// capstones honor the requested visibility (default public).
func addFileService(userID uuid.UUID, programID *uuid.UUID, req AddFileRequest) (*MyCapstoneDTO, error) {
	teamID, isIndividual, err := resolveAnyTeamID(userID, programID)
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
	visibility := "public"
	if isIndividual && req.Visibility == "personal" {
		visibility = "personal"
	}
	f := &CapstoneFile{ID: uuid.New(), CapstoneTeamID: teamID, Title: title, FileURL: url, UploadedBy: &userID, Visibility: visibility, CreatedAt: time.Now()}
	if err := addFile(f); err != nil {
		return nil, err
	}
	return getMyCapstoneService(userID, programID)
}

// resolveAnyTeamID resolves the participant's capstone team id whether it's a
// group team (via als_team membership) or an individual team. Returns
// (teamID, isIndividual, err).
func resolveAnyTeamID(userID uuid.UUID, programID *uuid.UUID) (uuid.UUID, bool, error) {
	team, _, err := resolveTeam(userID, programID)
	if err == nil {
		return team.ID, false, nil
	}
	if !errors.Is(err, ErrNotFound) {
		return uuid.Nil, false, err
	}
	it, ierr := findIndividualTeam(userID, programID)
	if ierr != nil {
		return uuid.Nil, false, ierr
	}
	return it.ID, true, nil
}

// submitPeerReviewService records a peer review by the caller. The assignment
// must belong to the caller's team (authorization boundary).
func submitPeerReviewService(userID uuid.UUID, programID *uuid.UUID, req SubmitPeerReviewRequest) (*MyCapstoneDTO, error) {
	team, _, err := resolveTeam(userID, programID)
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
	return getMyCapstoneService(userID, programID)
}

// resolveTeam finds the participant's team (scoped to programID when provided,
// from the program switcher) and get-or-creates the capstone row.
func resolveTeam(userID uuid.UUID, programID *uuid.UUID) (*CapstoneTeam, *myTeamRow, error) {
	mine, err := findMyTeam(userID, programID)
	if err != nil {
		return nil, nil, err
	}
	orgID := uuid.MustParse(mine.OrgID)
	teamProgramID := uuid.MustParse(mine.ProgramID)
	groupID := uuid.MustParse(mine.GroupID)
	team, err := getOrCreateTeam(orgID, teamProgramID, groupID)
	if err != nil {
		return nil, nil, err
	}
	return team, mine, nil
}

// getOrCreateIndividualTeamIfEnrolled self-heals an individual capstone team
// for a participant who enrolled in the program AFTER faculty ran "Assign" -
// assignConfigService only snapshots the roster that existed at that moment
// (see manage_service.go), so anyone enrolling later never gets a
// capstone_teams row and the capstone silently never appears for them.
// programID must be provided (participant/program-switcher context); the
// enrollment is independently verified server-side rather than trusted from
// the caller. Returns ErrNotFound if there's no active enrollment or no
// assigned individual-structure capstone for that program - same "no
// capstone" outcome the caller already handles.
func getOrCreateIndividualTeamIfEnrolled(userID uuid.UUID, programID *uuid.UUID) (*CapstoneTeam, error) {
	if programID == nil {
		return nil, ErrNotFound
	}
	enrollment, err := verifiedEnrollment(userID, *programID)
	if err != nil {
		return nil, err
	}
	cfg, err := findAssignedIndividualConfig(*programID)
	if err != nil {
		return nil, err
	}
	orgID := uuid.MustParse(enrollment.OrgID)
	teamID, err := createIndividualTeam(orgID, *programID, cfg.ID, userID, cfg.Title)
	if err != nil {
		return nil, err
	}
	return getTeamByID(teamID)
}

func errValidation(msg string) error { return errors.New("validation: " + msg) }

func round1(v float64) float64 { return float64(int(v*10+0.5)) / 10 }
