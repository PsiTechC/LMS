package capstone

import (
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/xa-lms/api/pkg/database"
	"gorm.io/gorm"
)

var ErrNotFound = errors.New("not found")

// myTeamRow is the participant's capstone team context resolved from their
// enrollment → cohort_group (als_team) → program.
type myTeamRow struct {
	GroupID     string
	GroupName   string
	ProgramID   string
	ProgramName string
	CohortName  string
	EndDate     *time.Time
	OrgID       string
}

// verifiedEnrollment confirms the user is an active participant in programID
// and returns the enrollment's org_id - used before self-creating an
// individual capstone team, so program_id is never trusted from the caller
// alone (see getOrCreateIndividualTeamIfEnrolled in service.go).
type verifiedEnrollmentRow struct {
	OrgID string
}

func verifiedEnrollment(userID, programID uuid.UUID) (*verifiedEnrollmentRow, error) {
	var row verifiedEnrollmentRow
	err := database.DB.Raw(`
		SELECT c.org_id::text AS org_id
		FROM enrollments e
		JOIN cohorts c ON c.id = e.cohort_id
		WHERE e.user_id = ? AND c.program_id = ? AND e.role = 'participant' AND e.status != 'withdrawn'
		LIMIT 1
	`, userID, programID).Scan(&row).Error
	if err != nil {
		return nil, err
	}
	if row.OrgID == "" {
		return nil, ErrNotFound
	}
	return &row, nil
}

// findMyTeam locates the participant's als_team group and the owning program/org.
// When programID is provided (from the program switcher) it scopes to that
// program so a participant with teams in multiple programs sees the correct
// capstone. Returns ErrNotFound when the participant isn't in a capstone team.
func findMyTeam(userID uuid.UUID, programID *uuid.UUID) (*myTeamRow, error) {
	var row myTeamRow
	q := `
		SELECT g.id::text        AS group_id,
		       g.name            AS group_name,
		       c.program_id::text AS program_id,
		       p.title           AS program_name,
		       c.name            AS cohort_name,
		       p.end_date        AS end_date,
		       c.org_id::text    AS org_id
		FROM enrollments e
		JOIN cohort_groups g ON g.id = e.group_id AND g.group_type = 'als_team'
		JOIN cohorts c ON c.id = e.cohort_id
		JOIN programs p ON p.id = c.program_id
		WHERE e.user_id = ? AND e.role = 'participant'`
	args := []any{userID}
	if programID != nil {
		q += ` AND c.program_id = ?`
		args = append(args, *programID)
	}
	q += ` ORDER BY e.enrolled_at DESC LIMIT 1`

	err := database.DB.Raw(q, args...).Scan(&row).Error
	if err != nil {
		return nil, err
	}
	if row.GroupID == "" {
		return nil, ErrNotFound
	}
	return &row, nil
}

// getOrCreateTeam returns the capstone_teams row for (program, group), creating
// it lazily on first access so the participant always has a workspace.
func getOrCreateTeam(orgID, programID, groupID uuid.UUID) (*CapstoneTeam, error) {
	var t CapstoneTeam
	err := database.DB.Where("program_id = ? AND group_id = ?", programID, groupID).First(&t).Error
	if err == nil {
		return &t, nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}
	t = CapstoneTeam{
		ID: uuid.New(), OrgID: orgID, ProgramID: programID, GroupID: &groupID,
		Title: "Capstone Project", SubmissionStatus: "not_submitted", PanelStatus: "pending",
		CreatedAt: time.Now(), UpdatedAt: time.Now(),
	}
	if err := database.DB.Create(&t).Error; err != nil {
		// Race: another member created it first - re-read.
		if e2 := database.DB.Where("program_id = ? AND group_id = ?", programID, groupID).First(&t).Error; e2 == nil {
			return &t, nil
		}
		return nil, err
	}
	return &t, nil
}

func getTeamByID(id uuid.UUID) (*CapstoneTeam, error) {
	var t CapstoneTeam
	if err := database.DB.Where("id = ?", id).First(&t).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &t, nil
}

func updateTeam(id uuid.UUID, fields map[string]any) error {
	fields["updated_at"] = time.Now()
	return database.DB.Model(&CapstoneTeam{}).Where("id = ?", id).Updates(fields).Error
}

// ── Members (reuse cohort_groups membership) ──────────────────────

type memberRow struct {
	UserID     string
	Name       string
	Email      string
	Department *string
}

func teamMembers(groupID uuid.UUID) ([]memberRow, error) {
	var rows []memberRow
	err := database.DB.Raw(`
		SELECT u.id::text AS user_id, u.name, u.email, u.department
		FROM enrollments e
		JOIN users u ON u.id = e.user_id
		WHERE e.group_id = ? AND e.role = 'participant' AND e.status != 'withdrawn'
		ORDER BY u.name
	`, groupID).Scan(&rows).Error
	return rows, err
}

// ── Files ─────────────────────────────────────────────────────────

type fileRow struct {
	ID           string
	Title        string
	FileURL      string
	UploadedByID *string
	UploadedBy   *string
	Visibility   string
	CreatedAt    time.Time
}

// teamFiles returns a team's files visible to viewerID: all public files plus
// the viewer's own personal files (personal files are hidden from teammates).
func teamFiles(teamID, viewerID uuid.UUID) ([]fileRow, error) {
	var rows []fileRow
	err := database.DB.Raw(`
		SELECT f.id::text AS id, f.title, f.file_url AS file_url,
		       f.uploaded_by::text AS uploaded_by_id, u.name AS uploaded_by,
		       f.visibility, f.created_at
		FROM capstone_files f
		LEFT JOIN users u ON u.id = f.uploaded_by
		WHERE f.capstone_team_id = ?
		  AND (f.visibility = 'public' OR f.uploaded_by = ?)
		ORDER BY f.created_at DESC
	`, teamID, viewerID).Scan(&rows).Error
	return rows, err
}

func addFile(f *CapstoneFile) error { return database.DB.Create(f).Error }

// ── Peer review ───────────────────────────────────────────────────

type peerAssignRow struct {
	AssignmentID string
	TargetTeam   string
	DueDate      *time.Time
	MyRating     *int
}

// peerAssignmentsForUser lists cross-team review assignments for the reviewer's
// team, with the caller's own rating (if already submitted).
func peerAssignmentsForUser(reviewerTeamID, userID uuid.UUID) ([]peerAssignRow, error) {
	var rows []peerAssignRow
	err := database.DB.Raw(`
		SELECT pa.id::text AS assignment_id,
		       COALESCE(g.name, 'Team') AS target_team,
		       pa.due_date AS due_date,
		       pr.rating AS my_rating
		FROM capstone_peer_assignments pa
		JOIN capstone_teams tt ON tt.id = pa.target_team_id
		LEFT JOIN cohort_groups g ON g.id = tt.group_id
		LEFT JOIN capstone_peer_reviews pr ON pr.assignment_id = pa.id AND pr.reviewer_id = ?
		WHERE pa.reviewer_team_id = ?
		ORDER BY pa.due_date NULLS LAST
	`, userID, reviewerTeamID).Scan(&rows).Error
	return rows, err
}

func getAssignment(id uuid.UUID) (*CapstonePeerAssignment, error) {
	var a CapstonePeerAssignment
	if err := database.DB.Where("id = ?", id).First(&a).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &a, nil
}

func upsertPeerReview(r *CapstonePeerReview) error {
	// One review per (assignment, reviewer) - replace on re-submit.
	return database.DB.Where("assignment_id = ? AND reviewer_id = ?", r.AssignmentID, r.ReviewerID).
		Assign(map[string]any{"rating": r.Rating, "comment": r.Comment}).
		FirstOrCreate(r).Error
}

// ── Panel ─────────────────────────────────────────────────────────

type panelRow struct {
	PanelistName string
	PanelistRole *string
	Rating       int
	Comment      *string
	CreatedAt    time.Time
}

func panelFeedback(teamID uuid.UUID) ([]panelRow, error) {
	var rows []panelRow
	err := database.DB.Raw(`
		SELECT panelist_name, panelist_role, rating, comment, created_at
		FROM capstone_panel_feedback
		WHERE capstone_team_id = ?
		ORDER BY created_at
	`, teamID).Scan(&rows).Error
	return rows, err
}
