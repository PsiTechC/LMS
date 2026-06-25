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
