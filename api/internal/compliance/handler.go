package compliance

import (
	"encoding/csv"
	"strconv"

	"github.com/labstack/echo/v4"
	"github.com/xa-lms/api/internal/audit"
	"github.com/xa-lms/api/internal/shared"
)

// Handler holds the compliance HTTP handlers.
type Handler struct{}

// NewHandler initialises the compliance module, creating the schema if needed.
func NewHandler() *Handler {
	fixSchema()
	return &Handler{}
}

// Register mounts all compliance routes under /api/v1/compliance.
func (h *Handler) Register(v1 *echo.Group) {
	g := v1.Group("/compliance", shared.RequireAuth(), shared.HybridPermission("compliance", "read", shared.RoleSuperAdmin, shared.RoleProgramManager))

	// Completion gates
	g.GET("/gates", h.listGates)
	g.POST("/gates", h.upsertGate, shared.HybridPermission("compliance", "manage", shared.RoleSuperAdmin, shared.RoleProgramManager))
	g.DELETE("/gates/:id", h.deleteGate, shared.HybridPermission("compliance", "manage", shared.RoleSuperAdmin, shared.RoleProgramManager))

	// Data retention policies
	g.GET("/retention", h.getRetention)
	g.POST("/retention", h.upsertRetention, shared.HybridPermission("compliance", "manage", shared.RoleSuperAdmin, shared.RoleProgramManager))

	// GDPR acknowledgement (any authenticated PM or superadmin with compliance:read)
	g.POST("/gdpr/ack", h.ackGDPR)

	// Attendance register — supports ?format=csv
	g.GET("/attendance", h.attendanceRegister)

	// Compliance-scoped audit log view — supports ?format=csv
	g.GET("/audit-logs", h.auditLogs)
}

// ── Completion Gates ─────────────────────────────────────────────────────────

func (h *Handler) listGates(c echo.Context) error {
	programID := c.QueryParam("program_id")
	if programID == "" {
		return shared.BadRequest(c, "VALIDATION_ERROR", "program_id is required", "program_id")
	}
	gates, err := listGates(programID)
	if err != nil {
		return shared.InternalError(c, "failed to list completion gates")
	}
	return shared.OK(c, gates)
}

func (h *Handler) upsertGate(c echo.Context) error {
	var req CreateGateRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "INVALID_BODY", "invalid request body", "")
	}
	orgID := c.QueryParam("org_id")
	if orgID == "" {
		return shared.BadRequest(c, "VALIDATION_ERROR", "org_id is required", "org_id")
	}
	dto, err := createOrUpdateGate(orgID, req)
	if err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", err.Error(), "")
	}
	audit.Log(c, audit.Event{
		Category: "compliance", Action: "compliance.gate.upsert", Severity: audit.SeveritySuccess,
		TargetType: "completion_gate", TargetID: dto.ID, OrgID: orgID,
		Detail: map[string]any{"program_id": dto.ProgramID, "activity_id": dto.ActivityID},
	})
	return shared.Created(c, dto)
}

func (h *Handler) deleteGate(c echo.Context) error {
	id := c.Param("id")
	if err := deleteGateSvc(id); err != nil {
		return shared.NotFound(c, "completion gate not found")
	}
	audit.Log(c, audit.Event{
		Category: "compliance", Action: "compliance.gate.delete", Severity: audit.SeverityWarning,
		TargetType: "completion_gate", TargetID: id,
	})
	return shared.NoContent(c)
}

// ── Data Retention ────────────────────────────────────────────────────────────

func (h *Handler) getRetention(c echo.Context) error {
	programID := c.QueryParam("program_id")
	if programID == "" {
		return shared.BadRequest(c, "VALIDATION_ERROR", "program_id is required", "program_id")
	}
	dto, err := getRetentionPolicySvc(programID)
	if err != nil {
		return shared.NotFound(c, "retention policy not found")
	}
	return shared.OK(c, dto)
}

func (h *Handler) upsertRetention(c echo.Context) error {
	var req UpsertRetentionRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "INVALID_BODY", "invalid request body", "")
	}
	orgID := c.QueryParam("org_id")
	if orgID == "" {
		return shared.BadRequest(c, "VALIDATION_ERROR", "org_id is required", "org_id")
	}
	claims := shared.ClaimsFrom(c)
	userID := ""
	if claims != nil {
		userID = claims.UserID
	}
	dto, err := createOrUpdateRetentionPolicy(orgID, userID, req)
	if err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", err.Error(), "")
	}
	audit.Log(c, audit.Event{
		Category: "compliance", Action: "compliance.retention.upsert", Severity: audit.SeveritySuccess,
		TargetType: "retention_policy", TargetID: dto.ID, OrgID: orgID,
		Detail: map[string]any{"program_id": dto.ProgramID, "submissions_days": dto.SubmissionsDays},
	})
	return shared.Created(c, dto)
}

// ── GDPR ──────────────────────────────────────────────────────────────────────

func (h *Handler) ackGDPR(c echo.Context) error {
	var req AckGDPRRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "INVALID_BODY", "invalid request body", "")
	}
	claims := shared.ClaimsFrom(c)
	if claims == nil {
		return shared.Unauthorized(c, "missing token")
	}
	if err := ackGDPR(claims.UserID, req); err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", err.Error(), "")
	}
	return shared.OK(c, map[string]string{"acknowledged": "true"})
}

// ── Attendance Register ───────────────────────────────────────────────────────

func (h *Handler) attendanceRegister(c echo.Context) error {
	cohortID := c.QueryParam("cohort_id")
	if cohortID == "" {
		return shared.BadRequest(c, "VALIDATION_ERROR", "cohort_id is required", "cohort_id")
	}

	register, err := getAttendanceRegisterSvc(cohortID)
	if err != nil {
		return shared.InternalError(c, "failed to build attendance register")
	}

	if c.QueryParam("format") == "csv" {
		c.Response().Header().Set("Content-Type", "text/csv")
		c.Response().Header().Set("Content-Disposition", `attachment; filename="attendance_register.csv"`)
		c.Response().WriteHeader(200)

		w := csv.NewWriter(c.Response())
		_ = w.Write([]string{"Learner Name", "Email", "Session", "Date", "Status", "Duration (mins)"})
		for _, row := range register.Rows {
			_ = w.Write([]string{
				row.LearnerName,
				row.LearnerEmail,
				row.SessionTitle,
				row.SessionDate,
				row.Status,
				strconv.Itoa(row.DurationMins),
			})
		}
		w.Flush()
		return nil
	}

	return shared.OK(c, register)
}

// ── Audit Logs ────────────────────────────────────────────────────────────────

func (h *Handler) auditLogs(c echo.Context) error {
	page, _ := strconv.Atoi(c.QueryParam("page"))
	limit, _ := strconv.Atoi(c.QueryParam("limit"))
	if page < 1 {
		page = 1
	}
	if limit < 1 {
		limit = 20
	}

	q := AuditQueryDTO{
		OrgID:    c.QueryParam("org_id"),
		UserID:   c.QueryParam("user_id"),
		Resource: c.QueryParam("resource"),
		Action:   c.QueryParam("action"),
		DateFrom: c.QueryParam("date_from"),
		DateTo:   c.QueryParam("date_to"),
		Page:     page,
		Limit:    limit,
	}

	logs, total, err := listAuditLogsSvc(q)
	if err != nil {
		return shared.InternalError(c, "failed to fetch audit logs")
	}

	if c.QueryParam("format") == "csv" {
		c.Response().Header().Set("Content-Type", "text/csv")
		c.Response().Header().Set("Content-Disposition", `attachment; filename="audit_logs.csv"`)
		c.Response().WriteHeader(200)

		w := csv.NewWriter(c.Response())
		_ = w.Write([]string{"ID", "User ID", "User Name", "Action", "Resource", "Resource ID", "IP Address", "Date"})
		for _, entry := range logs {
			_ = w.Write([]string{
				entry.ID,
				entry.UserID,
				entry.UserName,
				entry.Action,
				entry.Resource,
				entry.ResourceID,
				entry.IPAddress,
				entry.CreatedAt,
			})
		}
		w.Flush()
		return nil
	}

	return shared.OKList(c, logs, shared.Meta{
		Page:    page,
		PerPage: limit,
		Total:   total,
	})
}
