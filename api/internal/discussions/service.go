package discussions

import (
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
)

// ── Admin: superadmin cross-org list + moderation ─────────────────────────────

// listAdminThreadsService assembles the superadmin discussions list. orgID "" =
// all orgs. Status is derived: flagged > pinned > active.
func listAdminThreadsService(orgID string) ([]AdminThreadDTO, error) {
	rows, err := listAdminThreads(orgID)
	if err != nil {
		return nil, err
	}
	out := make([]AdminThreadDTO, 0, len(rows))
	for _, r := range rows {
		status := "active"
		if r.IsFlagged {
			status = "flagged"
		} else if r.IsPinned {
			status = "pinned"
		}
		out = append(out, AdminThreadDTO{
			ID: r.ID, Title: r.Title,
			Program: r.ProgramTitle, ProgramID: r.ProgramID,
			Org: r.OrgName, OrgID: r.OrgID,
			Author: r.Author, Replies: r.Replies, Views: r.Views,
			Status:       status,
			LastActivity: r.LastActivity.UTC().Format(time.RFC3339),
		})
	}
	return out, nil
}

// moderateThreadService applies a superadmin moderation action to a thread:
// pin/unpin, flag/unflag, or (soft) delete.
func moderateThreadService(id, action string) error {
	if _, err := uuid.Parse(id); err != nil {
		return errors.New("invalid thread id")
	}
	fields := map[string]any{"updated_at": time.Now()}
	switch action {
	case "pin":
		fields["is_pinned"] = true
	case "unpin":
		fields["is_pinned"] = false
	case "flag":
		fields["is_flagged"] = true
	case "unflag":
		fields["is_flagged"] = false
	case "delete":
		fields["is_deleted"] = true
	default:
		return errors.New("action must be one of: pin, unpin, flag, unflag, delete")
	}
	return updateThread(id, fields)
}

// ── Conversion helpers ───────────────────────────────────────────────────────

func toThreadDTO(t Thread, replies []ReplyDTO) ThreadDTO {
	return ThreadDTO{
		ID:         t.ID.String(),
		CohortID:   t.CohortID.String(),
		ProgramID:  t.ProgramID.String(),
		AuthorID:   t.AuthorID.String(),
		AuthorName: t.AuthorName,
		Title:      t.Title,
		Body:       t.Body,
		Category:   t.Category,
		Tags:       parseTags(t.Tags),
		IsPinned:   t.IsPinned,
		ReplyCount: t.ReplyCount,
		ViewCount:  t.ViewCount,
		CreatedAt:  t.CreatedAt,
		UpdatedAt:  t.UpdatedAt,
		Replies:    replies,
	}
}

func toReplyDTO(r ThreadReply) ReplyDTO {
	return ReplyDTO{
		ID:         r.ID.String(),
		ThreadID:   r.ThreadID.String(),
		AuthorID:   r.AuthorID.String(),
		AuthorName: r.AuthorName,
		Body:       r.Body,
		CreatedAt:  r.CreatedAt,
	}
}

func toDMDTO(m DirectMessage) DirectMessageDTO {
	dto := DirectMessageDTO{
		ID:          m.ID.String(),
		SenderID:    m.SenderID.String(),
		SenderName:  m.SenderName,
		RecipientID: m.RecipientID.String(),
		Body:        m.Body,
		IsRead:      m.IsRead,
		CreatedAt:   m.CreatedAt,
	}
	if m.CohortID != nil {
		dto.CohortID = m.CohortID.String()
	}
	return dto
}

func toAnnouncementDTO(a Announcement) AnnouncementDTO {
	return AnnouncementDTO{
		ID:         a.ID.String(),
		CohortID:   a.CohortID.String(),
		AuthorID:   a.AuthorID.String(),
		AuthorName: a.AuthorName,
		Title:      a.Title,
		Body:       a.Body,
		SendEmail:  a.SendEmail,
		CreatedAt:  a.CreatedAt,
	}
}

// ── Thread services ──────────────────────────────────────────────────────────

func listThreadsService(q ListThreadsQuery) ([]ThreadDTO, int64, error) {
	if q.Page < 1 {
		q.Page = 1
	}
	if q.PerPage < 1 || q.PerPage > 100 {
		q.PerPage = 20
	}
	offset := (q.Page - 1) * q.PerPage
	rows, total, err := listThreads(q.CohortID, q.ProgramID, q.Category, q.Search, offset, q.PerPage)
	if err != nil {
		return nil, 0, err
	}
	result := make([]ThreadDTO, 0, len(rows))
	for _, t := range rows {
		result = append(result, toThreadDTO(t, nil))
	}
	return result, total, nil
}

func getThreadService(id string) (*ThreadDTO, error) {
	t, err := getThreadByID(id)
	if err != nil {
		return nil, err
	}

	// Increment view count (best-effort — ignore error)
	_ = incrementViewCount(id)
	t.ViewCount++

	replyModels, err := listReplies(id)
	if err != nil {
		return nil, err
	}
	replies := make([]ReplyDTO, 0, len(replyModels))
	for _, r := range replyModels {
		replies = append(replies, toReplyDTO(r))
	}

	dto := toThreadDTO(*t, replies)
	return &dto, nil
}

func createThreadService(req CreateThreadRequest, authorID, authorName string) (*ThreadDTO, error) {
	if strings.TrimSpace(req.Title) == "" {
		return nil, errors.New("title is required")
	}
	if strings.TrimSpace(req.Body) == "" {
		return nil, errors.New("body is required")
	}
	cohortUID, err := uuid.Parse(req.CohortID)
	if err != nil {
		return nil, errors.New("invalid cohort_id")
	}
	programUID, err := uuid.Parse(req.ProgramID)
	if err != nil {
		return nil, errors.New("invalid program_id")
	}
	authorUID, err := uuid.Parse(authorID)
	if err != nil {
		return nil, errors.New("invalid author_id")
	}

	category := req.Category
	if category == "" {
		category = "discussion"
	}

	t := &Thread{
		CohortID:   cohortUID,
		ProgramID:  programUID,
		AuthorID:   authorUID,
		AuthorName: authorName,
		Title:      req.Title,
		Body:       req.Body,
		Category:   category,
		Tags:       marshalTags(req.Tags),
	}
	if err := createThread(t); err != nil {
		return nil, err
	}
	dto := toThreadDTO(*t, nil)
	return &dto, nil
}

func deleteThreadService(id, userID, role string) error {
	t, err := getThreadByID(id)
	if err != nil {
		return err
	}
	// Participants may only delete their own threads; privileged roles can delete any.
	if role == "participant" && t.AuthorID.String() != userID {
		return errors.New("forbidden")
	}
	return updateThread(id, map[string]any{"is_deleted": true})
}

func pinThreadService(id string) error {
	t, err := getThreadByID(id)
	if err != nil {
		return err
	}
	return updateThread(id, map[string]any{"is_pinned": !t.IsPinned})
}

// ── Reply services ───────────────────────────────────────────────────────────

func createReplyService(threadID string, req CreateReplyRequest, authorID, authorName string) (*ReplyDTO, error) {
	if strings.TrimSpace(req.Body) == "" {
		return nil, errors.New("body is required")
	}
	threadUID, err := uuid.Parse(threadID)
	if err != nil {
		return nil, errors.New("invalid thread_id")
	}
	authorUID, err := uuid.Parse(authorID)
	if err != nil {
		return nil, errors.New("invalid author_id")
	}

	// Ensure thread exists
	if _, err := getThreadByID(threadID); err != nil {
		return nil, err
	}

	r := &ThreadReply{
		ThreadID:   threadUID,
		AuthorID:   authorUID,
		AuthorName: authorName,
		Body:       req.Body,
	}
	if err := createReply(r); err != nil {
		return nil, err
	}
	// Best-effort reply count increment
	_ = incrementReplyCount(threadID)

	dto := toReplyDTO(*r)
	return &dto, nil
}

func deleteReplyService(replyID, userID, role string) error {
	r, err := getReplyByID(replyID)
	if err != nil {
		return err
	}
	if role == "participant" && r.AuthorID.String() != userID {
		return errors.New("forbidden")
	}
	return updateReply(replyID, map[string]any{"is_deleted": true})
}

// ── Direct Message services ──────────────────────────────────────────────────

func listDMsService(userID, otherUserID string) ([]DirectMessageDTO, error) {
	rows, err := listDMs(userID, otherUserID)
	if err != nil {
		return nil, err
	}
	result := make([]DirectMessageDTO, 0, len(rows))
	for _, m := range rows {
		result = append(result, toDMDTO(m))
	}
	return result, nil
}

func listDMConversationsService(userID, cohortID string) ([]DirectMessageDTO, error) {
	rows, err := listDMConversations(userID, cohortID)
	if err != nil {
		return nil, err
	}
	result := make([]DirectMessageDTO, 0, len(rows))
	for _, m := range rows {
		result = append(result, toDMDTO(m))
	}
	return result, nil
}

func sendDMService(req SendDMRequest, senderID, senderName string) (*DirectMessageDTO, error) {
	if strings.TrimSpace(req.Body) == "" {
		return nil, errors.New("body is required")
	}
	senderUID, err := uuid.Parse(senderID)
	if err != nil {
		return nil, errors.New("invalid sender_id")
	}
	recipientUID, err := uuid.Parse(req.RecipientID)
	if err != nil {
		return nil, errors.New("invalid recipient_id")
	}

	m := &DirectMessage{
		SenderID:    senderUID,
		SenderName:  senderName,
		RecipientID: recipientUID,
		Body:        req.Body,
	}
	if req.CohortID != "" {
		cohortUID, err := uuid.Parse(req.CohortID)
		if err != nil {
			return nil, errors.New("invalid cohort_id")
		}
		m.CohortID = &cohortUID
	}
	if err := createDM(m); err != nil {
		return nil, err
	}
	dto := toDMDTO(*m)
	return &dto, nil
}

func markDMsReadService(recipientID, senderID string) error {
	return markDMsRead(recipientID, senderID)
}

// ── Announcement services ────────────────────────────────────────────────────

func listAnnouncementsService(cohortID string) ([]AnnouncementDTO, error) {
	rows, err := listAnnouncements(cohortID)
	if err != nil {
		return nil, err
	}
	result := make([]AnnouncementDTO, 0, len(rows))
	for _, a := range rows {
		result = append(result, toAnnouncementDTO(a))
	}
	return result, nil
}

func createAnnouncementService(req CreateAnnouncementRequest, authorID, authorName string) (*AnnouncementDTO, error) {
	if strings.TrimSpace(req.Title) == "" {
		return nil, errors.New("title is required")
	}
	if strings.TrimSpace(req.Body) == "" {
		return nil, errors.New("body is required")
	}
	cohortUID, err := uuid.Parse(req.CohortID)
	if err != nil {
		return nil, errors.New("invalid cohort_id")
	}
	authorUID, err := uuid.Parse(authorID)
	if err != nil {
		return nil, errors.New("invalid author_id")
	}

	a := &Announcement{
		CohortID:   cohortUID,
		AuthorID:   authorUID,
		AuthorName: authorName,
		Title:      req.Title,
		Body:       req.Body,
		SendEmail:  req.SendEmail,
	}
	if err := createAnnouncement(a); err != nil {
		return nil, err
	}
	dto := toAnnouncementDTO(*a)
	return &dto, nil
}

func deleteAnnouncementService(id string) error {
	return deleteAnnouncement(id)
}
