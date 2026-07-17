package discussions

import (
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
)

// ── Admin: superadmin cross-org list + moderation ─────────────────────────────

// listAdminThreadsService assembles the superadmin discussions list. orgID "" =
// all orgs. status "" = all; otherwise flagged | pinned | active.
func listAdminThreadsService(orgID, status string, page, limit int) ([]AdminThreadDTO, int64, error) {
	offset := (page - 1) * limit
	rows, total, err := listAdminThreads(orgID, status, offset, limit)
	if err != nil {
		return nil, 0, err
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
	return out, total, nil
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
		ID:         m.ID.String(),
		SenderID:   m.SenderID.String(),
		SenderName: m.SenderName,
		Body:       m.Body,
		IsRead:     m.IsRead,
		CreatedAt:  m.CreatedAt,
	}
	if m.GroupID == nil {
		dto.RecipientID = m.RecipientID.String()
	}
	if m.CohortID != nil {
		dto.CohortID = m.CohortID.String()
	}
	if m.ProgramID != nil {
		dto.ProgramID = m.ProgramID.String()
	}
	if m.GroupID != nil {
		dto.GroupID = m.GroupID.String()
	}
	return dto
}

func toContactDTO(r dmContactRow) ContactDTO {
	dto := ContactDTO{
		UserID: r.UserID, Name: r.Name, Email: r.Email, Role: r.Role,
		ProgramID: r.ProgramID, Program: r.Program,
	}
	if r.AvatarURL != nil {
		dto.AvatarURL = *r.AvatarURL
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
//
// "No faculty in DMs" is enforced here, not just in the route middleware: the
// DM routes accept RoleParticipant and RoleProgramManager only (see
// handler.go) — faculty simply never reach these handlers — and every send
// additionally checks the sender/recipient actually share the program via
// sharesProgramAsParticipant / isProgramManagerOf below, so a participant
// can't DM an arbitrary UUID outside their own program.

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

func listDMConversationsService(userID string) ([]DirectMessageDTO, error) {
	rows, err := listDMConversations(userID)
	if err != nil {
		return nil, err
	}
	result := make([]DirectMessageDTO, 0, len(rows))
	for _, m := range rows {
		result = append(result, toDMDTO(m))
	}
	return result, nil
}

// sendDMService validates that sender and recipient are actually allowed to
// message each other within the given program before writing the row:
// participant→PM (recipient must be that program's PM), PM→participant
// (sender must be that program's PM and recipient enrolled in it), or
// participant→participant (both enrolled in the program).
func sendDMService(req SendDMRequest, senderID, senderName, senderRole string) (*DirectMessageDTO, error) {
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
	programUID, err := uuid.Parse(req.ProgramID)
	if err != nil {
		return nil, errors.New("invalid program_id")
	}

	if err := assertCanDM(req.ProgramID, senderID, senderRole, req.RecipientID); err != nil {
		return nil, err
	}

	m := &DirectMessage{
		SenderID:    senderUID,
		SenderName:  senderName,
		RecipientID: recipientUID,
		ProgramID:   &programUID,
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

// assertCanDM is the server-side "who can message whom" gate — mirrors the
// contact-list rule from listContactsService so a client can't just call the
// send endpoint with an arbitrary recipient_id to route around the UI.
func assertCanDM(programID, senderID, senderRole, recipientID string) error {
	if senderID == recipientID {
		return errors.New("cannot message yourself")
	}
	switch senderRole {
	case "program_manager":
		isPM, err := isProgramManagerOf(programID, senderID)
		if err != nil {
			return err
		}
		if !isPM {
			return errors.New("forbidden: not the program manager of this program")
		}
		isParticipant, err := isParticipantOf(programID, recipientID)
		if err != nil {
			return err
		}
		if !isParticipant {
			return errors.New("forbidden: recipient is not enrolled in this program")
		}
		return nil
	case "participant":
		isPM, err := isProgramManagerOf(programID, recipientID)
		if err != nil {
			return err
		}
		if isPM {
			return nil // participant → their program's PM
		}
		shares, err := sharesProgramAsParticipant(programID, senderID, recipientID)
		if err != nil {
			return err
		}
		if !shares {
			return errors.New("forbidden: recipient is not the program manager or a peer in this program")
		}
		return nil
	default:
		return errors.New("forbidden: only participants and program managers can send direct messages")
	}
}

func markDMsReadService(recipientID, senderID string) error {
	return markDMsRead(recipientID, senderID)
}

// ── Contact list service ─────────────────────────────────────────────────────

// listContactsService returns everyone role can DM: for a participant, the
// PM plus peer participants of EVERY program they're enrolled in (always
// aggregated across all their programs — DM is not scoped to a single
// active program, since two people can share more than one program and a
// per-program-scoped contact/read path was exactly what caused messages to
// go "missing" when each side had a different program active); for a PM,
// every participant enrolled in the given program. No faculty are ever
// returned. programID is accepted but ignored for participants (kept for
// callers that still pass their currently-active program — harmless no-op).
func listContactsService(userID, role, programID string) ([]ContactDTO, error) {
	switch role {
	case "participant":
		programIDs, err := listMyPrograms(userID)
		if err != nil {
			return nil, err
		}
		seen := make(map[string]bool) // de-dupe a person reachable via >1 shared program
		out := make([]ContactDTO, 0)
		for _, pid := range programIDs {
			pms, err := listProgramManagerContacts(pid)
			if err != nil {
				return nil, err
			}
			for _, r := range pms {
				if seen[r.UserID] {
					continue
				}
				seen[r.UserID] = true
				out = append(out, toContactDTO(r))
			}
			peers, err := listPeerParticipantContacts(pid, userID)
			if err != nil {
				return nil, err
			}
			for _, r := range peers {
				if seen[r.UserID] {
					continue
				}
				seen[r.UserID] = true
				out = append(out, toContactDTO(r))
			}
		}
		return out, nil
	case "program_manager":
		if programID == "" {
			return nil, errors.New("program_id is required")
		}
		isPM, err := isProgramManagerOf(programID, userID)
		if err != nil {
			return nil, err
		}
		if !isPM {
			return nil, errors.New("forbidden: not the program manager of this program")
		}
		peers, err := listPeerParticipantContacts(programID, userID)
		if err != nil {
			return nil, err
		}
		out := make([]ContactDTO, 0, len(peers))
		for _, r := range peers {
			out = append(out, toContactDTO(r))
		}
		return out, nil
	default:
		return nil, errors.New("forbidden: only participants and program managers have a DM contact list")
	}
}

// ── DM Group services (participant-created, participant-only members) ──────

func createDMGroupService(req CreateDMGroupRequest, creatorID, creatorName, creatorRole string) (*DMGroupDTO, error) {
	if creatorRole != "participant" {
		return nil, errors.New("forbidden: only participants can create groups")
	}
	if strings.TrimSpace(req.Name) == "" {
		return nil, errors.New("name is required")
	}
	programUID, err := uuid.Parse(req.ProgramID)
	if err != nil {
		return nil, errors.New("invalid program_id")
	}
	isParticipant, err := isParticipantOf(req.ProgramID, creatorID)
	if err != nil {
		return nil, err
	}
	if !isParticipant {
		return nil, errors.New("forbidden: you are not enrolled in this program")
	}
	creatorUID, err := uuid.Parse(creatorID)
	if err != nil {
		return nil, errors.New("invalid creator id")
	}

	g := &DMGroup{ProgramID: programUID, CreatedBy: creatorUID, Name: req.Name}
	if err := createDMGroup(g); err != nil {
		return nil, err
	}
	if err := addDMGroupMember(&DMGroupMember{GroupID: g.ID, UserID: creatorUID, UserName: creatorName}); err != nil {
		return nil, err
	}

	// Only peer participants of this program may be invited — faculty/PM/
	// anyone outside the program silently dropped rather than erroring the
	// whole create, so a bad ID in the batch doesn't block group creation.
	peers, err := listPeerParticipantContacts(req.ProgramID, creatorID)
	if err != nil {
		return nil, err
	}
	allowed := make(map[string]string, len(peers)) // userID -> name
	for _, p := range peers {
		allowed[p.UserID] = p.Name
	}
	for _, memberID := range req.MemberIDs {
		name, ok := allowed[memberID]
		if !ok {
			continue
		}
		memberUID, err := uuid.Parse(memberID)
		if err != nil {
			continue
		}
		_ = addDMGroupMember(&DMGroupMember{GroupID: g.ID, UserID: memberUID, UserName: name})
	}

	return getDMGroupService(g.ID.String(), creatorID)
}

func getDMGroupService(groupID, requesterID string) (*DMGroupDTO, error) {
	g, err := getDMGroupByID(groupID)
	if err != nil {
		return nil, err
	}
	isMember, err := isDMGroupMember(groupID, requesterID)
	if err != nil {
		return nil, err
	}
	if !isMember {
		return nil, errors.New("forbidden")
	}
	members, err := listDMGroupMembers(groupID)
	if err != nil {
		return nil, err
	}
	memberDTOs := make([]DMGroupMemberDTO, 0, len(members))
	for _, m := range members {
		memberDTOs = append(memberDTOs, DMGroupMemberDTO{UserID: m.UserID.String(), Name: m.UserName, JoinedAt: m.JoinedAt})
	}
	return &DMGroupDTO{
		ID: g.ID.String(), ProgramID: g.ProgramID.String(), Name: g.Name,
		CreatedBy: g.CreatedBy.String(), MemberCount: len(memberDTOs),
		Members: memberDTOs, CreatedAt: g.CreatedAt,
	}, nil
}

// inviteToDMGroupService lets any current member add a peer participant of
// the group's program — invites are participant-only, same rule as create.
func inviteToDMGroupService(groupID, inviterID string, newMemberIDs []string) error {
	g, err := getDMGroupByID(groupID)
	if err != nil {
		return err
	}
	isMember, err := isDMGroupMember(groupID, inviterID)
	if err != nil {
		return err
	}
	if !isMember {
		return errors.New("forbidden: not a member of this group")
	}
	peers, err := listPeerParticipantContacts(g.ProgramID.String(), inviterID)
	if err != nil {
		return err
	}
	allowed := make(map[string]string, len(peers))
	for _, p := range peers {
		allowed[p.UserID] = p.Name
	}
	for _, memberID := range newMemberIDs {
		name, ok := allowed[memberID]
		if !ok {
			continue // not a peer participant of this program — skip silently
		}
		already, err := isDMGroupMember(groupID, memberID)
		if err != nil || already {
			continue
		}
		memberUID, err := uuid.Parse(memberID)
		if err != nil {
			continue
		}
		_ = addDMGroupMember(&DMGroupMember{GroupID: g.ID, UserID: memberUID, UserName: name})
	}
	return nil
}

func listMyDMGroupsService(userID string) ([]DMGroupDTO, error) {
	rows, err := listMyDMGroups(userID)
	if err != nil {
		return nil, err
	}
	out := make([]DMGroupDTO, 0, len(rows))
	for _, r := range rows {
		out = append(out, DMGroupDTO{
			ID: r.ID, ProgramID: r.ProgramID, Program: r.Program, Name: r.Name,
			CreatedBy: r.CreatedBy, MemberCount: r.MemberCount,
			CreatedAt: func() time.Time {
				if r.LastMessageAt != nil {
					return *r.LastMessageAt
				}
				return time.Time{}
			}(),
		})
	}
	return out, nil
}

func listGroupMessagesService(groupID, requesterID string) ([]DirectMessageDTO, error) {
	isMember, err := isDMGroupMember(groupID, requesterID)
	if err != nil {
		return nil, err
	}
	if !isMember {
		return nil, errors.New("forbidden")
	}
	rows, err := listGroupMessages(groupID)
	if err != nil {
		return nil, err
	}
	out := make([]DirectMessageDTO, 0, len(rows))
	for _, m := range rows {
		out = append(out, toDMDTO(m))
	}
	return out, nil
}

func sendGroupMessageService(groupID string, req SendGroupMessageRequest, senderID, senderName string) (*DirectMessageDTO, error) {
	if strings.TrimSpace(req.Body) == "" {
		return nil, errors.New("body is required")
	}
	g, err := getDMGroupByID(groupID)
	if err != nil {
		return nil, err
	}
	isMember, err := isDMGroupMember(groupID, senderID)
	if err != nil {
		return nil, err
	}
	if !isMember {
		return nil, errors.New("forbidden: not a member of this group")
	}
	senderUID, err := uuid.Parse(senderID)
	if err != nil {
		return nil, errors.New("invalid sender_id")
	}
	m := &DirectMessage{
		SenderID: senderUID, SenderName: senderName,
		GroupID: &g.ID, ProgramID: &g.ProgramID, Body: req.Body,
	}
	if err := createDM(m); err != nil {
		return nil, err
	}
	dto := toDMDTO(*m)
	return &dto, nil
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
