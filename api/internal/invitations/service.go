package invitations

import (
	"crypto/sha256"
	"errors"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v4"
	"github.com/google/uuid"
	"github.com/xa-lms/api/internal/auth"
	"github.com/xa-lms/api/internal/rbac"
	"github.com/xa-lms/api/pkg/database"
	"github.com/xa-lms/api/pkg/email"
	"github.com/xa-lms/api/pkg/seed"
	"gorm.io/gorm"
)

var (
	ErrInvalidToken  = errors.New("invalid or expired invite link")
	ErrAlreadyUsed   = errors.New("invite already accepted")
	ErrAlreadyMember = errors.New("user is already a member of this organization")
	ErrWrongOrg      = errors.New("user belongs to a different organization")
)

// inviteBaseURL resolves the web app's base URL used to build invite links.
// Falling back to localhost silently in production sends recipients a link
// that only works on the SENDER's machine — loud-log it so a missing
// APP_BASE_URL on the deployed env file gets noticed immediately instead of
// surfacing as "the invite link doesn't work" days later.
func inviteBaseURL() string {
	baseURL := os.Getenv("APP_BASE_URL")
	if baseURL != "" {
		return baseURL
	}
	if os.Getenv("APP_ENV") == "production" {
		fmt.Println("⚠️  APP_BASE_URL is not set in production — invite emails will link to localhost and will not work for recipients. Set APP_BASE_URL in the API's env file.")
	}
	return "http://localhost:3000"
}

// ── Send Invite ────────────────────────────────────────────────────

func sendInviteService(req SendInviteRequest, inviterID string) (*InvitationDTO, error) {
	req.Email = strings.ToLower(strings.TrimSpace(req.Email))
	if req.Email == "" {
		return nil, errors.New("email is required")
	}
	// Program-only enrollment: when no cohort is chosen, land the participant in
	// the program's default "Unassigned" cohort (created lazily). They can be
	// moved to a real cohort later via Cohort Management.
	if req.CohortID == "" {
		if req.ProgramID == "" || req.OrgID == "" {
			return nil, errors.New("cohort_id or (program_id + org_id) is required")
		}
		cid, err := ensureUnassignedCohort(req.OrgID, req.ProgramID)
		if err != nil {
			return nil, err
		}
		req.CohortID = cid
	}
	role := req.Role
	if role == "" {
		role = "participant"
	}

	// Optional participant sub-type → a custom role to attach on accept. Fail-safe:
	// if it can't be resolved, proceed as a normal participant invite rather than
	// blocking enrollment. Keeps persona role = 'participant'.
	var assignRoleID *uuid.UUID
	if req.Variant == "participant_retail" {
		if id, e := lookupParticipantRetailRoleID(); e == nil {
			assignRoleID = id
		}
	}

	// Fetch cohort meta (org_id, names for email)
	meta, err := lookupCohortMeta(req.CohortID)
	if err != nil {
		return nil, errors.New("cohort not found")
	}

	// Check if user already exists
	existing, err := lookupUser(req.Email)
	if err != nil {
		return nil, err
	}

	if existing != nil {
		// User exists — if not yet verified (placeholder account from CSV import),
		// treat them like a new user and send a proper invite email so they can set their password.
		if !existing.IsVerified {
			// Fall through to the invite creation path below.
		} else {
			// Verified user — check org membership
			inOrg, err := isInOrg(existing.ID, meta.OrgID)
			if err != nil {
				return nil, err
			}
			if !inOrg {
				return nil, ErrWrongOrg
			}
			// Already in org — enroll directly without email
			enrolled, err := isEnrolledInCohort(existing.ID, req.CohortID)
			if err != nil {
				return nil, err
			}
			if enrolled {
				return nil, errors.New("user is already enrolled in this cohort")
			}
			if err := enrollExistingUser(existing.ID, meta.OrgID, req.CohortID, role); err != nil {
				return nil, err
			}
			// Already-verified members are enrolled immediately (no accept step),
			// so attach the retail role now if requested.
			if assignRoleID != nil {
				_ = assignCustomRole(database.DB, existing.ID, *assignRoleID)
			}
			return nil, nil
		}
	}

	// New user (or unverified placeholder) — create invite
	// Expire any old pending invites for same email+cohort
	if err := expireOldInvites(req.Email, req.CohortID); err != nil {
		return nil, err
	}

	// Generate signed JWT (role + cohort + name + department locked server-side)
	rawToken, err := generateInviteJWT(req.Email, role, req.CohortID, meta.OrgID, req.Name, req.Department, "")
	if err != nil {
		return nil, err
	}
	tokenHash := hashToken(rawToken)

	cohortUUID := uuid.MustParse(req.CohortID)
	inv := &Invitation{
		CohortID:     &cohortUUID,
		OrgID:        uuid.MustParse(meta.OrgID),
		Email:        req.Email,
		Role:         role,
		TokenHash:    tokenHash,
		Status:       "pending",
		InvitedBy:    uuid.MustParse(inviterID),
		ExpiresAt:    time.Now().Add(48 * time.Hour),
		AssignRoleID: assignRoleID,
	}
	if err := createInvitation(inv); err != nil {
		return nil, err
	}

	// Create a placeholder user + pending enrollment so the PM can see the invite in the cohort table immediately.
	// The user record gets a placeholder password; acceptInviteService will set the real one.
	nilCohortCheck := "00000000-0000-0000-0000-000000000000"
	if req.CohortID != nilCohortCheck {
		if err := upsertPendingEnrollment(req.Email, req.Name, req.Department, role, meta.OrgID, req.CohortID); err != nil {
			// Non-fatal — invite was created, enrollment placeholder is optional
			fmt.Printf("⚠️  upsertPendingEnrollment: %v\n", err)
		}
	}

	// Build invite URL and send email
	inviteURL := fmt.Sprintf("%s/invite/accept?token=%s", inviteBaseURL(), rawToken)

	go func() {
		body := email.InviteTemplate(req.Email, meta.CohortName, meta.OrgName, inviteURL)
		if err := email.Send(req.Email, "You're invited to join "+meta.CohortName, body); err != nil {
			fmt.Printf("⚠️  Email send failed: %v\n", err)
		}
	}()

	return invToDTO(*inv), nil
}

// ── Send Org-Level Faculty Invite (no cohort) ──────────────────────

func sendOrgFacultyInviteService(req SendOrgFacultyInviteRequest, inviterID string) (*InvitationDTO, error) {
	req.Email = strings.ToLower(strings.TrimSpace(req.Email))
	if req.Email == "" {
		return nil, errors.New("email is required")
	}
	// Org-level invites normally cover the two non-cohort staff personas
	// (faculty/coach); a role_id instead invites into a specific CUSTOM role
	// (e.g. "Secondary PM") — the enum persona/org_members role is derived
	// from that role's own base_role, and the custom role becomes the user's
	// sole role_assignment on accept (never both — same mutual-exclusivity
	// pattern as the "Participant Retail" variant below).
	var assignRoleID *uuid.UUID
	role := strings.TrimSpace(req.Role)
	roleLabel := "Faculty"
	if req.RoleID != "" {
		rid, err := uuid.Parse(req.RoleID)
		if err != nil {
			return nil, errors.New("invalid role_id")
		}
		baseRole, name, err := lookupCustomRoleBase(req.RoleID)
		if err != nil {
			return nil, errors.New("role_id does not exist")
		}
		if baseRole == "superadmin" {
			return nil, errors.New("superadmin-tier roles cannot be invited this way")
		}
		assignRoleID = &rid
		role = baseRole
		roleLabel = name
	} else {
		if role == "" {
			role = "faculty"
		}
		if role != "faculty" && role != "coach" {
			return nil, errors.New("role must be faculty or coach")
		}
		if role == "coach" {
			roleLabel = "Coach"
		}
	}

	// Coach scoping: a program_id scopes the coach to that program and resolves the
	// org from the program. A coach without program_id and without org_id lands in
	// the default "XA-LMS" org (org-wide coach). Faculty always require an org_id.
	programID := strings.TrimSpace(req.ProgramID)
	if role == "coach" {
		if programID != "" {
			porg, perr := lookupProgramOrg(programID)
			if perr != nil {
				return nil, errors.New("program not found")
			}
			req.OrgID = porg
		} else if req.OrgID == "" {
			req.OrgID = seed.DefaultOrgID()
		}
	}
	if req.OrgID == "" {
		return nil, errors.New("org_id is required")
	}

	orgName, err := lookupOrgMeta(req.OrgID)
	if err != nil {
		return nil, errors.New("organization not found")
	}

	existing, err := lookupUser(req.Email)
	if err != nil {
		return nil, err
	}

	if existing != nil {
		inOrg, err := isInOrg(existing.ID, req.OrgID)
		if err != nil {
			return nil, err
		}
		// A faculty can ALSO be enrolled as a coach: if the user is already in
		// the org and we're enrolling them as a coach, just add the coaches row
		// instead of rejecting as an existing member. Likewise, a role_id invite
		// for an already-in-org member just attaches the custom role.
		if inOrg {
			if assignRoleID != nil {
				if err := assignCustomRole(database.DB, existing.ID, *assignRoleID); err != nil {
					return nil, err
				}
				return nil, nil
			}
			if role == "coach" {
				if err := upsertCoach(existing.ID, req.OrgID, programID); err != nil {
					return nil, err
				}
				return nil, nil
			}
			return nil, ErrAlreadyMember
		}
		// Add to org without cohort enrollment
		if err := database.DB.Exec(`
			INSERT INTO org_members (org_id, user_id, role) VALUES (?, ?, ?)
			ON CONFLICT DO NOTHING
		`, req.OrgID, existing.ID, role).Error; err != nil {
			return nil, err
		}
		if role == "coach" {
			if err := upsertCoach(existing.ID, req.OrgID, programID); err != nil {
				return nil, err
			}
		}
		if assignRoleID != nil {
			if err := assignCustomRole(database.DB, existing.ID, *assignRoleID); err != nil {
				return nil, err
			}
		}
		return nil, nil
	}

	// New user — cohort_id stays NULL (org-level invite, no cohort)
	nilCohort := "00000000-0000-0000-0000-000000000000"
	if err := expireOldOrgFacultyInvites(req.Email, req.OrgID); err != nil {
		return nil, err
	}

	// JWT still carries the nil-UUID sentinel so acceptInviteService can detect
	// "no cohort" via the existing claims.CohortID == nilCohort check. The name
	// (if the PM supplied one) prefills the accept form but stays editable there.
	rawToken, err := generateInviteJWT(req.Email, role, nilCohort, req.OrgID, strings.TrimSpace(req.Name), "", programID)
	if err != nil {
		return nil, err
	}
	tokenHash := hashToken(rawToken)

	inv := &Invitation{
		CohortID:     nil,
		OrgID:        uuid.MustParse(req.OrgID),
		Email:        req.Email,
		Role:         role,
		TokenHash:    tokenHash,
		Status:       "pending",
		InvitedBy:    uuid.MustParse(inviterID),
		ExpiresAt:    time.Now().Add(48 * time.Hour),
		AssignRoleID: assignRoleID,
	}
	if err := createInvitation(inv); err != nil {
		return nil, err
	}

	inviteURL := fmt.Sprintf("%s/invite/accept?token=%s", inviteBaseURL(), rawToken)

	go func() {
		body := email.InviteTemplate(req.Email, orgName+" ("+roleLabel+")", orgName, inviteURL)
		if err := email.Send(req.Email, "You're invited to join "+orgName+" as "+roleLabel, body); err != nil {
			fmt.Printf("⚠️  %s invite email failed: %v\n", roleLabel, err)
		}
	}()

	return invToDTO(*inv), nil
}

// ── Validate Token (pre-fill form) ────────────────────────────────

func validateTokenService(rawToken string) (*ValidateTokenDTO, error) {
	claims, err := parseInviteJWT(rawToken)
	if err != nil {
		return nil, ErrInvalidToken
	}

	inv, err := findByTokenHash(hashToken(rawToken))
	if err != nil {
		return nil, ErrInvalidToken
	}
	if inv.Status == "accepted" {
		return nil, ErrAlreadyUsed
	}
	if inv.Status == "expired" || time.Now().After(inv.ExpiresAt) {
		return nil, ErrInvalidToken
	}

	return &ValidateTokenDTO{
		Email:      claims.Email,
		Role:       claims.Role,
		CohortID:   claims.CohortID,
		OrgID:      claims.OrgID,
		Name:       claims.Name,
		Department: claims.Department,
	}, nil
}

// ── Accept Invite ─────────────────────────────────────────────────

func acceptInviteService(req AcceptInviteRequest) error {
	if len(req.Password) < 6 {
		return errors.New("password must be at least 6 characters")
	}

	claims, err := parseInviteJWT(req.Token)
	if err != nil {
		return ErrInvalidToken
	}

	inv, err := findByTokenHash(hashToken(req.Token))
	if err != nil {
		return ErrInvalidToken
	}
	if inv.Status == "accepted" {
		return ErrAlreadyUsed
	}
	if inv.Status == "expired" || time.Now().After(inv.ExpiresAt) {
		return ErrInvalidToken
	}

	// Resolve the name to store: the invitee's own input on the accept form wins,
	// then the name baked into the invite by the PM, then a readable fallback
	// derived from the email local-part so the name is never blank.
	name := strings.TrimSpace(req.Name)
	if name == "" {
		name = strings.TrimSpace(claims.Name)
	}
	if name == "" {
		name = nameFromEmail(claims.Email)
	}

	// Everything in one transaction: upsert user, add to org, enroll in cohort, mark invite accepted
	return database.DB.Transaction(func(tx *gorm.DB) error {
		hash, err := auth.HashPassword(req.Password)
		if err != nil {
			return err
		}

		// If an unverified placeholder user exists, update it; otherwise create.
		var existingID string
		tx.Raw(`SELECT id FROM users WHERE email = ? LIMIT 1`, claims.Email).Scan(&existingID)

		if existingID != "" {
			// Update the placeholder account with real password and mark verified
			if err := tx.Exec(`
				UPDATE users SET password_hash = ?, name = ?, role = ?, is_verified = true, is_active = true, updated_at = NOW()
				WHERE id = ?
			`, hash, name, claims.Role, existingID).Error; err != nil {
				return err
			}
		} else {
			u := &auth.User{
				Email:        claims.Email,
				Name:         name,
				PasswordHash: hash,
				Role:         claims.Role,
				IsActive:     true,
				IsVerified:   true,
			}
			if err := tx.Create(u).Error; err != nil {
				return err
			}
			existingID = u.ID.String()
		}

		// Add to org_members (upsert — safe if already exists from CSV import)
		if err := tx.Exec(`
			INSERT INTO org_members (org_id, user_id, role)
			VALUES (?, ?, ?)
			ON CONFLICT (org_id, user_id) DO UPDATE SET role = EXCLUDED.role
		`, claims.OrgID, existingID, claims.Role).Error; err != nil {
			return err
		}

		// Persona assignment for cut-over roles. A cut-over persona MUST have a
		// role_assignments row or the resolver denies it — created atomically here.
		// A custom role (e.g. "Participant Retail") and the base system role are
		// MUTUALLY EXCLUSIVE: the resolver unions all assignments, so granting both
		// would let the full base role wipe out a restricted custom role. When the
		// invite carries a custom role, that role IS the user's persona assignment;
		// otherwise fall back to the base system role.
		if inv.AssignRoleID != nil {
			if err := assignCustomRole(tx, existingID, *inv.AssignRoleID); err != nil {
				return err
			}
		} else if err := rbac.EnsureBaseRoleAssignment(tx, existingID, claims.Role, claims.OrgID); err != nil {
			return err
		}

		// Coach invites also register the user in the coaches table so they show
		// up as an assignable coach on the coaching admin tab. program_id (if the
		// invite was scoped to a program) is carried through so the coach lands on
		// the right program; NULL = org-wide coach.
		if claims.Role == "coach" {
			var progID interface{}
			if claims.ProgramID != "" {
				progID = claims.ProgramID
			}
			if err := tx.Exec(`
				INSERT INTO coaches (org_id, user_id, program_id)
				VALUES (?::uuid, ?::uuid, ?::uuid)
				ON CONFLICT DO NOTHING
			`, claims.OrgID, existingID, progID).Error; err != nil {
				return err
			}
		}

		// Activate enrollment: flip invited → enrolled (or insert fresh if somehow missing).
		nilCohort := "00000000-0000-0000-0000-000000000000"
		if claims.CohortID != nilCohort {
			if err := tx.Exec(`
				INSERT INTO enrollments (cohort_id, user_id, role, status, enrolled_at)
				VALUES (?, ?, ?, 'enrolled', NOW())
				ON CONFLICT (cohort_id, user_id) DO UPDATE
				  SET status = 'enrolled', enrolled_at = NOW()
			`, claims.CohortID, existingID, claims.Role).Error; err != nil {
				return err
			}
		}

		// Mark invite accepted
		return markAccepted(inv)
	})
}

// ── List invites for a cohort ─────────────────────────────────────

func listInvitesService(cohortID string) ([]InvitationDTO, error) {
	list, err := listByCohort(cohortID)
	if err != nil {
		return nil, err
	}
	result := make([]InvitationDTO, 0, len(list))
	for _, inv := range list {
		result = append(result, *invToDTO(inv))
	}
	return result, nil
}

// ── Direct enroll (existing user already in org) ──────────────────

func enrollExistingUser(userID, orgID, cohortID, role string) error {
	return database.DB.Exec(`
		INSERT INTO enrollments (cohort_id, user_id, role, status, enrolled_at)
		VALUES (?, ?, ?, 'enrolled', NOW())
		ON CONFLICT (cohort_id, user_id) DO NOTHING
	`, cohortID, userID, role).Error
}

// ── JWT helpers ───────────────────────────────────────────────────

type inviteClaims struct {
	Email      string `json:"email"`
	Role       string `json:"role"`
	CohortID   string `json:"cohort_id"`
	OrgID      string `json:"org_id"`
	Name       string `json:"name"`
	Department string `json:"department"`
	ProgramID  string `json:"program_id,omitempty"` // coach scoping — empty = org-wide
	jwt.RegisteredClaims
}

func generateInviteJWT(email, role, cohortID, orgID, name, department, programID string) (string, error) {
	claims := inviteClaims{
		Email:      email,
		Role:       role,
		CohortID:   cohortID,
		OrgID:      orgID,
		Name:       name,
		Department: department,
		ProgramID:  programID,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(48 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(jwtSecret())
}

func parseInviteJWT(raw string) (*inviteClaims, error) {
	token, err := jwt.ParseWithClaims(raw, &inviteClaims{}, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method")
		}
		return jwtSecret(), nil
	})
	if err != nil || !token.Valid {
		return nil, ErrInvalidToken
	}
	c, ok := token.Claims.(*inviteClaims)
	if !ok {
		return nil, ErrInvalidToken
	}
	return c, nil
}

func jwtSecret() []byte {
	s := os.Getenv("JWT_SECRET")
	if s == "" {
		s = "xa-lms-dev-secret-change-in-prod"
	}
	return []byte(s)
}

func hashToken(raw string) string {
	h := sha256.Sum256([]byte(raw))
	return fmt.Sprintf("%x", h)
}

// nameFromEmail derives a readable display name from an email local-part as a
// last-resort fallback when no name was supplied (e.g. "rohit.k@x.co" → "Rohit K").
func nameFromEmail(email string) string {
	local := email
	if i := strings.IndexByte(email, '@'); i > 0 {
		local = email[:i]
	}
	local = strings.NewReplacer(".", " ", "_", " ", "-", " ", "+", " ").Replace(local)
	fields := strings.Fields(local)
	for i, f := range fields {
		fields[i] = strings.ToUpper(f[:1]) + f[1:]
	}
	name := strings.Join(fields, " ")
	if name == "" {
		return "New User"
	}
	return name
}

// ── Mapper ────────────────────────────────────────────────────────

func invToDTO(inv Invitation) *InvitationDTO {
	cohortID := ""
	if inv.CohortID != nil {
		cohortID = inv.CohortID.String()
	}
	return &InvitationDTO{
		ID:        inv.ID.String(),
		CohortID:  cohortID,
		Email:     inv.Email,
		Role:      inv.Role,
		Status:    inv.Status,
		ExpiresAt: inv.ExpiresAt,
		CreatedAt: inv.CreatedAt,
	}
}
