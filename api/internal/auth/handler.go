package auth

import (
	"errors"

	"github.com/labstack/echo/v4"
	"github.com/xa-lms/api/internal/audit"
	"github.com/xa-lms/api/internal/shared"
)

type Handler struct{}

func NewHandler() *Handler { return &Handler{} }

func (h *Handler) Register(v1 *echo.Group) {
	g := v1.Group("/auth")
	g.POST("/login", h.login)
	g.POST("/register", h.register)
	g.POST("/verify-email", h.verifyEmail)
	g.POST("/resend-verification", h.resendVerification)
	g.GET("/me", h.me, shared.RequireAuth())
	// Developer OTP login (gated by ENABLE_OTP_LOGIN).
	g.GET("/otp-status", h.otpStatus)
	g.POST("/send-otp", h.sendOTP)
	g.POST("/otp-login", h.otpLogin)
}

// otpStatus lets the frontend know whether to show the OTP login option.
func (h *Handler) otpStatus(c echo.Context) error {
	return shared.OK(c, map[string]bool{"enabled": otpEnabled()})
}

// sendOTP emails a one-time code (dev only). Always 200 to avoid leaking which
// emails exist; 403 only when the feature is disabled.
func (h *Handler) sendOTP(c echo.Context) error {
	var req SendOTPRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "invalid request body", "")
	}
	if err := sendOTPService(req.Email); err != nil {
		if errors.Is(err, ErrOTPDisabled) {
			return shared.Forbidden(c)
		}
		return shared.BadRequest(c, "VALIDATION_ERROR", err.Error(), "email")
	}
	return shared.OK(c, map[string]string{
		"message": "If that email is registered, a sign-in code has been sent. You can also use the fixed dev code.",
	})
}

// otpLogin signs the user in with the fixed dev code or a sent code (dev only).
func (h *Handler) otpLogin(c echo.Context) error {
	var req OTPLoginRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "invalid request body", "")
	}
	if req.Email == "" {
		return shared.BadRequest(c, "VALIDATION_ERROR", "email is required", "email")
	}
	if req.OTP == "" {
		return shared.BadRequest(c, "VALIDATION_ERROR", "otp is required", "otp")
	}

	resp, err := otpLoginService(req.Email, req.OTP)
	if err != nil {
		audit.LogActor("", "", "", audit.Event{
			Category: "auth",
			Action:   "login.otp.failure",
			Severity: audit.SeverityWarning,
			Detail:   map[string]any{"email": req.Email, "reason": err.Error()},
		})
		switch {
		case errors.Is(err, ErrOTPDisabled):
			return shared.Forbidden(c)
		case errors.Is(err, ErrInvalidOTP):
			return shared.Unauthorized(c, "invalid or expired code")
		case errors.Is(err, ErrInvalidCredentials):
			return shared.Unauthorized(c, "no account found for that email")
		case errors.Is(err, ErrInactiveAccount):
			return shared.Unauthorized(c, "account is inactive")
		default:
			return shared.InternalError(c, "otp login failed")
		}
	}

	orgID := ""
	if resp.User.OrgID != nil {
		orgID = *resp.User.OrgID
	}
	audit.LogActor(resp.User.ID, resp.User.Role, orgID, audit.Event{
		Category:   "auth",
		Action:     "login.otp.success",
		Severity:   audit.SeveritySuccess,
		TargetType: "user",
		TargetID:   resp.User.ID,
		Detail:     map[string]any{"email": resp.User.Email},
	})
	return shared.OK(c, resp)
}

func (h *Handler) login(c echo.Context) error {
	var req LoginRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "invalid request body", "")
	}
	if req.Email == "" {
		return shared.BadRequest(c, "VALIDATION_ERROR", "email is required", "email")
	}
	if req.Password == "" {
		return shared.BadRequest(c, "VALIDATION_ERROR", "password is required", "password")
	}

	resp, err := loginService(req)
	if err != nil {
		// Failed login - anonymous actor; record the attempted email + reason.
		audit.LogActor("", "", "", audit.Event{
			Category: "auth",
			Action:   "login.failure",
			Severity: audit.SeverityWarning,
			Detail:   map[string]any{"email": req.Email, "reason": err.Error()},
		})
		switch {
		case errors.Is(err, ErrInvalidCredentials):
			return shared.Unauthorized(c, "invalid email or password")
		case errors.Is(err, ErrInactiveAccount):
			return shared.Unauthorized(c, "account is inactive")
		case errors.Is(err, ErrEmailNotVerified):
			return c.JSON(403, map[string]interface{}{
				"data": nil,
				"error": map[string]string{
					"code":    "EMAIL_NOT_VERIFIED",
					"message": "Please verify your email address before signing in.",
				},
			})
		default:
			return shared.InternalError(c, "login failed")
		}
	}

	// Successful login - actor is the authenticated user.
	orgID := ""
	if resp.User.OrgID != nil {
		orgID = *resp.User.OrgID
	}
	audit.LogActor(resp.User.ID, resp.User.Role, orgID, audit.Event{
		Category:   "auth",
		Action:     "login.success",
		Severity:   audit.SeveritySuccess,
		TargetType: "user",
		TargetID:   resp.User.ID,
		Detail:     map[string]any{"email": resp.User.Email},
	})

	return shared.OK(c, resp)
}

func (h *Handler) register(c echo.Context) error {
	var req RegisterRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "INVALID_BODY", "invalid request body", "")
	}

	resp, err := registerService(req)
	if err != nil {
		switch {
		case errors.Is(err, ErrEmailTaken):
			return shared.Conflict(c, "email already registered")
		case errors.Is(err, ErrInvalidRole):
			return shared.BadRequest(c, "VALIDATION_ERROR", err.Error(), "role")
		default:
			return shared.BadRequest(c, "VALIDATION_ERROR", err.Error(), "")
		}
	}

	return shared.Created(c, resp)
}

func (h *Handler) verifyEmail(c echo.Context) error {
	var req VerifyEmailRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "INVALID_BODY", "invalid request body", "")
	}

	resp, err := verifyEmailService(req)
	if err != nil {
		if errors.Is(err, ErrInvalidToken) {
			return shared.BadRequest(c, "INVALID_TOKEN", "verification link is invalid or has expired", "token")
		}
		return shared.InternalError(c, "verification failed")
	}

	return shared.OK(c, resp)
}

func (h *Handler) resendVerification(c echo.Context) error {
	var req ResendVerificationRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "INVALID_BODY", "invalid request body", "")
	}

	// Always returns 200 - don't reveal whether email exists
	_ = resendVerificationService(req)
	return shared.OK(c, map[string]string{
		"message": "If that email address is registered, a new verification link has been sent.",
	})
}

func (h *Handler) me(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	if claims == nil {
		return shared.Unauthorized(c, "not authenticated")
	}

	user, err := meService(claims.UserID)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return shared.NotFound(c, "user not found")
		}
		return shared.InternalError(c, "failed to fetch user")
	}

	return shared.OK(c, user)
}
