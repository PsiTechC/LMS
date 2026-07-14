package systemhealth

import (
	"strconv"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/xa-lms/api/internal/shared"
)

type Handler struct{}

// NewHandler initialises the module, creating its schema if needed.
func NewHandler() *Handler {
	fixSchema()
	return &Handler{}
}

// Register mounts the System Health read endpoints (superadmin-only).
func (h *Handler) Register(v1 *echo.Group) {
	g := v1.Group("/system-health", shared.RequireAuth(), shared.HybridPermission("system", "read", shared.RoleSuperAdmin))
	g.GET("", h.overview)
	g.GET("/trend", h.trend)
	g.GET("/endpoints", h.endpoints)

	// AI Platform Optimization Advisor — on-demand (LLM call), not run
	// automatically on every dashboard load.
	g.POST("/optimization-brief", h.optimizationBrief)
}

// trend returns the historical latency/error trend as 5-minute points
// (?window_mins=, default 1440 = 24h).
func (h *Handler) trend(c echo.Context) error {
	windowMins, _ := strconv.Atoi(c.QueryParam("window_mins"))
	data, err := trendService(windowMins)
	if err != nil {
		return shared.InternalError(c, "failed to fetch latency trend")
	}
	return shared.OK(c, data)
}

// overview returns dependency statuses, DB pool stats, uptime, and the rolling
// error-rate / latency summary.
func (h *Handler) overview(c echo.Context) error {
	data, err := overviewService()
	if err != nil {
		return shared.InternalError(c, "failed to build health overview")
	}
	return shared.OK(c, data)
}

// endpoints returns per-endpoint latency + error-rate aggregates over a window
// (?window_mins=, default 60; ?limit=, default 50).
func (h *Handler) endpoints(c echo.Context) error {
	windowMins, _ := strconv.Atoi(c.QueryParam("window_mins"))
	limit, _ := strconv.Atoi(c.QueryParam("limit"))

	data, err := endpointsService(windowMins, limit)
	if err != nil {
		return shared.InternalError(c, "failed to fetch endpoint metrics")
	}
	return shared.OK(c, data)
}

// optimizationBrief generates the AI Platform Optimization Advisor narrative
// — on demand (LLM call), triggered from the System Health page.
func (h *Handler) optimizationBrief(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	if claims == nil {
		return shared.Unauthorized(c, "invalid token")
	}
	uid, err := uuid.Parse(claims.UserID)
	if err != nil {
		return shared.Unauthorized(c, "invalid token")
	}
	brief, err := generatePlatformOptimizationBriefService(c.Request().Context(), uid, claims.Role)
	if err != nil {
		return shared.BadRequest(c, "AI_BRIEF_ERROR", err.Error(), "")
	}
	return shared.OK(c, map[string]string{"brief": brief})
}
