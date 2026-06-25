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
	"github.com/xa-lms/api/pkg/database"
	"github.com/xa-lms/api/pkg/email"
	"gorm.io/gorm"
)

var (
	ErrInvalidToken  = errors.New("invalid or expired invite link")
	ErrAlreadyUsed   = errors.New("invite already accepted")
	ErrAlreadyMember = errors.New("user is already a member of this organization")
	ErrWrongOrg      = errors.New("user belongs to a different organization")
)

// ── Send Invite ────────────────────────────────────────────────────

func sendInviteService(req SendInviteRequest, inviterID string) (*InvitationDTO, error) {
	req.Email = strings.ToLower(strings.TrimSpace(req.Email))
	if req.Email == "" {
		return nil, errors.New("email is required")
	}
	if req.CohortID == "" {
		return nil, errors.New("cohort_id is required")
	}
	role := req.Role
	if role == "" {
		role = "participant"
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
		// User exists — check org membership
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
		return nil, enrollExistingUser(existing.ID, meta.OrgID, req.CohortID, role)
	}

	// User doesn't exist — create invite
	// Expire any old pending invites for same email+cohort
	if err := expireOldInvites(req.Email, req.CohortID); err != nil {
		return nil, err
	}

	// Generate signed JWT (role + cohort locked server-side)
	rawToken, err := generateInviteJWT(req.Email, role, req.CohortID, meta.OrgID)
	if err != nil {
		return nil, err
	}
	tokenHash := hashToken(rawToken)

	inv := &Invitation{
		CohortID:  uuid.MustParse(req.CohortID),
		OrgID:     uuid.MustParse(meta.OrgID),
		Email:     req.Email,
		Role:      role,
		TokenHash: tokenHash,
		Status:    "pending",
		InvitedBy: uuid.MustParse(inviterID),
		ExpiresAt: time.Now().Add(48 * time.Hour),
	}
	if err := createInvitation(inv); err != nil {
		return nil, err
	}

	// Build invite URL and send email
	baseURL := os.Getenv("APP_BASE_URL")
	if baseURL == "" {
		baseURL = "http://localhost:3000"
	}
	inviteURL := fmt.Sprintf("%s/invite/accept?token=%s", baseURL, rawToken)

	go func() {
		body := email.InviteTemplate(req.Email, meta.CohortName, meta.OrgName, inviteURL)
		if err := email.Send(req.Email, "You're invited to join "+meta.CohortName, body); err != nil {
			fmt.Printf("⚠️  Email send failed: %v\n", err)
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
		Email:    claims.Email,
		Role:     claims.Role,
		CohortID: claims.CohortID,
		OrgID:    claims.OrgID,
	}, nil
}

// ── Accept Invite ─────────────────────────────────────────────────

func acceptInviteService(req AcceptInviteRequest) error {
	if strings.TrimSpace(req.Name) == "" {
		return errors.New("name is required")
	}
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

	// Everything in one transaction: create user, add to org, enroll in cohort, mark invite accepted
	return database.DB.Transaction(func(tx *gorm.DB) error {
		hash, err := auth.HashPassword(req.Password)
		if err != nil {
			return err
		}

		u := &auth.User{
			Email:        claims.Email,
			Name:         req.Name,
			PasswordHash: hash,
			Role:         claims.Role,
			IsActive:     true,
		}
		if err := tx.Create(u).Error; err != nil {
			return err
		}

		// Add to org_members
		if err := tx.Exec(`
			INSERT INTO org_members (org_id, user_id, role)
			VALUES (?, ?, ?)
		`, claims.OrgID, u.ID.String(), claims.Role).Error; err != nil {
			return err
		}

		// Enroll in cohort
		if err := tx.Exec(`
			INSERT INTO enrollments (cohort_id, user_id, role, status, enrolled_at)
			VALUES (?, ?, ?, 'enrolled', NOW())
		`, claims.CohortID, u.ID.String(), claims.Role).Error; err != nil {
			return err
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
	Email    string `json:"email"`
	Role     string `json:"role"`
	CohortID string `json:"cohort_id"`
	OrgID    string `json:"org_id"`
	jwt.RegisteredClaims
}

func generateInviteJWT(email, role, cohortID, orgID string) (string, error) {
	claims := inviteClaims{
		Email:    email,
		Role:     role,
		CohortID: cohortID,
		OrgID:    orgID,
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

// ── Mapper ────────────────────────────────────────────────────────

func invToDTO(inv Invitation) *InvitationDTO {
	return &InvitationDTO{
		ID:        inv.ID.String(),
		CohortID:  inv.CohortID.String(),
		Email:     inv.Email,
		Role:      inv.Role,
		Status:    inv.Status,
		ExpiresAt: inv.ExpiresAt,
		CreatedAt: inv.CreatedAt,
	}
}
