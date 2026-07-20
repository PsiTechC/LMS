package capstone

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
)

var ErrConfigValidation = errors.New("validation")

// ── Config: attach / list / detail / update / delete ──────────────────────

// createConfigService attaches a capstone to a program (SA/PM). Returns the new
// config id so the caller can notify faculty.
func createConfigService(orgID, createdBy uuid.UUID, req CreateConfigRequest) (*ConfigDTO, error) {
	programID, err := uuid.Parse(strings.TrimSpace(req.ProgramID))
	if err != nil {
		return nil, fmt.Errorf("%w: program_id is required", ErrConfigValidation)
	}
	// Idempotency guard: Program Design's "Set up Capstone" attach button can
	// be clicked again after the page remounts (its "already attached" state
	// is client-side only) - a second click for the same phase must not
	// create a second config row. Re-clicking just returns the existing one.
	if existing, err := getConfigForPhase(programID, strings.TrimSpace(req.PhaseID)); err != nil {
		return nil, err
	} else if existing != nil {
		dto := configToDTO(existing, "", "", 0)
		return &dto, nil
	}
	title := strings.TrimSpace(req.Title)
	if title == "" {
		title = "Capstone Project"
	}
	c := &CapstoneConfig{
		ID: uuid.New(), OrgID: orgID, ProgramID: programID, Title: title,
		DeliverableFormat: []byte("[]"), Rubric: []byte("[]"), Resources: []byte("[]"),
		TeamStructure: "group", PassingThreshold: 6, Status: "draft",
		CreatedBy: &createdBy, CreatedAt: time.Now(), UpdatedAt: time.Now(),
	}
	if req.PhaseID != "" {
		if pid, e := uuid.Parse(req.PhaseID); e == nil {
			c.PhaseID = &pid
		}
	}
	if req.ActivityID != "" {
		if aid, e := uuid.Parse(req.ActivityID); e == nil {
			c.ActivityID = &aid
		}
	}
	if err := createConfig(c); err != nil {
		return nil, err
	}
	dto := configToDTO(c, "", "", 0)
	return &dto, nil
}

// listConfigsService lists capstones for staff. orgID "" = all orgs (SA);
// programIDs non-nil restricts to a faculty's programs.
func listConfigsService(orgID string, programIDs []string) ([]ConfigDTO, error) {
	rows, err := listConfigs(orgID, programIDs)
	if err != nil {
		return nil, err
	}
	out := make([]ConfigDTO, 0, len(rows))
	for _, r := range rows {
		out = append(out, ConfigDTO{
			ID: r.ID, OrgID: r.OrgID, Org: r.Org, ProgramID: r.ProgramID, Program: r.Program,
			PhaseID: deref(r.PhaseID), ActivityID: deref(r.ActivityID),
			Title: r.Title, Status: r.Status, TeamCount: r.TeamCount,
			CreatedAt: r.CreatedAt.UTC().Format(time.RFC3339),
		})
	}
	return out, nil
}

func updateConfigService(configID uuid.UUID, req UpdateConfigRequest) error {
	fields := map[string]any{}
	if req.Title != nil {
		fields["title"] = *req.Title
	}
	if req.Theme != nil {
		fields["theme"] = *req.Theme
	}
	if req.ProblemStatement != nil {
		fields["problem_statement"] = *req.ProblemStatement
	}
	if req.Objectives != nil {
		fields["objectives"] = *req.Objectives
	}
	if req.DeliverableFormat != nil {
		b, _ := json.Marshal(req.DeliverableFormat)
		fields["deliverable_format"] = b
	}
	if req.Rubric != nil {
		if err := validateRubric(req.Rubric); err != nil {
			return err
		}
		b, _ := json.Marshal(req.Rubric)
		fields["rubric"] = b
	}
	if req.Resources != nil {
		b, _ := json.Marshal(req.Resources)
		fields["resources"] = b
	}
	if req.ReferenceFiles != nil {
		b, _ := json.Marshal(req.ReferenceFiles)
		fields["reference_files"] = b
	}
	if req.TeamStructure != nil {
		if *req.TeamStructure != "individual" && *req.TeamStructure != "group" {
			return fmt.Errorf("%w: team_structure must be individual or group", ErrConfigValidation)
		}
		fields["team_structure"] = *req.TeamStructure
	}
	if req.PassingThreshold != nil {
		if *req.PassingThreshold < 0 || *req.PassingThreshold > 10 {
			return fmt.Errorf("%w: passing_threshold must be 0..10", ErrConfigValidation)
		}
		fields["passing_threshold"] = *req.PassingThreshold
	}
	if req.Deadline != nil {
		if *req.Deadline == "" {
			fields["deadline"] = nil
		} else if d, e := time.Parse("2006-01-02", *req.Deadline); e == nil {
			fields["deadline"] = d
		} else {
			return fmt.Errorf("%w: deadline must be YYYY-MM-DD", ErrConfigValidation)
		}
	}
	if len(fields) == 0 {
		return nil
	}
	return updateConfig(configID, fields)
}

// validateRubric requires weights to sum to 100 (± a small tolerance).
func validateRubric(rubric []RubricCriterion) error {
	if len(rubric) == 0 {
		return nil
	}
	var sum float64
	for _, c := range rubric {
		if strings.TrimSpace(c.Criterion) == "" {
			return fmt.Errorf("%w: rubric criterion name is required", ErrConfigValidation)
		}
		if c.Weight < 0 {
			return fmt.Errorf("%w: rubric weight cannot be negative", ErrConfigValidation)
		}
		sum += c.Weight
	}
	if sum < 99.5 || sum > 100.5 {
		return fmt.Errorf("%w: rubric weights must sum to 100 (got %.0f)", ErrConfigValidation, sum)
	}
	return nil
}

func deleteConfigService(configID uuid.UUID) error { return deleteConfig(configID) }

// getConfigDetailService assembles the full management view: config + milestones
// + teams (with members, submission, and staff-visible grades incl. unreleased).
func getConfigDetailService(configID uuid.UUID) (*ConfigDetailDTO, error) {
	c, err := getConfig(configID)
	if err != nil {
		return nil, err
	}
	teams, err := teamsForConfig(configID)
	if err != nil {
		return nil, err
	}
	milestones, err := listMilestones(configID)
	if err != nil {
		return nil, err
	}
	grades, err := gradesForConfig(configID)
	if err != nil {
		return nil, err
	}
	// Index grades by team + participant.
	teamGrade := map[uuid.UUID]*CapstoneGrade{}
	memberGrades := map[uuid.UUID][]CapstoneGrade{}
	for i := range grades {
		g := grades[i]
		if g.ParticipantID == nil {
			teamGrade[g.TeamID] = &grades[i]
		} else {
			memberGrades[g.TeamID] = append(memberGrades[g.TeamID], g)
		}
	}

	dto := &ConfigDetailDTO{
		Config:     configToDTO(c, "", "", len(teams)),
		Milestones: make([]MilestoneDTO, 0, len(milestones)),
		Teams:      make([]ManagedTeamDTO, 0, len(teams)),
	}
	for _, m := range milestones {
		md := MilestoneDTO{ID: m.ID.String(), Title: m.Title, Status: m.Status, SortOrder: m.SortOrder}
		if m.DueDate != nil {
			md.DueDate = m.DueDate.Format("2006-01-02")
		}
		dto.Milestones = append(dto.Milestones, md)
	}
	for _, t := range teams {
		mt := ManagedTeamDTO{
			TeamID: t.ID.String(), Name: t.Title, IsIndividual: t.IndividualUserID != nil,
			SubmissionStatus: t.SubmissionStatus, CompletionStatus: t.CompletionStatus,
		}
		if t.IndividualUserID != nil {
			if rows, e := singleUser(*t.IndividualUserID); e == nil {
				for _, r := range rows {
					mt.Members = append(mt.Members, ManagedMemberDTO{UserID: r.UserID, Name: r.Name, Email: r.Email})
				}
			}
			if len(mt.Members) > 0 {
				mt.Name = mt.Members[0].Name
			}
		} else if t.GroupID != nil {
			mt.Name = groupName(*t.GroupID)
			if rows, e := groupTeamMembers(*t.GroupID); e == nil {
				for _, r := range rows {
					mt.Members = append(mt.Members, ManagedMemberDTO{UserID: r.UserID, Name: r.Name, Email: r.Email})
				}
			}
		}
		if t.FileURL != nil {
			mt.FileURL = *t.FileURL
		}
		if t.FileName != nil {
			mt.FileName = *t.FileName
		}
		if t.SubmittedAt != nil {
			mt.SubmittedAt = t.SubmittedAt.UTC().Format(time.RFC3339)
		}
		if g := teamGrade[t.ID]; g != nil {
			gd := gradeToDTO(g)
			mt.TeamGrade = &gd
		}
		for i := range memberGrades[t.ID] {
			mt.MemberGrades = append(mt.MemberGrades, gradeToDTO(&memberGrades[t.ID][i]))
		}
		dto.Teams = append(dto.Teams, mt)
	}
	return dto, nil
}

// ── Assign: publish to teams / individuals ────────────────────────────────

// assignConfigService materializes teams and flips status to assigned. For a
// group config it links the cohort's als_team groups (all, or the provided
// subset); for individual it creates one team per cohort participant.
func assignConfigService(configID uuid.UUID, req AssignConfigRequest) (int, error) {
	c, err := getConfig(configID)
	if err != nil {
		return 0, err
	}
	cohortID, err := uuid.Parse(strings.TrimSpace(req.CohortID))
	if err != nil {
		return 0, fmt.Errorf("%w: cohort_id is required", ErrConfigValidation)
	}

	created := 0
	if c.TeamStructure == "individual" {
		parts, err := cohortParticipants(cohortID)
		if err != nil {
			return 0, err
		}
		for _, p := range parts {
			uid := uuid.MustParse(p.UserID)
			title := c.Title
			if _, err := createIndividualTeam(c.OrgID, c.ProgramID, configID, uid, title); err != nil {
				return created, err
			}
			created++
		}
	} else {
		groups, err := alsTeamGroups(cohortID)
		if err != nil {
			return 0, err
		}
		want := map[string]bool{}
		for _, g := range req.GroupIDs {
			want[g] = true
		}
		for _, g := range groups {
			if len(req.GroupIDs) > 0 && !want[g.GroupID] {
				continue
			}
			gid := uuid.MustParse(g.GroupID)
			name := g.Name
			if name == "" {
				name = c.Title
			}
			if _, err := upsertConfigTeamForGroup(c.OrgID, c.ProgramID, gid, configID, c.Title); err != nil {
				return created, err
			}
			created++
		}
	}
	if created == 0 {
		return 0, fmt.Errorf("%w: no teams to assign (check cohort has als_team groups or participants)", ErrConfigValidation)
	}
	if err := updateConfig(configID, map[string]any{"status": "assigned"}); err != nil {
		return created, err
	}
	return created, nil
}

// ── Milestones ────────────────────────────────────────────────────────────

func createMilestoneService(configID uuid.UUID, req MilestoneRequest) (*MilestoneDTO, error) {
	if strings.TrimSpace(req.Title) == "" {
		return nil, fmt.Errorf("%w: milestone title is required", ErrConfigValidation)
	}
	m := &CapstoneMilestone{
		ID: uuid.New(), ConfigID: configID, Title: strings.TrimSpace(req.Title),
		SortOrder: maxMilestoneOrder(configID) + 1, Status: "upcoming",
		CreatedAt: time.Now(), UpdatedAt: time.Now(),
	}
	if req.DueDate != "" {
		if d, e := time.Parse("2006-01-02", req.DueDate); e == nil {
			m.DueDate = &d
		}
	}
	if err := createMilestone(m); err != nil {
		return nil, err
	}
	md := MilestoneDTO{ID: m.ID.String(), Title: m.Title, Status: m.Status, SortOrder: m.SortOrder}
	if m.DueDate != nil {
		md.DueDate = m.DueDate.Format("2006-01-02")
	}
	return &md, nil
}

func updateMilestoneService(id uuid.UUID, req MilestoneRequest, status string) error {
	fields := map[string]any{}
	if strings.TrimSpace(req.Title) != "" {
		fields["title"] = strings.TrimSpace(req.Title)
	}
	if req.DueDate != "" {
		if d, e := time.Parse("2006-01-02", req.DueDate); e == nil {
			fields["due_date"] = d
		}
	}
	if status != "" {
		switch status {
		case "upcoming", "open", "overdue", "done":
			fields["status"] = status
		default:
			return fmt.Errorf("%w: invalid milestone status", ErrConfigValidation)
		}
	}
	if len(fields) == 0 {
		return nil
	}
	return updateMilestone(id, fields)
}

func deleteMilestoneService(id uuid.UUID) error { return deleteMilestone(id) }

// ── Grading + release + completion + certificate ──────────────────────────

// gradeService records a team or individual grade (held). Returns the
// participant ids that should be notified only on RELEASE - grading itself is
// silent to participants.
func gradeService(configID, gradedBy uuid.UUID, req GradeRequest) error {
	c, err := getConfig(configID)
	if err != nil {
		return err
	}
	if req.Score < 0 || req.Score > 10 {
		return fmt.Errorf("%w: score must be 0..10", ErrConfigValidation)
	}
	teamID, err := uuid.Parse(strings.TrimSpace(req.TeamID))
	if err != nil {
		return fmt.Errorf("%w: team_id is required", ErrConfigValidation)
	}
	// Ensure the team belongs to this config.
	t, err := getTeam(teamID)
	if err != nil {
		return err
	}
	if t.ConfigID == nil || *t.ConfigID != configID {
		return fmt.Errorf("%w: team does not belong to this capstone", ErrConfigValidation)
	}
	// Gate 1: can't grade before the team has submitted its final deliverable.
	if t.SubmissionStatus != "submitted" {
		return fmt.Errorf("%w: this team hasn't submitted their capstone yet", ErrConfigValidation)
	}
	// Gate 2: once a grade has been released it's locked - re-grading requires an
	// explicit re-open (POST /release is one-way; add a reopen endpoint later).
	if existing, e := getGradeFor(teamID, req.ParticipantID); e == nil && existing != nil && existing.ReleasedAt != nil {
		return fmt.Errorf("%w: this grade is already released and locked", ErrConfigValidation)
	}

	g := &CapstoneGrade{
		ID: uuid.New(), ConfigID: configID, TeamID: teamID, Score: req.Score, GradedBy: &gradedBy,
	}
	if strings.TrimSpace(req.ParticipantID) != "" {
		pid, e := uuid.Parse(req.ParticipantID)
		if e != nil {
			return fmt.Errorf("%w: invalid participant_id", ErrConfigValidation)
		}
		g.ParticipantID = &pid
	}
	pc, _ := json.Marshal(req.PerCriterion)
	g.PerCriterion = pc
	if req.Comments != "" {
		cm := req.Comments
		g.Comments = &cm
	}
	if err := upsertGrade(g); err != nil {
		return err
	}
	_ = c // threshold used at release-time completion
	return nil
}

// releaseService releases all grades for a config, computes completion (whole
// team must clear the passing threshold on the TEAM-level grade), issues
// certificates for completed members, and returns the participant ids to notify.
func releaseService(configID uuid.UUID) ([]string, error) {
	c, err := getConfig(configID)
	if err != nil {
		return nil, err
	}
	if _, err := releaseGrades(configID); err != nil {
		return nil, err
	}

	teams, err := teamsForConfig(configID)
	if err != nil {
		return nil, err
	}
	grades, err := gradesForConfig(configID)
	if err != nil {
		return nil, err
	}
	teamGrade := map[uuid.UUID]float64{}
	haveTeamGrade := map[uuid.UUID]bool{}
	for _, g := range grades {
		if g.ParticipantID == nil {
			teamGrade[g.TeamID] = g.Score
			haveTeamGrade[g.TeamID] = true
		}
	}

	notify := []string{}
	for _, t := range teams {
		members := teamMembersForCompletion(&t)
		// Whole-team completion: the team-level grade must clear the threshold.
		complete := haveTeamGrade[t.ID] && teamGrade[t.ID] >= c.PassingThreshold
		status := "in_progress"
		if complete {
			status = "complete"
		}
		_ = setTeamCompletion(t.ID, status)

		for _, uid := range members {
			notify = append(notify, uid.String())
			if complete {
				issueCertificateIfNeeded(configID, t.ID, uid, teamGrade[t.ID])
			}
		}
	}
	return notify, nil
}

// teamMembersForCompletion returns the participant user ids of a team.
func teamMembersForCompletion(t *CapstoneTeam) []uuid.UUID {
	out := []uuid.UUID{}
	if t.IndividualUserID != nil {
		out = append(out, *t.IndividualUserID)
		return out
	}
	if t.GroupID != nil {
		if rows, err := groupTeamMembers(*t.GroupID); err == nil {
			for _, r := range rows {
				if id, e := uuid.Parse(r.UserID); e == nil {
					out = append(out, id)
				}
			}
		}
	}
	return out
}

// issueCertificateIfNeeded creates a certificate record once per (config, user).
func issueCertificateIfNeeded(configID, teamID, participantID uuid.UUID, score float64) {
	exists, err := certificateExists(configID, participantID)
	if err != nil || exists {
		return
	}
	serial := "CAP-" + strings.ToUpper(uuid.New().String()[:8])
	_ = createCertificate(&CapstoneCertificate{
		ID: uuid.New(), ConfigID: configID, TeamID: teamID, ParticipantID: participantID,
		Score: score, SerialNo: serial, IssuedAt: time.Now(),
	})
}

// ── mapping helpers ───────────────────────────────────────────────────────

func configToDTO(c *CapstoneConfig, org, program string, teamCount int) ConfigDTO {
	dto := ConfigDTO{
		ID: c.ID.String(), OrgID: c.OrgID.String(), Org: org,
		ProgramID: c.ProgramID.String(), Program: program,
		Title: c.Title, TeamStructure: c.TeamStructure, PassingThreshold: c.PassingThreshold,
		Status: c.Status, TeamCount: teamCount, CreatedAt: c.CreatedAt.UTC().Format(time.RFC3339),
		DeliverableFormat: jsonStrings(c.DeliverableFormat),
		Rubric:            jsonRubric(c.Rubric),
		Resources:         jsonResources(c.Resources),
		ReferenceFiles:    jsonRefFiles(c.ReferenceFiles),
	}
	if c.PhaseID != nil {
		dto.PhaseID = c.PhaseID.String()
	}
	if c.ActivityID != nil {
		dto.ActivityID = c.ActivityID.String()
	}
	if c.Theme != nil {
		dto.Theme = *c.Theme
	}
	if c.ProblemStatement != nil {
		dto.ProblemStatement = *c.ProblemStatement
	}
	if c.Objectives != nil {
		dto.Objectives = *c.Objectives
	}
	if c.Deadline != nil {
		dto.Deadline = c.Deadline.Format("2006-01-02")
	}
	return dto
}

func gradeToDTO(g *CapstoneGrade) GradeDTO {
	d := GradeDTO{
		TeamID: g.TeamID.String(), Score: g.Score,
		PerCriterion: jsonCriterionScores(g.PerCriterion),
		Released:     g.ReleasedAt != nil, GradedAt: g.GradedAt.UTC().Format(time.RFC3339),
	}
	if g.ParticipantID != nil {
		d.ParticipantID = g.ParticipantID.String()
	}
	if g.Comments != nil {
		d.Comments = *g.Comments
	}
	return d
}

func jsonStrings(raw []byte) []string {
	out := []string{}
	if len(raw) > 0 {
		_ = json.Unmarshal(raw, &out)
	}
	return out
}
func jsonRubric(raw []byte) []RubricCriterion {
	out := []RubricCriterion{}
	if len(raw) > 0 {
		_ = json.Unmarshal(raw, &out)
	}
	return out
}
func jsonResources(raw []byte) []ResourceLink {
	out := []ResourceLink{}
	if len(raw) > 0 {
		_ = json.Unmarshal(raw, &out)
	}
	return out
}
func jsonRefFiles(raw []byte) []ReferenceFile {
	out := []ReferenceFile{}
	if len(raw) > 0 {
		_ = json.Unmarshal(raw, &out)
	}
	return out
}
func jsonCriterionScores(raw []byte) []CriterionScoreInput {
	out := []CriterionScoreInput{}
	if len(raw) > 0 {
		_ = json.Unmarshal(raw, &out)
	}
	return out
}
func deref(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}
