package shared

import (
	"os"
	"strings"

	"github.com/golang-jwt/jwt/v4"
	"github.com/labstack/echo/v4"
)

type JWTClaims struct {
	UserID string `json:"user_id"`
	Email  string `json:"email"`
	Role   string `json:"role"`
	jwt.RegisteredClaims
}

// RequireAuth validates the Bearer token and stores claims in context
func RequireAuth() echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			header := c.Request().Header.Get("Authorization")
			if !strings.HasPrefix(header, "Bearer ") {
				return Unauthorized(c, "missing or invalid token")
			}
			tokenStr := strings.TrimPrefix(header, "Bearer ")

			claims := &JWTClaims{}
			token, err := jwt.ParseWithClaims(tokenStr, claims, func(t *jwt.Token) (any, error) {
				if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
					return nil, echo.ErrUnauthorized
				}
				return []byte(os.Getenv("JWT_SECRET")), nil
			})
			if err != nil || !token.Valid {
				return Unauthorized(c, "invalid or expired token")
			}

			c.Set("claims", claims)
			return next(c)
		}
	}
}

// RequirePermission checks resource:action against the RBAC matrix
func RequirePermission(resource, action string) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			claims, ok := c.Get("claims").(*JWTClaims)
			if !ok || claims == nil {
				return Forbidden(c)
			}
			// Real, authoritative decision — unchanged; this is what is enforced.
			realAllow := Can(claims.Role, resource, action)
			// Shadow-mode observation (program_manager only): compares the
			// not-yet-enforced rbac.Resolve path against realAllow and logs
			// disagreements. Never affects the outcome below.
			ShadowCheck(claims.UserID, claims.Role, resource, action, realAllow)
			if !realAllow {
				return Forbidden(c)
			}
			return next(c)
		}
	}
}

// ClaimsFrom is a convenience helper for handlers
func ClaimsFrom(c echo.Context) *JWTClaims {
	claims, _ := c.Get("claims").(*JWTClaims)
	return claims
}
