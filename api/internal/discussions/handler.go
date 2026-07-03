package discussions

import (
	"errors"

	"github.com/labstack/echo/v4"
	"github.com/xa-lms/api/internal/shared"
)

type Handler struct{}

func NewHandler() *Handler { return &Handler{} }

func (h *Handler) Register(v1 *echo.Group) {
	g := v1.Group("/discussions", shared.RequireAuth())

	// Threads
	g.GET("/threads", h.listThreads, shared.RequirePermission("discussions", "read"))
	g.POST("/threads", h.createThread, shared.RequirePermission("discussions", "create"))
	g.GET("/threads/:id", h.getThread, shared.RequirePermission("discussions", "read"))
	g.DELETE("/threads/:id", h.deleteThread, shared.RequirePermission("discussions", "create"))
	g.POST("/threads/:id/pin", h.pinThread, shared.RequirePermission("discussions", "manage"))

	// Replies
	g.POST("/threads/:id/replies", h.createReply, shared.RequirePermission("discussions", "create"))
	g.DELETE("/threads/:id/replies/:replyId", h.deleteReply, shared.RequirePermission("discussions", "create"))

	// Direct Messages
	g.GET("/dm", h.listDMConversations, shared.RequirePermission("discussions", "read"))
	g.GET("/dm/:userId", h.listDMs, shared.RequirePermission("discussions", "read"))
	g.POST("/dm", h.sendDM, shared.RequirePermission("discussions", "create"))
	g.PATCH("/dm/:userId/read", h.markDMsRead, shared.RequirePermission("discussions", "read"))

	// Announcements
	g.GET("/announcements", h.listAnnouncements, shared.RequirePermission("discussions", "read"))
	g.POST("/announcements", h.createAnnouncement, shared.RequirePermission("discussions", "announce"))
	g.DELETE("/announcements/:id", h.deleteAnnouncement, shared.RequirePermission("discussions", "announce"))
}

// ── Thread handlers ──────────────────────────────────────────────────────────

func (h *Handler) listThreads(c echo.Context) error {
	var q ListThreadsQuery
	if err := c.Bind(&q); err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "invalid query params", "")
	}
	if q.CohortID == "" && q.ProgramID == "" {
		return shared.BadRequest(c, "VALIDATION_ERROR", "cohort_id or program_id is required", "cohort_id")
	}
	if q.Page < 1 {
		q.Page = 1
	}
	if q.PerPage < 1 {
		q.PerPage = 20
	}
	rows, total, err := listThreadsService(q)
	if err != nil {
		return shared.InternalError(c, "failed to fetch threads")
	}
	return shared.OKList(c, rows, shared.Meta{Page: q.Page, PerPage: q.PerPage, Total: total})
}

func (h *Handler) createThread(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	var req CreateThreadRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "invalid request body", "")
	}
	if req.CohortID == "" {
		return shared.BadRequest(c, "VALIDATION_ERROR", "cohort_id is required", "cohort_id")
	}
	if req.ProgramID == "" {
		return shared.BadRequest(c, "VALIDATION_ERROR", "program_id is required", "program_id")
	}
	if req.Title == "" {
		return shared.BadRequest(c, "VALIDATION_ERROR", "title is required", "title")
	}
	if req.Body == "" {
		return shared.BadRequest(c, "VALIDATION_ERROR", "body is required", "body")
	}
	t, err := createThreadService(req, claims.UserID, claims.Email)
	if err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", err.Error(), "")
	}
	return shared.Created(c, t)
}

func (h *Handler) getThread(c echo.Context) error {
	t, err := getThreadService(c.Param("id"))
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return shared.NotFound(c, "thread not found")
		}
		return shared.InternalError(c, "failed to fetch thread")
	}
	return shared.OK(c, t)
}

func (h *Handler) deleteThread(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	if err := deleteThreadService(c.Param("id"), claims.UserID, claims.Role); err != nil {
		if errors.Is(err, ErrNotFound) {
			return shared.NotFound(c, "thread not found")
		}
		if err.Error() == "forbidden" {
			return shared.Forbidden(c)
		}
		return shared.InternalError(c, "failed to delete thread")
	}
	return shared.NoContent(c)
}

func (h *Handler) pinThread(c echo.Context) error {
	if err := pinThreadService(c.Param("id")); err != nil {
		if errors.Is(err, ErrNotFound) {
			return shared.NotFound(c, "thread not found")
		}
		return shared.InternalError(c, "failed to pin thread")
	}
	return shared.NoContent(c)
}

// ── Reply handlers ───────────────────────────────────────────────────────────

func (h *Handler) createReply(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	var req CreateReplyRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "invalid request body", "")
	}
	if req.Body == "" {
		return shared.BadRequest(c, "VALIDATION_ERROR", "body is required", "body")
	}
	r, err := createReplyService(c.Param("id"), req, claims.UserID, claims.Email)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return shared.NotFound(c, "thread not found")
		}
		return shared.BadRequest(c, "VALIDATION_ERROR", err.Error(), "")
	}
	return shared.Created(c, r)
}

func (h *Handler) deleteReply(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	if err := deleteReplyService(c.Param("replyId"), claims.UserID, claims.Role); err != nil {
		if errors.Is(err, ErrNotFound) {
			return shared.NotFound(c, "reply not found")
		}
		if err.Error() == "forbidden" {
			return shared.Forbidden(c)
		}
		return shared.InternalError(c, "failed to delete reply")
	}
	return shared.NoContent(c)
}

// ── Direct Message handlers ──────────────────────────────────────────────────

func (h *Handler) listDMConversations(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	cohortID := c.QueryParam("cohort_id")
	rows, err := listDMConversationsService(claims.UserID, cohortID)
	if err != nil {
		return shared.InternalError(c, "failed to fetch conversations")
	}
	return shared.OK(c, rows)
}

func (h *Handler) listDMs(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	rows, err := listDMsService(claims.UserID, c.Param("userId"))
	if err != nil {
		return shared.InternalError(c, "failed to fetch messages")
	}
	return shared.OK(c, rows)
}

func (h *Handler) sendDM(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	var req SendDMRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "invalid request body", "")
	}
	if req.RecipientID == "" {
		return shared.BadRequest(c, "VALIDATION_ERROR", "recipient_id is required", "recipient_id")
	}
	if req.Body == "" {
		return shared.BadRequest(c, "VALIDATION_ERROR", "body is required", "body")
	}
	m, err := sendDMService(req, claims.UserID, claims.Email)
	if err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", err.Error(), "")
	}
	return shared.Created(c, m)
}

func (h *Handler) markDMsRead(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	if err := markDMsReadService(claims.UserID, c.Param("userId")); err != nil {
		return shared.InternalError(c, "failed to mark messages as read")
	}
	return shared.NoContent(c)
}

// ── Announcement handlers ────────────────────────────────────────────────────

func (h *Handler) listAnnouncements(c echo.Context) error {
	cohortID := c.QueryParam("cohort_id")
	if cohortID == "" {
		return shared.BadRequest(c, "VALIDATION_ERROR", "cohort_id is required", "cohort_id")
	}
	rows, err := listAnnouncementsService(cohortID)
	if err != nil {
		return shared.InternalError(c, "failed to fetch announcements")
	}
	return shared.OK(c, rows)
}

func (h *Handler) createAnnouncement(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	var req CreateAnnouncementRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "invalid request body", "")
	}
	if req.CohortID == "" {
		return shared.BadRequest(c, "VALIDATION_ERROR", "cohort_id is required", "cohort_id")
	}
	if req.Title == "" {
		return shared.BadRequest(c, "VALIDATION_ERROR", "title is required", "title")
	}
	if req.Body == "" {
		return shared.BadRequest(c, "VALIDATION_ERROR", "body is required", "body")
	}
	a, err := createAnnouncementService(req, claims.UserID, claims.Email)
	if err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", err.Error(), "")
	}
	return shared.Created(c, a)
}

func (h *Handler) deleteAnnouncement(c echo.Context) error {
	if err := deleteAnnouncementService(c.Param("id")); err != nil {
		if errors.Is(err, ErrNotFound) {
			return shared.NotFound(c, "announcement not found")
		}
		return shared.InternalError(c, "failed to delete announcement")
	}
	return shared.NoContent(c)
}
