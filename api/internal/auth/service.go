package auth

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"log"
	"os"
	"time"

	"github.com/golang-jwt/jwt/v4"
	"github.com/xa-lms/api/internal/rbac"
	"github.com/xa-lms/api/internal/shared"
	"github.com/xa-lms/api/pkg/database"
	"github.com/xa-lms/api/pkg/email"
	"golang.org/x/crypto/bcrypt"
)

var (
	ErrInvalidCredentials  = errors.New("invalid email or password")
	ErrInactiveAccount     = errors.New("account is inactive")
	ErrEmailTaken          = errors.New("email already registered")
	ErrInvalidRole         = errors.New("role must be participant or program_manager")
	ErrEmailNotVerified    = errors.New("email not verified - please check your inbox")
	ErrInvalidToken        = errors.New("verification link is invalid or has expired")
)

func loginService(req LoginRequest) (*LoginResponse, error) {
	user, err := findUserByEmail(req.Email)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return nil, ErrInvalidCredentials
		}
		return nil, err
	}

	if !user.IsActive {
		return nil, ErrInactiveAccount
	}

	if !user.IsVerified {
		return nil, ErrEmailNotVerified
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)); err != nil {
		return nil, ErrInvalidCredentials
	}

	token, err := generateJWT(user)
	if err != nil {
		return nil, err
	}

	return &LoginResponse{
		AccessToken: token,
		User:        buildUserDTO(user),
	}, nil
}

func registerService(req RegisterRequest) (*RegisterResponse, error) {
	if req.Name == "" {
		return nil, errors.New("name is required")
	}
	if req.Email == "" {
		return nil, errors.New("email is required")
	}
	if len(req.Password) < 6 {
		return nil, errors.New("password must be at least 6 characters")
	}
	if req.Role != "participant" && req.Role != "program_manager" {
		return nil, ErrInvalidRole
	}

	exists, err := userExistsByEmail(req.Email)
	if err != nil {
		return nil, err
	}
	if exists {
		return nil, ErrEmailTaken
	}

	hash, err := HashPassword(req.Password)
	if err != nil {
		return nil, err
	}

	token, err := generateSecureToken()
	if err != nil {
		return nil, err
	}
	expiresAt := time.Now().Add(24 * time.Hour)

	user := &User{
		Name:                  req.Name,
		Email:                 req.Email,
		PasswordHash:          hash,
		Role:                  req.Role,
		IsActive:              true,
		IsVerified:            false,
		VerificationToken:     &token,
		VerificationExpiresAt: &expiresAt,
	}
	if err := createUser(user); err != nil {
		return nil, err
	}

	// Base-persona role assignment for cut-over personas (program_manager).
	// Best-effort at signup for immediacy; verifyEmailService guarantees it before
	// the account becomes usable. Idempotent; no-op for non-cutover personas.
	_ = rbac.EnsureBaseRoleAssignment(database.DB, user.ID.String(), user.Role, "")

	// Send verification email (non-blocking - failure doesn't break registration)
	go sendVerificationEmail(user.Name, string(user.Email), token)

	return &RegisterResponse{
		Message: "Account created. Please check your email to verify your address before signing in.",
		Email:   string(user.Email),
	}, nil
}

func verifyEmailService(req VerifyEmailRequest) (*LoginResponse, error) {
	if req.Token == "" {
		return nil, ErrInvalidToken
	}

	user, err := findUserByVerificationToken(req.Token)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return nil, ErrInvalidToken
		}
		return nil, err
	}

	if user.IsVerified {
		// Already verified - just issue a token so the user lands on dashboard
		token, err := generateJWT(user)
		if err != nil {
			return nil, err
		}
		return &LoginResponse{
			AccessToken: token,
			User:        buildUserDTO(user),
		}, nil
	}

	if user.VerificationExpiresAt != nil && time.Now().After(*user.VerificationExpiresAt) {
		return nil, ErrInvalidToken
	}

	if err := markUserVerified(user.ID.String()); err != nil {
		return nil, err
	}
	user.IsVerified = true

	// Guarantee the base-persona assignment exists before this now-usable account
	// can hit any cut-over route. Idempotent; no-op for non-cutover personas.
	verifyOrg := ""
	if o := findOrgIDForUser(user.ID.String()); o != nil {
		verifyOrg = *o
	}
	if err := rbac.EnsureBaseRoleAssignment(database.DB, user.ID.String(), user.Role, verifyOrg); err != nil {
		return nil, err
	}

	jwtToken, err := generateJWT(user)
	if err != nil {
		return nil, err
	}

	return &LoginResponse{
		AccessToken: jwtToken,
		User:        buildUserDTO(user),
	}, nil
}

func resendVerificationService(req ResendVerificationRequest) error {
	if req.Email == "" {
		return errors.New("email is required")
	}

	user, err := findUserByEmail(req.Email)
	if err != nil {
		// Don't reveal whether the email exists
		return nil
	}

	if user.IsVerified {
		return nil
	}

	token, err := generateSecureToken()
	if err != nil {
		return err
	}
	expiresAt := time.Now().Add(24 * time.Hour)

	if err := setVerificationToken(user.ID.String(), token, expiresAt); err != nil {
		return err
	}

	go sendVerificationEmail(user.Name, string(user.Email), token)
	return nil
}

func meService(userID string) (*UserDTO, error) {
	user, err := findUserByID(userID)
	if err != nil {
		return nil, err
	}
	dto := buildUserDTO(user)
	return &dto, nil
}

// buildUserDTO assembles the response shape shared by every auth entry point
// (login, OTP login, email verification, /auth/me), so SecondaryRoles and
// any future derived field is computed in exactly one place.
func buildUserDTO(user *User) UserDTO {
	orgID := findOrgIDForUser(user.ID.String())
	org := ""
	if orgID != nil {
		org = *orgID
	}
	secondary, err := rbac.SecondaryBaseRoles(user.ID.String(), org, user.Role)
	if err != nil {
		// Non-fatal: a dual-role UI hint is never worth failing login over.
		log.Printf("[auth] failed to resolve secondary roles for user=%s: %v", user.ID, err)
		secondary = []string{}
	}
	return UserDTO{
		ID:             user.ID.String(),
		Email:          string(user.Email),
		Name:           user.Name,
		Role:           user.Role,
		AvatarURL:      user.AvatarURL,
		OrgID:          orgID,
		IsVerified:     user.IsVerified,
		SecondaryRoles: secondary,
	}
}

func generateJWT(user *User) (string, error) {
	secret := os.Getenv("JWT_SECRET")
	if secret == "" {
		secret = "xa-lms-dev-secret-change-in-prod"
	}

	claims := shared.JWTClaims{
		UserID: user.ID.String(),
		Email:  string(user.Email),
		Role:   user.Role,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(24 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(secret))
}

// HashPassword is exported so the seeder can use it.
func HashPassword(password string) (string, error) {
	b, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	return string(b), err
}

func generateSecureToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

func sendVerificationEmail(name, toEmail, token string) {
	webOrigin := os.Getenv("WEB_ORIGIN")
	if webOrigin == "" {
		webOrigin = "http://localhost:3000"
	}
	verifyURL := fmt.Sprintf("%s/verify-email?token=%s", webOrigin, token)
	body := email.VerifyEmailTemplate(name, verifyURL)
	_ = email.Send(toEmail, "Verify your Intellique email address", body)
}
