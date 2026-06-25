package auth

import (
	"errors"
	"os"
	"time"

	"github.com/golang-jwt/jwt/v4"
	"github.com/xa-lms/api/internal/shared"
	"golang.org/x/crypto/bcrypt"
)

var (
	ErrInvalidCredentials = errors.New("invalid email or password")
	ErrInactiveAccount    = errors.New("account is inactive")
	ErrEmailTaken         = errors.New("email already registered")
	ErrInvalidRole        = errors.New("role must be participant or program_manager")
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

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)); err != nil {
		return nil, ErrInvalidCredentials
	}

	token, err := generateJWT(user)
	if err != nil {
		return nil, err
	}

	return &LoginResponse{
		AccessToken: token,
		User: UserDTO{
			ID:        user.ID.String(),
			Email:     string(user.Email),
			Name:      user.Name,
			Role:      user.Role,
			AvatarURL: user.AvatarURL,
			OrgID:     findOrgIDForUser(user.ID.String()),
		},
	}, nil
}

func registerService(req RegisterRequest) (*LoginResponse, error) {
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

	user := &User{
		Name:         req.Name,
		Email:        req.Email,
		PasswordHash: hash,
		Role:         req.Role,
		IsActive:     true,
	}
	if err := createUser(user); err != nil {
		return nil, err
	}

	token, err := generateJWT(user)
	if err != nil {
		return nil, err
	}

	return &LoginResponse{
		AccessToken: token,
		User: UserDTO{
			ID:        user.ID.String(),
			Email:     string(user.Email),
			Name:      user.Name,
			Role:      user.Role,
			AvatarURL: user.AvatarURL,
			OrgID:     nil,
		},
	}, nil
}

func meService(userID string) (*UserDTO, error) {
	user, err := findUserByID(userID)
	if err != nil {
		return nil, err
	}
	return &UserDTO{
		ID:        user.ID.String(),
		Email:     string(user.Email),
		Name:      user.Name,
		Role:      user.Role,
		AvatarURL: user.AvatarURL,
		OrgID:     findOrgIDForUser(userID),
	}, nil
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

// HashPassword is exported so the seeder can use it
func HashPassword(password string) (string, error) {
	b, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	return string(b), err
}
