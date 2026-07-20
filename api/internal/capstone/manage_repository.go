package capstone

import (
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/xa-lms/api/pkg/database"
	"gorm.io/gorm"
)

// ── Config CRUD ───────────────────────────────────────────────────────────

func createConfig(c *CapstoneConfig) error { return database.DB.Create(c).Error }

// getConfigForPhase returns the capstone config already attached to this
// program+phase, if any — Program Design's "Set up Capstone" attach button
// must stay idempotent (re-clicking after a remount, e.g. navigating away
// and back, must not create a second config for the same phase).
func getConfigForPhase(programID uuid.UUID, phaseID string) (*CapstoneConfig, error) {
	if phaseID == "" {
		return nil, nil
	}
	pid, err := uuid.Parse(phaseID)
	if err != nil {
		return nil, nil
	}
	var c CapstoneConfig
	err = database.DB.Where("program_id = ? AND phase_id = ?", programID, pid).First(&c).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return &c, nil
}

func getConfig(id uuid.UUID) (*CapstoneConfig, error) {
	var c CapstoneConfig
	if err := database.DB.Where("id = ?", id).First(&c).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &c, nil
}

func updateConfig(id uuid.UUID, fields map[string]any) error {
	fields["updated_at"] = time.Now()
	res := database.DB.Model(&CapstoneConfig{}).Where("id = ?", id).Updates(fields)
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return ErrNotFound
	}
	return nil
}

func deleteConfig(id uuid.UUID) error {
	return database.DB.Where("id = ?", id).Delete(&CapstoneConfig{}).Error
}

// configListRow joins a config to its org/program names and team count.
type configListRow struct {
	ID         string
	OrgID      string
	Org        string
	ProgramID  string
	Program    string
	PhaseID    *string
	ActivityID *string
	Title      string
	Status     string
	TeamCount  int
	CreatedAt  time.Time
}

// listConfigs returns capstone configs scoped for staff. orgID "" = all orgs
// (superadmin); programIDs non-nil restricts to those programs (faculty's).
func listConfigs(orgID string, programIDs []string) ([]configListRow, error) {
	q := `
		SELECT cc.id::text AS id, cc.org_id::text AS org_id, o.name AS org,
		       cc.program_id::text AS program_id, p.title AS program,
		       cc.phase_id::text AS phase_id, cc.activity_id::text AS activity_id,
		       cc.title, cc.status, cc.created_at,
		       (SELECT COUNT(*) FROM capstone_teams t WHERE t.config_id = cc.id) AS team_count
		FROM capstone_configs cc
		JOIN organizations o ON o.id = cc.org_id
		JOIN programs p      ON p.id = cc.program_id
		WHERE 1 = 1`
	args := []any{}
	if orgID != "" {
		q += ` AND cc.org_id = ?::uuid`
		args = append(args, orgID)
	}
	if programIDs != nil {
		if len(programIDs) == 0 {
			return []configListRow{}, nil
		}
		q += ` AND cc.program_id IN ?`
		args = append(args, programIDs)
	}
	q += ` ORDER BY cc.created_at DESC`
	var rows []configListRow
	err := database.DB.Raw(q, args...).Scan(&rows).Error
	return rows, err
}

// ── Milestones ────────────────────────────────────────────────────────────

func createMilestone(m *CapstoneMilestone) error { return database.DB.Create(m).Error }

func listMilestones(configID uuid.UUID) ([]CapstoneMilestone, error) {
	var rows []CapstoneMilestone
	err := database.DB.Where("config_id = ?", configID).Order("sort_order, due_date NULLS LAST").Find(&rows).Error
	return rows, err
}

func updateMilestone(id uuid.UUID, fields map[string]any) error {
	fields["updated_at"] = time.Now()
	res := database.DB.Model(&CapstoneMilestone{}).Where("id = ?", id).Updates(fields)
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return ErrNotFound
	}
	return nil
}

func deleteMilestone(id uuid.UUID) error {
	return database.DB.Where("id = ?", id).Delete(&CapstoneMilestone{}).Error
}

func maxMilestoneOrder(configID uuid.UUID) int {
	var n *int
	database.DB.Model(&CapstoneMilestone{}).Where("config_id = ?", configID).
		Select("MAX(sort_order)").Scan(&n)
	if n == nil {
		return -1
	}
	return *n
}

// ── Teams under a config ──────────────────────────────────────────────────

func teamsForConfig(configID uuid.UUID) ([]CapstoneTeam, error) {
	var rows []CapstoneTeam
	err := database.DB.Where("config_id = ?", configID).Find(&rows).Error
	return rows, err
}

func getTeam(id uuid.UUID) (*CapstoneTeam, error) {
	var t CapstoneTeam
	if err := database.DB.Where("id = ?", id).First(&t).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &t, nil
}

// als_team groups in a cohort (for group-structure assignment).
type cohortGroupRow struct {
	GroupID string
	Name    string
	OrgID   string
}

func alsTeamGroups(cohortID uuid.UUID) ([]cohortGroupRow, error) {
	var rows []cohortGroupRow
	err := database.DB.Raw(`
		SELECT g.id::text AS group_id, g.name, c.org_id::text AS org_id
		FROM cohort_groups g
		JOIN cohorts c ON c.id = g.cohort_id
		WHERE g.cohort_id = ? AND g.group_type = 'als_team'
		ORDER BY g.name
	`, cohortID).Scan(&rows).Error
	return rows, err
}

// cohortParticipants lists a cohort's active participants (for individual
// capstone assignment — one team per participant).
type cohortParticipantRow struct {
	UserID string
	Name   string
	OrgID  string
}

func cohortParticipants(cohortID uuid.UUID) ([]cohortParticipantRow, error) {
	var rows []cohortParticipantRow
	err := database.DB.Raw(`
		SELECT u.id::text AS user_id, u.name, c.org_id::text AS org_id
		FROM enrollments e
		JOIN users u   ON u.id = e.user_id
		JOIN cohorts c ON c.id = e.cohort_id
		WHERE e.cohort_id = ? AND e.role = 'participant' AND e.status != 'withdrawn'
		ORDER BY u.name
	`, cohortID).Scan(&rows).Error
	return rows, err
}

// upsertConfigTeamForGroup get-or-creates a team row for (config, group) and
// links it to the config. Returns the team id.
func upsertConfigTeamForGroup(orgID, programID, groupID, configID uuid.UUID, title string) (uuid.UUID, error) {
	var t CapstoneTeam
	err := database.DB.Where("program_id = ? AND group_id = ?", programID, groupID).First(&t).Error
	if err == nil {
		_ = database.DB.Model(&CapstoneTeam{}).Where("id = ?", t.ID).
			Updates(map[string]any{"config_id": configID, "title": title, "updated_at": time.Now()}).Error
		return t.ID, nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return uuid.Nil, err
	}
	t = CapstoneTeam{
		ID: uuid.New(), OrgID: orgID, ProgramID: programID, GroupID: &groupID,
		ConfigID: &configID, Title: title, SubmissionStatus: "not_submitted",
		PanelStatus: "pending", CompletionStatus: "in_progress",
		CreatedAt: time.Now(), UpdatedAt: time.Now(),
	}
	if err := database.DB.Create(&t).Error; err != nil {
		return uuid.Nil, err
	}
	return t.ID, nil
}

// createIndividualTeam materializes a per-participant "team" for an individual
// capstone. group_id is NULL (individuals have no cohort_group); the participant
// is carried on individual_user_id with a partial unique (config, individual_user_id).
func createIndividualTeam(orgID, programID, configID, userID uuid.UUID, title string) (uuid.UUID, error) {
	var existing CapstoneTeam
	err := database.DB.Where("config_id = ? AND individual_user_id = ?", configID, userID).First(&existing).Error
	if err == nil {
		return existing.ID, nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return uuid.Nil, err
	}
	t := CapstoneTeam{
		ID: uuid.New(), OrgID: orgID, ProgramID: programID, GroupID: nil,
		ConfigID: &configID, IndividualUserID: &userID, Title: title,
		SubmissionStatus: "not_submitted", PanelStatus: "pending", CompletionStatus: "in_progress",
		CreatedAt: time.Now(), UpdatedAt: time.Now(),
	}
	if err := database.DB.Create(&t).Error; err != nil {
		return uuid.Nil, err
	}
	return t.ID, nil
}

// teamMemberRows returns the participant members of a team. For a group team
// that's the als_team group membership; for an individual team it's the single
// individual_user_id.
type managedMemberRow struct {
	UserID string
	Name   string
	Email  string
}

func groupTeamMembers(groupID uuid.UUID) ([]managedMemberRow, error) {
	var rows []managedMemberRow
	err := database.DB.Raw(`
		SELECT u.id::text AS user_id, u.name, u.email
		FROM enrollments e
		JOIN users u ON u.id = e.user_id
		WHERE e.group_id = ? AND e.role = 'participant' AND e.status != 'withdrawn'
		ORDER BY u.name
	`, groupID).Scan(&rows).Error
	return rows, err
}

func singleUser(userID uuid.UUID) ([]managedMemberRow, error) {
	var rows []managedMemberRow
	err := database.DB.Raw(`SELECT id::text AS user_id, name, email FROM users WHERE id = ?`, userID).Scan(&rows).Error
	return rows, err
}

func groupName(groupID uuid.UUID) string {
	var name string
	database.DB.Raw(`SELECT name FROM cohort_groups WHERE id = ?`, groupID).Scan(&name)
	return name
}

// ── Grades ────────────────────────────────────────────────────────────────

// upsertGrade writes a team or individual grade (unreleased). Uniqueness is by
// (team_id, participant_id) with participant_id NULL = team-level.
func upsertGrade(g *CapstoneGrade) error {
	var existing CapstoneGrade
	q := database.DB.Where("team_id = ?", g.TeamID)
	if g.ParticipantID == nil {
		q = q.Where("participant_id IS NULL")
	} else {
		q = q.Where("participant_id = ?", *g.ParticipantID)
	}
	err := q.First(&existing).Error
	if err == nil {
		return database.DB.Model(&CapstoneGrade{}).Where("id = ?", existing.ID).Updates(map[string]any{
			"score": g.Score, "per_criterion": g.PerCriterion, "comments": g.Comments,
			"graded_by": g.GradedBy, "graded_at": time.Now(), "updated_at": time.Now(),
		}).Error
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return err
	}
	g.GradedAt = time.Now()
	return database.DB.Create(g).Error
}

func gradesForConfig(configID uuid.UUID) ([]CapstoneGrade, error) {
	var rows []CapstoneGrade
	err := database.DB.Where("config_id = ?", configID).Find(&rows).Error
	return rows, err
}

// getGradeFor returns the existing grade for (team, participant) — participant
// "" = team-level. Returns (nil, nil) when none exists.
func getGradeFor(teamID uuid.UUID, participantIDStr string) (*CapstoneGrade, error) {
	q := database.DB.Where("team_id = ?", teamID)
	if strings.TrimSpace(participantIDStr) == "" {
		q = q.Where("participant_id IS NULL")
	} else {
		pid, err := uuid.Parse(participantIDStr)
		if err != nil {
			return nil, err
		}
		q = q.Where("participant_id = ?", pid)
	}
	var g CapstoneGrade
	err := q.First(&g).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &g, nil
}

// releaseGrades sets released_at on all of a config's grades. Returns affected count.
func releaseGrades(configID uuid.UUID) (int64, error) {
	res := database.DB.Model(&CapstoneGrade{}).
		Where("config_id = ? AND released_at IS NULL", configID).
		Update("released_at", time.Now())
	return res.RowsAffected, res.Error
}

func setTeamCompletion(teamID uuid.UUID, status string) error {
	return database.DB.Model(&CapstoneTeam{}).Where("id = ?", teamID).
		Updates(map[string]any{"completion_status": status, "updated_at": time.Now()}).Error
}

// ── Certificates ──────────────────────────────────────────────────────────

func certificateExists(configID, participantID uuid.UUID) (bool, error) {
	var n int64
	err := database.DB.Model(&CapstoneCertificate{}).
		Where("config_id = ? AND participant_id = ?", configID, participantID).Count(&n).Error
	return n > 0, err
}

func createCertificate(cert *CapstoneCertificate) error { return database.DB.Create(cert).Error }

// ── Participant-side reads (individual teams, config, released grade) ──────

// findIndividualTeam resolves a participant's individual capstone team (group_id
// NULL, individual_user_id = user), optionally scoped to a program. Returns
// ErrNotFound when the participant has no individual capstone.
func findIndividualTeam(userID uuid.UUID, programID *uuid.UUID) (*CapstoneTeam, error) {
	q := database.DB.Where("individual_user_id = ?", userID)
	if programID != nil {
		q = q.Where("program_id = ?", *programID)
	}
	var t CapstoneTeam
	err := q.Order("created_at DESC").First(&t).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &t, nil
}

// releasedGradeForTeam returns the released team-level and (optional) individual
// grade for a participant. Unreleased grades are never returned.
func releasedGradeForTeam(teamID, participantID uuid.UUID) (team *CapstoneGrade, individual *CapstoneGrade, err error) {
	var rows []CapstoneGrade
	err = database.DB.Where("team_id = ? AND released_at IS NOT NULL", teamID).Find(&rows).Error
	if err != nil {
		return nil, nil, err
	}
	for i := range rows {
		g := rows[i]
		if g.ParticipantID == nil {
			team = &rows[i]
		} else if *g.ParticipantID == participantID {
			individual = &rows[i]
		}
	}
	return team, individual, nil
}

// ── Scoping helpers ───────────────────────────────────────────────────────

// orgForUser resolves the caller's org (via org_members) — used to scope a
// PM's/SA's created config to their org when no explicit org is supplied.
func orgForUser(userID uuid.UUID) (uuid.UUID, error) {
	var orgID string
	err := database.DB.Raw(`SELECT org_id::text FROM org_members WHERE user_id = ? LIMIT 1`, userID).Scan(&orgID).Error
	if err != nil || orgID == "" {
		return uuid.Nil, ErrNotFound
	}
	return uuid.Parse(orgID)
}

// facultyProgramIDs returns the program ids a faculty is assigned to (via
// activity_faculty → activities → program_phases). Used to scope the Faculty
// capstone list. Empty slice ⇒ faculty teaches nothing (sees nothing).
func facultyProgramIDs(facultyID uuid.UUID) ([]string, error) {
	var ids []string
	err := database.DB.Raw(`
		SELECT DISTINCT pp.program_id::text
		FROM activity_faculty af
		JOIN activities a       ON a.id = af.activity_id
		JOIN program_phases pp  ON pp.id = a.phase_id
		WHERE af.faculty_user_id = ?
	`, facultyID).Scan(&ids).Error
	if ids == nil {
		ids = []string{}
	}
	return ids, err
}

// programFacultyIDs returns the faculty user ids assigned to a program (to
// notify them a capstone was attached and needs configuring).
func programFacultyIDs(programID uuid.UUID) ([]string, error) {
	var ids []string
	err := database.DB.Raw(`
		SELECT DISTINCT af.faculty_user_id::text
		FROM activity_faculty af
		JOIN activities a      ON a.id = af.activity_id
		JOIN program_phases pp ON pp.id = a.phase_id
		WHERE pp.program_id = ?
	`, programID).Scan(&ids).Error
	if ids == nil {
		ids = []string{}
	}
	return ids, err
}

// programOrg resolves a program's org (for setting a new config's org_id).
func programOrg(programID uuid.UUID) (uuid.UUID, error) {
	var orgID string
	err := database.DB.Raw(`SELECT org_id::text FROM programs WHERE id = ?`, programID).Scan(&orgID).Error
	if err != nil || orgID == "" {
		return uuid.Nil, ErrNotFound
	}
	return uuid.Parse(orgID)
}

// configParticipantIDs returns all participant user ids across a config's teams
// (used to notify on assign/release).
func configParticipantIDs(configID uuid.UUID) ([]string, error) {
	var ids []string
	err := database.DB.Raw(`
		SELECT DISTINCT uid FROM (
			SELECT e.user_id::text AS uid
			FROM capstone_teams t
			JOIN enrollments e ON e.group_id = t.group_id AND e.role = 'participant' AND e.status != 'withdrawn'
			WHERE t.config_id = ? AND t.group_id IS NOT NULL
			UNION
			SELECT t.individual_user_id::text AS uid
			FROM capstone_teams t
			WHERE t.config_id = ? AND t.individual_user_id IS NOT NULL
		) s WHERE uid IS NOT NULL
	`, configID, configID).Scan(&ids).Error
	if ids == nil {
		ids = []string{}
	}
	return ids, err
}
