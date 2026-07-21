package faculty_management

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"math"
	"net/mail"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/xa-lms/api/internal/invitations"
	"github.com/xa-lms/api/pkg/email"
	"golang.org/x/crypto/bcrypt"
)

// ErrEmailTaken signals a conflict when the email already belongs to an active user.
var ErrEmailTaken = errors.New("a user with that email already exists")

var (
	validDeliveryModes = map[string]bool{"virtual": true, "in-person": true, "hybrid": true}
	validAccessLevels  = map[string]bool{"standard": true, "advanced": true, "admin": true}
	validInviteStatus  = map[string]bool{"pending": true, "sent": true, "accepted": true}
)

// ── Faculty Profiles ─────────────────────────────────────────────────────────

func getProfileService(userID string) (*FacultyProfileDTO, error) {
	p, err := getProfileByUser(userID)
	if err != nil {
		return nil, err
	}
	return profileToDTO(*p), nil
}

func listProfilesService() ([]FacultyProfileDTO, error) {
	rows, err := listProfiles()
	if err != nil {
		return nil, err
	}
	out := make([]FacultyProfileDTO, 0, len(rows))
	for _, r := range rows {
		out = append(out, *profileToDTO(r))
	}
	return out, nil
}

func upsertProfileService(req UpsertProfileRequest) (*FacultyProfileDTO, error) {
	uid, err := uuid.Parse(req.UserID)
	if err != nil {
		return nil, errors.New("invalid user_id")
	}
	for _, m := range req.DeliveryModes {
		if !validDeliveryModes[m] {
			return nil, errors.New("delivery_modes must each be one of: virtual, in-person, hybrid")
		}
	}

	certs, err := marshalArr(req.Certifications)
	if err != nil {
		return nil, errors.New("invalid certifications")
	}
	modes, err := marshalArr(req.DeliveryModes)
	if err != nil {
		return nil, errors.New("invalid delivery_modes")
	}

	p := &FacultyProfile{
		UserID:         uid,
		Specialization: req.Specialization,
		Certifications: certs,
		Bio:            req.Bio,
		DeliveryModes:  modes,
		Location:       req.Location,
		LinkedinURL:    req.LinkedinURL,
	}
	if err := upsertProfile(p); err != nil {
		return nil, err
	}
	return getProfileService(req.UserID)
}

// ── Onboarding Invites ───────────────────────────────────────────────────────

func createInviteService(req CreateInviteRequest, actorID string) (*OnboardingInviteDTO, error) {
	fid, err := uuid.Parse(req.FacultyUserID)
	if err != nil {
		return nil, errors.New("invalid faculty_user_id")
	}
	access := req.AccessLevel
	if access == "" {
		access = "standard"
	}
	if !validAccessLevels[access] {
		return nil, errors.New("access_level must be one of: standard, advanced, admin")
	}

	inv := &OnboardingInvite{
		FacultyUserID: fid,
		Status:        "pending",
		AccessLevel:   access,
	}
	if aid, err := uuid.Parse(actorID); err == nil {
		inv.CreatedBy = &aid
	}
	if err := insertInvite(inv); err != nil {
		return nil, err
	}
	return inviteToDTO(*inv), nil
}

func listInvitesService(facultyUserID string) ([]OnboardingInviteDTO, error) {
	rows, err := listInvites(facultyUserID)
	if err != nil {
		return nil, err
	}
	out := make([]OnboardingInviteDTO, 0, len(rows))
	for _, r := range rows {
		out = append(out, *inviteToDTO(r))
	}
	return out, nil
}

func updateInviteService(id string, req UpdateInviteRequest) (*OnboardingInviteDTO, error) {
	fields := map[string]any{}
	if req.Status != nil {
		if !validInviteStatus[*req.Status] {
			return nil, errors.New("status must be one of: pending, sent, accepted")
		}
		fields["status"] = *req.Status
		// Stamp sent_at when transitioning to 'sent'.
		if *req.Status == "sent" {
			fields["sent_at"] = time.Now()
		}
	}
	if req.AccessLevel != nil {
		if !validAccessLevels[*req.AccessLevel] {
			return nil, errors.New("access_level must be one of: standard, advanced, admin")
		}
		fields["access_level"] = *req.AccessLevel
	}
	if len(fields) == 0 {
		return nil, errors.New("no fields to update")
	}
	fields["updated_at"] = time.Now()
	if err := updateInvite(id, fields); err != nil {
		return nil, err
	}
	inv, err := getInviteByID(id)
	if err != nil {
		return nil, err
	}
	return inviteToDTO(*inv), nil
}

// ── Roster & Dashboard (read) ────────────────────────────────────────────────
//
// Engagement % (the single source-of-truth formula used everywhere here):
//
//	engagement % = (attendance marks that are 'present' or 'late')
//	               ─────────────────────────────────────────────── × 100
//	               (all attendance marks across the faculty's sessions)
//
// It is attendance-based and computed from real session_attendance rows joined to
// class_sessions.faculty_id. A faculty with no attendance records reports 0 (there
// is genuinely no basis to report otherwise - the number is never fabricated).

func rosterService(orgID, programID string) ([]FacultyRosterItemDTO, error) {
	base, err := listFacultyBase(orgID, programID)
	if err != nil {
		return nil, err
	}
	stats, err := facultySessionStats()
	if err != nil {
		return nil, err
	}
	eng, err := facultyEngagement("")
	if err != nil {
		return nil, err
	}
	progs, err := facultyPrograms()
	if err != nil {
		return nil, err
	}

	out := make([]FacultyRosterItemDTO, 0, len(base))
	for _, b := range base {
		item := FacultyRosterItemDTO{
			UserID:           b.UserID,
			Name:             b.Name,
			Location:         b.Location,
			JoinedAt:         b.CreatedAt.Format(time.RFC3339),
			Specialization:   b.Specialization,
			Certifications:   unmarshalArr(b.Certifications),
			Status:           deriveStatus(b.IsActive, b.InviteStatus),
			EngagementPct:    engagementPct(eng[b.UserID]),
			AssignedPrograms: progs[b.UserID],
		}
		if s, ok := stats[b.UserID]; ok {
			item.SessionsDelivered = s.Delivered
			item.SessionsScheduled = s.Scheduled
		}
		if item.AssignedPrograms == nil {
			item.AssignedPrograms = []FacultyProgramRef{}
		}
		out = append(out, item)
	}
	return out, nil
}

func dashboardSummaryService(orgID string) (*FacultyDashboardSummaryDTO, error) {
	total, err := countFaculty(orgID)
	if err != nil {
		return nil, err
	}
	onboarding, err := countOnboardingFaculty(orgID)
	if err != nil {
		return nil, err
	}
	delivered, err := countSessionsDelivered(orgID)
	if err != nil {
		return nil, err
	}

	// Avg engagement = mean of per-faculty engagement %, over faculty that have
	// attendance data (faculty with no attendance are excluded so the mean is not
	// diluted by zeros). Uses the exact same per-faculty formula documented above.
	eng, err := facultyEngagement(orgID)
	if err != nil {
		return nil, err
	}
	var sum float64
	var n int
	for _, e := range eng {
		if e.Total > 0 {
			sum += engagementPct(e)
			n++
		}
	}
	avg := 0.0
	if n > 0 {
		avg = round1(sum / float64(n))
	}

	return &FacultyDashboardSummaryDTO{
		TotalFaculty:           total,
		OnboardingCount:        onboarding,
		TotalSessionsDelivered: delivered,
		AvgEngagementPct:       avg,
	}, nil
}

// deriveStatus: onboarding if the latest onboarding invite is still
// pending/sent (not yet accepted) - checked FIRST, regardless of is_active,
// because a freshly-onboarded faculty/coach account is deliberately created
// inactive/unverified (see runOnboardTx) until they click their activation
// link. Without this ordering, every new onboardee would render as
// "inactive" (deactivated) instead of "onboarding" (awaiting their own
// action) - a materially different, incorrect signal on the roster. Only
// once the invite is accepted (or there was never one) does is_active=false
// mean what it always meant elsewhere: a deliberately deactivated account.
func deriveStatus(isActive bool, inviteStatus string) string {
	if inviteStatus == "pending" || inviteStatus == "sent" {
		return "onboarding"
	}
	if !isActive {
		return "inactive"
	}
	return "active"
}

func engagementPct(e engagementRow) float64 {
	if e.Total <= 0 {
		return 0
	}
	return round1(float64(e.Engaged) / float64(e.Total) * 100)
}

func round1(v float64) float64 { return math.Round(v*10) / 10 }

// ── Onboard Faculty (single-submit, transactional) ───────────────────────────

func onboardFacultyService(req OnboardFacultyRequest, actorID string) (*OnboardFacultyResponse, error) {
	// 1. Server-side required-field validation (not just UI).
	name := strings.TrimSpace(req.Name)
	emailAddr := strings.TrimSpace(req.Email)
	if name == "" {
		return nil, errors.New("name is required")
	}
	if emailAddr == "" {
		return nil, errors.New("email is required")
	}
	if _, err := mail.ParseAddress(emailAddr); err != nil {
		return nil, errors.New("email is not a valid address")
	}
	// org_id is required (not just optional) now that onboarding always mints
	// a real activation invite, which is org-scoped (Invitation.OrgID is
	// NOT NULL) - there's no such thing as an org-less faculty invite.
	if req.OrgID == "" {
		return nil, errors.New("org_id is required")
	}
	if _, err := uuid.Parse(req.OrgID); err != nil {
		return nil, errors.New("invalid org_id")
	}

	targetRole := req.TargetRole
	if targetRole == "" {
		targetRole = "faculty"
	}
	if targetRole != "faculty" && targetRole != "coach" {
		return nil, errors.New("target_role must be one of: faculty, coach")
	}

	access := req.AccessLevel
	if access == "" {
		access = "standard"
	}
	if !validAccessLevels[access] {
		return nil, errors.New("access_level must be one of: standard, advanced, admin")
	}
	for _, m := range req.DeliveryModes {
		if !validDeliveryModes[m] {
			return nil, errors.New("delivery_modes must each be one of: virtual, in-person, hybrid")
		}
	}

	// Validate + resolve assignments up front. Each needs either an explicit
	// activity_id or a program_id (resolved to a representative activity).
	rows := make([]onboardAssignmentRow, 0, len(req.Assignments))
	for i, a := range req.Assignments {
		activityID := a.ActivityID
		if activityID == "" {
			if a.ProgramID == "" {
				return nil, fmt.Errorf("assignments[%d]: activity_id or program_id is required", i)
			}
			if _, err := uuid.Parse(a.ProgramID); err != nil {
				return nil, fmt.Errorf("assignments[%d].program_id is invalid", i)
			}
			resolved, err := firstActivityForProgram(a.ProgramID)
			if err != nil {
				return nil, err
			}
			if resolved == "" {
				// Program has no activities to assign faculty to - skip honestly.
				continue
			}
			activityID = resolved
		} else if _, err := uuid.Parse(activityID); err != nil {
			return nil, fmt.Errorf("assignments[%d].activity_id is invalid", i)
		}
		if a.CohortID != "" {
			if _, err := uuid.Parse(a.CohortID); err != nil {
				return nil, fmt.Errorf("assignments[%d].cohort_id is invalid", i)
			}
		}
		if a.SessionsPlanned < 0 {
			return nil, fmt.Errorf("assignments[%d].sessions_planned cannot be negative", i)
		}
		avail := ""
		if len(a.Availability) > 0 {
			if !json.Valid(a.Availability) {
				return nil, fmt.Errorf("assignments[%d].availability must be valid JSON", i)
			}
			avail = string(a.Availability)
		}
		rows = append(rows, onboardAssignmentRow{
			ActivityID: activityID, CohortID: a.CohortID, Role: a.Role,
			RoleOnProgram: a.RoleOnProgram, SessionsPlanned: a.SessionsPlanned, AvailabilityJSON: avail,
		})
	}

	// 2. Email uniqueness.
	taken, err := emailExistsActive(emailAddr)
	if err != nil {
		return nil, err
	}
	if taken {
		return nil, ErrEmailTaken
	}

	// 3. Generate + hash a PLACEHOLDER password - random bytes that are never
	// shown to anyone (not returned in the response, not emailed). It exists
	// only to satisfy users.password_hash's NOT NULL constraint; the account
	// stays inactive/unverified (see runOnboardTx) until the faculty member
	// sets their own real password via the activation link sent below.
	placeholder, err := generateTempPassword()
	if err != nil {
		return nil, err
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(placeholder), bcrypt.DefaultCost)
	if err != nil {
		return nil, err
	}

	certs, err := marshalArr(req.Certifications)
	if err != nil {
		return nil, errors.New("invalid certifications")
	}
	modes, err := marshalArr(req.DeliveryModes)
	if err != nil {
		return nil, errors.New("invalid delivery_modes")
	}

	// 4. Transaction - invite starts 'pending'; flipped to 'sent' only after a real send.
	userID, inviteID, made, err := runOnboardTx(onboardTxParams{
		Email: emailAddr, Name: name, Phone: req.Phone, Location: req.Location, OrgID: req.OrgID,
		TargetRole:              targetRole,
		PasswordHash:            string(hash),
		Specialization:          req.Specialization,
		Bio:                     req.Bio,
		LinkedinURL:             req.LinkedinURL,
		CertificationsJSON:      certs,
		DeliveryModesJSON:       modes,
		CoachingYearsExperience: req.CoachingYearsExperience,
		CoachingMethodology:     req.CoachingMethodology,
		MaxConcurrentCoachees:   req.MaxConcurrentCoachees,
		PreferredSessionMins:    req.PreferredSessionMins,
		TimeZone:                req.TimeZone,
		AccessLevel:             access,
		InviteStatus:            "pending",
		CreatedBy:               actorID,
		Assignments:             rows,
	})
	if err != nil {
		return nil, err
	}

	// 5. Activation invite (mandatory - not optional like the old welcome
	// email, since there is no password to relay manually anymore; the
	// emailed link is the ONLY way this account can ever be activated).
	// Sent outside the tx; the user/profile/assignments are already
	// committed at this point regardless of whether the email send succeeds.
	resp := &OnboardFacultyResponse{
		UserID: userID, InviteID: inviteID, Email: emailAddr,
		AccessLevel: access, AssignmentsCreated: made,
	}
	orgName, nerr := lookupOrgName(req.OrgID)
	if nerr != nil || orgName == "" {
		orgName = "Intellique"
	}
	inviteURL, ierr := invitations.CreateStaffActivationInvite(emailAddr, targetRole, req.OrgID, name, actorID)
	if ierr != nil {
		log.Printf("faculty onboard: failed to create activation invite for %s: %v", emailAddr, ierr)
		return resp, nil
	}
	roleLabel := "Faculty"
	if targetRole == "coach" {
		roleLabel = "Coach"
	}
	body := email.InviteTemplate(emailAddr, orgName+" ("+roleLabel+")", orgName, inviteURL)
	if err := email.Send(emailAddr, "You're invited to join "+orgName+" as "+roleLabel, body); err != nil {
		log.Printf("faculty onboard: activation email failed for %s: %v", emailAddr, err)
		return resp, nil
	}
	resp.WelcomeEmailSent = true
	_ = markInviteSent(inviteID)
	return resp, nil
}

// generateTempPassword returns a URL-safe ~16-char random password.
func generateTempPassword() (string, error) {
	b := make([]byte, 12)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

// ── Program access toggle (Manage Faculty Access modal) ──────────────────────

func assignProgramService(req AssignProgramRequest) error {
	if _, err := uuid.Parse(req.FacultyUserID); err != nil {
		return errors.New("invalid faculty_user_id")
	}
	if _, err := uuid.Parse(req.ProgramID); err != nil {
		return errors.New("invalid program_id")
	}
	activityID, err := firstActivityForProgram(req.ProgramID)
	if err != nil {
		return err
	}
	if activityID == "" {
		// No activities exist for this program yet - record the access
		// intent instead of erroring. Materialized into a real
		// activity_faculty row automatically the first time an activity is
		// created for this program (see programs.createActivityService).
		return upsertFacultyProgramAccess(req.ProgramID, req.FacultyUserID)
	}
	return insertActivityFaculty(activityID, req.FacultyUserID)
}

func unassignProgramService(facultyUserID, programID string) error {
	if _, err := uuid.Parse(facultyUserID); err != nil {
		return errors.New("invalid faculty_user_id")
	}
	if _, err := uuid.Parse(programID); err != nil {
		return errors.New("invalid program_id")
	}
	// Clear both possible representations - a materialized activity_faculty
	// assignment AND/OR a still-pending faculty_program_access row. The
	// caller doesn't know (and shouldn't need to know) which state this
	// program/faculty pair is currently in.
	if _, err := removeFacultyFromProgram(facultyUserID, programID); err != nil {
		return err
	}
	return removeFacultyProgramAccess(facultyUserID, programID)
}

// ── activity_faculty extension ───────────────────────────────────────────────

func updateAssignmentService(req UpdateAssignmentRequest) error {
	if _, err := uuid.Parse(req.ActivityID); err != nil {
		return errors.New("invalid activity_id")
	}
	if _, err := uuid.Parse(req.FacultyUserID); err != nil {
		return errors.New("invalid faculty_user_id")
	}

	fields := map[string]any{}
	if req.RoleOnProgram != nil {
		fields["role_on_program"] = *req.RoleOnProgram
	}
	if req.SessionsPlanned != nil {
		if *req.SessionsPlanned < 0 {
			return errors.New("sessions_planned cannot be negative")
		}
		fields["sessions_planned"] = *req.SessionsPlanned
	}
	if len(req.Availability) > 0 {
		if !json.Valid(req.Availability) {
			return errors.New("availability must be valid JSON")
		}
		fields["availability"] = string(req.Availability)
	}
	if len(fields) == 0 {
		return errors.New("no fields to update")
	}
	fields["updated_at"] = time.Now()

	rows, err := updateAssignmentFields(req.ActivityID, req.FacultyUserID, fields)
	if err != nil {
		return err
	}
	if rows == 0 {
		return errors.New("no matching faculty assignment found for that activity")
	}
	return nil
}

// ── Mapping & helpers ─────────────────────────────────────────────────────────

func profileToDTO(p FacultyProfile) *FacultyProfileDTO {
	return &FacultyProfileDTO{
		ID:             p.ID.String(),
		UserID:         p.UserID.String(),
		Specialization: p.Specialization,
		Certifications: unmarshalArr(p.Certifications),
		Bio:            p.Bio,
		DeliveryModes:  unmarshalArr(p.DeliveryModes),
		Location:       p.Location,
		LinkedinURL:    p.LinkedinURL,
		CreatedAt:      p.CreatedAt.Format(time.RFC3339),
		UpdatedAt:      p.UpdatedAt.Format(time.RFC3339),
	}
}

func inviteToDTO(i OnboardingInvite) *OnboardingInviteDTO {
	dto := &OnboardingInviteDTO{
		ID:            i.ID.String(),
		FacultyUserID: i.FacultyUserID.String(),
		Status:        i.Status,
		AccessLevel:   i.AccessLevel,
		CreatedAt:     i.CreatedAt.Format(time.RFC3339),
		UpdatedAt:     i.UpdatedAt.Format(time.RFC3339),
	}
	if i.SentAt != nil {
		dto.SentAt = i.SentAt.Format(time.RFC3339)
	}
	if i.CreatedBy != nil {
		dto.CreatedBy = i.CreatedBy.String()
	}
	return dto
}

func marshalArr(a []string) (string, error) {
	if a == nil {
		a = []string{}
	}
	b, err := json.Marshal(a)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

func unmarshalArr(raw string) []string {
	if raw == "" {
		return []string{}
	}
	var out []string
	if err := json.Unmarshal([]byte(raw), &out); err != nil {
		return []string{}
	}
	return out
}
