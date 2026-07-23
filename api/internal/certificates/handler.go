package certificates

import (
	"errors"
	"log"
	"net/http"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/xa-lms/api/internal/shared"
)

type Handler struct{}

func NewHandler() *Handler { return &Handler{} }

func (h *Handler) Register(v1 *echo.Group) {
	g := v1.Group("/certificates", shared.RequireAuth())
	g.GET("", h.listMine, shared.HybridPermission("certificates", "read", shared.RoleSuperAdmin, shared.RoleProgramManager, shared.RoleFaculty, shared.RoleParticipant))
	g.GET("/:id/file", h.getFile, shared.HybridPermission("certificates", "read", shared.RoleSuperAdmin, shared.RoleProgramManager, shared.RoleFaculty, shared.RoleParticipant))
	g.POST("/:enrollment_id/issue", h.manualIssue, shared.HybridPermission("certificates", "manage", shared.RoleSuperAdmin, shared.RoleProgramManager))
	g.POST("/:id/revoke", h.revoke, shared.HybridPermission("certificates", "manage", shared.RoleSuperAdmin, shared.RoleProgramManager))

	// Public verification - unauthenticated, no RequireAuth group. Trust
	// comes from possessing the printed serial code, same public-endpoint
	// exception root CLAUDE.md documents for /v1/certificates/:code/verify.
	v1.GET("/certificates/:code/verify", h.verify)

	// Internal, loopback-only auto-issue trigger - called by
	// activityprogress/assessments/surveys after recomputing an enrollment's
	// completion_percent, via shared.InternalPost (see internal_bridge.go).
	// Still behind RequireAuth() - the caller mints a real short-lived JWT for
	// the original participant, this is not a separate unauthenticated surface.
	g.POST("/internal/:enrollment_id/auto-issue", h.autoIssue, shared.HybridPermission("certificates", "read", shared.RoleSuperAdmin, shared.RoleProgramManager, shared.RoleFaculty, shared.RoleParticipant))
}

func (h *Handler) listMine(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	list, err := ListMine(claims.UserID)
	if err != nil {
		log.Printf("[certificates] listMine failed user=%s: %v", claims.UserID, err)
		return shared.InternalError(c, "failed to load certificates")
	}
	return shared.OK(c, list)
}

func (h *Handler) getFile(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	cert, err := GetFile(c.Param("id"), claims.UserID, claims.Role)
	if err != nil {
		switch {
		case errors.Is(err, ErrNotFound):
			return shared.NotFound(c, "certificate not found")
		case errors.Is(err, ErrForbidden):
			return shared.Forbidden(c)
		default:
			log.Printf("[certificates] getFile failed id=%s: %v", c.Param("id"), err)
			return shared.InternalError(c, "failed to load certificate file")
		}
	}
	return c.Blob(http.StatusOK, cert.MimeType, cert.FileData)
}

func (h *Handler) manualIssue(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	issuerID, err := uuid.Parse(claims.UserID)
	if err != nil {
		return shared.Unauthorized(c, "invalid token")
	}
	cert, err := ManualIssue(c.Param("enrollment_id"), issuerID)
	if err != nil {
		switch {
		case errors.Is(err, ErrNotFound):
			return shared.NotFound(c, "enrollment not found")
		case errors.Is(err, ErrNoTemplate):
			return shared.UnprocessableEntity(c, "NO_CERTIFICATE_TEMPLATE", "this program has no certificate template attached", "")
		case errors.Is(err, ErrAlreadyIssued):
			return shared.Conflict(c, "a certificate has already been issued for this enrollment")
		default:
			log.Printf("[certificates] manualIssue failed enrollment=%s: %v", c.Param("enrollment_id"), err)
			return shared.InternalError(c, "failed to issue certificate")
		}
	}
	return shared.Created(c, toResponse(*cert))
}

func (h *Handler) revoke(c echo.Context) error {
	if err := Revoke(c.Param("id")); err != nil {
		if errors.Is(err, ErrNotFound) {
			return shared.NotFound(c, "certificate not found or already revoked")
		}
		log.Printf("[certificates] revoke failed id=%s: %v", c.Param("id"), err)
		return shared.InternalError(c, "failed to revoke certificate")
	}
	return shared.OK(c, map[string]bool{"revoked": true})
}

// autoIssue is the internal, loopback-only trigger called after a
// completion recompute might have just reached 100% (see hook doc comment
// in service.go's IssueForEnrollment). Silently no-ops (200, issued: false)
// when the enrollment isn't actually at 100% or the program has no
// certificate template - both are expected, frequent, non-error outcomes
// since this fires on every progress-affecting write, not just the one that
// crosses the threshold.
func (h *Handler) autoIssue(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	cert, err := IssueForEnrollment(c.Param("enrollment_id"), claims.UserID, claims.Role)
	if err != nil {
		switch {
		case errors.Is(err, ErrForbidden):
			return shared.Forbidden(c)
		case errors.Is(err, ErrNotFound):
			return shared.NotFound(c, "enrollment not found")
		default:
			log.Printf("[certificates] auto-issue failed enrollment=%s: %v", c.Param("enrollment_id"), err)
			return shared.InternalError(c, "failed to process certificate issuance")
		}
	}
	if cert == nil {
		return shared.OK(c, map[string]bool{"issued": false})
	}
	return shared.OK(c, toResponse(*cert))
}

// verify is intentionally unauthenticated - see Register().
func (h *Handler) verify(c echo.Context) error {
	dto, err := VerifyBySerial(c.Param("code"))
	if err != nil {
		log.Printf("[certificates] verify failed code=%s: %v", c.Param("code"), err)
		return shared.InternalError(c, "failed to verify certificate")
	}
	return shared.OK(c, dto)
}
