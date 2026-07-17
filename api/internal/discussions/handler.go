package discussions

import (
	"errors"
	"strings"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/xa-lms/api/internal/audit"
	"github.com/xa-lms/api/internal/shared"
)

type Handler struct{}

func NewHandler() *Handler {
	fixSchema()
	return &Handler{}
}

func (h *Handler) Register(v1 *echo.Group) {
	g := v1.Group("/discussions", shared.RequireAuth())

	// Threads
	g.GET("/threads", h.listThreads, shared.HybridPermission("discussions", "read", shared.RoleFaculty, shared.RoleParticipant))
	g.POST("/threads", h.createThread, shared.HybridPermission("discussions", "create", shared.RoleFaculty, shared.RoleParticipant))
	g.GET("/threads/:id", h.getThread, shared.HybridPermission("discussions", "read", shared.RoleFaculty, shared.RoleParticipant))
	g.DELETE("/threads/:id", h.deleteThread, shared.HybridPermission("discussions", "create", shared.RoleFaculty, shared.RoleParticipant))
	g.POST("/threads/:id/pin", h.pinThread, shared.HybridPermission("discussions", "manage", shared.RoleFaculty))

	// Replies
	g.POST("/threads/:id/replies", h.createReply, shared.HybridPermission("discussions", "create", shared.RoleFaculty, shared.RoleParticipant))
	g.DELETE("/threads/:id/replies/:replyId", h.deleteReply, shared.HybridPermission("discussions", "create", shared.RoleFaculty, shared.RoleParticipant))

	// Direct Messages — participant ⇄ program_manager and participant ⇄
	// participant only. Faculty is deliberately never in this resolver list,
	// so a faculty request never even reaches the handler (403 at middleware).
	g.GET("/dm/contacts", h.listDMContacts, shared.HybridPermission("discussions", "read", shared.RoleParticipant, shared.RoleProgramManager))
	g.GET("/dm", h.listDMConversations, shared.HybridPermission("discussions", "read", shared.RoleParticipant, shared.RoleProgramManager))
	g.GET("/dm/:userId", h.listDMs, shared.HybridPermission("discussions", "read", shared.RoleParticipant, shared.RoleProgramManager))
	g.POST("/dm", h.sendDM, shared.HybridPermission("discussions", "create", shared.RoleParticipant, shared.RoleProgramManager))
	g.PATCH("/dm/:userId/read", h.markDMsRead, shared.HybridPermission("discussions", "read", shared.RoleParticipant, shared.RoleProgramManager))

	// DM Groups — participant-created and participant-only membership.
	g.GET("/dm/groups", h.listMyDMGroups, shared.HybridPermission("discussions", "read", shared.RoleParticipant))
	g.POST("/dm/groups", h.createDMGroup, shared.HybridPermission("discussions", "create", shared.RoleParticipant))
	g.GET("/dm/groups/:groupId", h.getDMGroup, shared.HybridPermission("discussions", "read", shared.RoleParticipant))
	g.POST("/dm/groups/:groupId/invite", h.inviteToDMGroup, shared.HybridPermission("discussions", "create", shared.RoleParticipant))
	g.GET("/dm/groups/:groupId/messages", h.listGroupMessages, shared.HybridPermission("discussions", "read", shared.RoleParticipant))
	g.POST("/dm/groups/:groupId/messages", h.sendGroupMessage, shared.HybridPermission("discussions", "create", shared.RoleParticipant))

	// Announcements
	g.GET("/announcements", h.listAnnouncements, shared.HybridPermission("discussions", "read", shared.RoleFaculty, shared.RoleParticipant))
	g.POST("/announcements", h.createAnnouncement, shared.HybridPermission("discussions", "announce", shared.RoleFaculty))
	g.DELETE("/announcements/:id", h.deleteAnnouncement, shared.HybridPermission("discussions", "announce", shared.RoleFaculty))

	// Admin — cross-org discussions list + moderation (superadmin-only)
	g.GET("/admin", h.adminList, shared.HybridPermission("discussions", "admin", shared.RoleSuperAdmin))
	g.PATCH("/admin/threads/:id/flag", h.adminModerate, shared.HybridPermission("discussions", "admin", shared.RoleSuperAdmin))
}

// ── Admin handlers ───────────────────────────────────────────────────────────

// adminList returns all threads across orgs (or one org via ?org_id=).
func (h *Handler) adminList(c echo.Context) error {
	orgID := c.QueryParam("org_id")
	if orgID != "" {
		if _, err := uuid.Parse(orgID); err != nil {
			return shared.BadRequest(c, "VALIDATION_ERROR", "org_id must be a valid uuid", "org_id")
		}
	}
	rows, err := listAdminThreadsService(orgID)
	if err != nil {
		return shared.InternalError(c, "failed to fetch discussions")
	}
	return shared.OK(c, rows)
}

// adminModerate applies a moderation action (pin/unpin/flag/unflag/delete).
func (h *Handler) adminModerate(c echo.Context) error {
	id := c.Param("id")
	var req FlagThreadRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "invalid request body", "")
	}
	if req.Action == "" {
		return shared.BadRequest(c, "VALIDATION_ERROR", "action is required", "action")
	}
	if err := moderateThreadService(id, req.Action); err != nil {
		if errors.Is(err, ErrNotFound) {
			return shared.NotFound(c, "thread not found")
		}
		return shared.BadRequest(c, "VALIDATION_ERROR", err.Error(), "action")
	}
	audit.Log(c, audit.Event{
		Category:   "discussions",
		Action:     "thread.moderate",
		Severity:   audit.SeverityWarning,
		TargetType: "thread",
		TargetID:   id,
		Detail:     map[string]any{"action": req.Action},
	})
	return shared.NoContent(c)
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
	id := c.Param("id")
	if err := deleteThreadService(id, claims.UserID, claims.Role); err != nil {
		if errors.Is(err, ErrNotFound) {
			return shared.NotFound(c, "thread not found")
		}
		if err.Error() == "forbidden" {
			return shared.Forbidden(c)
		}
		return shared.InternalError(c, "failed to delete thread")
	}
	audit.Log(c, audit.Event{
		Category:   "discussions",
		Action:     "thread.delete",
		Severity:   audit.SeverityWarning,
		TargetType: "thread",
		TargetID:   id,
	})
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
	replyID := c.Param("replyId")
	if err := deleteReplyService(replyID, claims.UserID, claims.Role); err != nil {
		if errors.Is(err, ErrNotFound) {
			return shared.NotFound(c, "reply not found")
		}
		if err.Error() == "forbidden" {
			return shared.Forbidden(c)
		}
		return shared.InternalError(c, "failed to delete reply")
	}
	audit.Log(c, audit.Event{
		Category:   "discussions",
		Action:     "reply.delete",
		Severity:   audit.SeverityWarning,
		TargetType: "reply",
		TargetID:   replyID,
	})
	return shared.NoContent(c)
}

// ── Direct Message handlers ──────────────────────────────────────────────────

func (h *Handler) listDMContacts(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	programID := c.QueryParam("program_id")
	rows, err := listContactsService(claims.UserID, claims.Role, programID)
	if err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", err.Error(), "")
	}
	return shared.OK(c, rows)
}

func (h *Handler) listDMConversations(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	rows, err := listDMConversationsService(claims.UserID)
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
	if req.ProgramID == "" {
		return shared.BadRequest(c, "VALIDATION_ERROR", "program_id is required", "program_id")
	}
	if req.Body == "" {
		return shared.BadRequest(c, "VALIDATION_ERROR", "body is required", "body")
	}
	m, err := sendDMService(req, claims.UserID, claims.Email, claims.Role)
	if err != nil {
		if err.Error() == "forbidden: not the program manager of this program" ||
			err.Error() == "forbidden: recipient is not enrolled in this program" ||
			err.Error() == "forbidden: recipient is not the program manager or a peer in this program" ||
			err.Error() == "forbidden: only participants and program managers can send direct messages" {
			return shared.Forbidden(c)
		}
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

// ── DM Group handlers ────────────────────────────────────────────────────────

func (h *Handler) listMyDMGroups(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	rows, err := listMyDMGroupsService(claims.UserID)
	if err != nil {
		return shared.InternalError(c, "failed to fetch groups")
	}
	return shared.OK(c, rows)
}

func (h *Handler) createDMGroup(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	var req CreateDMGroupRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "invalid request body", "")
	}
	if req.ProgramID == "" {
		return shared.BadRequest(c, "VALIDATION_ERROR", "program_id is required", "program_id")
	}
	if req.Name == "" {
		return shared.BadRequest(c, "VALIDATION_ERROR", "name is required", "name")
	}
	g, err := createDMGroupService(req, claims.UserID, claims.Email, claims.Role)
	if err != nil {
		if strings.HasPrefix(err.Error(), "forbidden") {
			return shared.Forbidden(c)
		}
		return shared.BadRequest(c, "VALIDATION_ERROR", err.Error(), "")
	}
	return shared.Created(c, g)
}

func (h *Handler) getDMGroup(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	g, err := getDMGroupService(c.Param("groupId"), claims.UserID)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return shared.NotFound(c, "group not found")
		}
		if err.Error() == "forbidden" {
			return shared.Forbidden(c)
		}
		return shared.InternalError(c, "failed to fetch group")
	}
	return shared.OK(c, g)
}

func (h *Handler) inviteToDMGroup(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	var req struct {
		MemberIDs []string `json:"member_ids" validate:"required"`
	}
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "invalid request body", "")
	}
	if err := inviteToDMGroupService(c.Param("groupId"), claims.UserID, req.MemberIDs); err != nil {
		if errors.Is(err, ErrNotFound) {
			return shared.NotFound(c, "group not found")
		}
		if strings.HasPrefix(err.Error(), "forbidden") {
			return shared.Forbidden(c)
		}
		return shared.InternalError(c, "failed to invite members")
	}
	return shared.NoContent(c)
}

func (h *Handler) listGroupMessages(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	rows, err := listGroupMessagesService(c.Param("groupId"), claims.UserID)
	if err != nil {
		if err.Error() == "forbidden" {
			return shared.Forbidden(c)
		}
		return shared.InternalError(c, "failed to fetch messages")
	}
	return shared.OK(c, rows)
}

func (h *Handler) sendGroupMessage(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	var req SendGroupMessageRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "invalid request body", "")
	}
	if req.Body == "" {
		return shared.BadRequest(c, "VALIDATION_ERROR", "body is required", "body")
	}
	m, err := sendGroupMessageService(c.Param("groupId"), req, claims.UserID, claims.Email)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return shared.NotFound(c, "group not found")
		}
		if strings.HasPrefix(err.Error(), "forbidden") {
			return shared.Forbidden(c)
		}
		return shared.BadRequest(c, "VALIDATION_ERROR", err.Error(), "")
	}
	return shared.Created(c, m)
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
	id := c.Param("id")
	if err := deleteAnnouncementService(id); err != nil {
		if errors.Is(err, ErrNotFound) {
			return shared.NotFound(c, "announcement not found")
		}
		return shared.InternalError(c, "failed to delete announcement")
	}
	audit.Log(c, audit.Event{
		Category:   "discussions",
		Action:     "announcement.delete",
		Severity:   audit.SeverityWarning,
		TargetType: "announcement",
		TargetID:   id,
	})
	return shared.NoContent(c)
}
