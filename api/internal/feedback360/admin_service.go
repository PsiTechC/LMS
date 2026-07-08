package feedback360

import (
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/xa-lms/api/pkg/email"
)

// Admin-initiated 360° flow (Superadmin / Program Manager). Same access for both
// — the only difference is org resolution (superadmin selects an org; PM is
// auto-scoped to their own). No tiering between the two.

// ── Cycle lifecycle ───────────────────────────────────────────────

func createAdminCycleService(orgID, actorID uuid.UUID, actorRole, name string) (*AdminCycleDetailDTO, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return nil, fmt.Errorf("%w: name is required", ErrValidation)
	}
	now := time.Now()
	cycle := &FeedbackCycle{
		ID:                uuid.New(),
		OrgID:             orgID,
		CreatedBy:         actorID,
		Title:             name, // keep legacy Title populated for cross-view reads
		Name:              &name,
		CycleType:         "custom",
		Status:            "draft",
		InitiatedByUserID: &actorID,
		InitiatedByRole:   &actorRole,
		CreatedAt:         now,
		UpdatedAt:         now,
	}
	if err := createAdminCycle(cycle); err != nil {
		return nil, err
	}
	return buildAdminCycleDetail(cycle)
}

func updateAdminCycleService(orgID, cycleID uuid.UUID, req UpdateAdminCycleRequest) (*AdminCycleDetailDTO, error) {
	cycle, err := loadAdminCycle(orgID, cycleID)
	if err != nil {
		return nil, err
	}
	if isLocked(cycle.Status) {
		return nil, fmt.Errorf("%w: cycle is locked", ErrValidation)
	}
	updates := map[string]any{}
	if req.Name != nil {
		n := strings.TrimSpace(*req.Name)
		if n == "" {
			return nil, fmt.Errorf("%w: name cannot be empty", ErrValidation)
		}
		updates["name"] = n
		updates["title"] = n
	}
	// Move draft → configuring on first edit so the lifecycle reflects progress.
	if cycle.Status == "draft" {
		updates["status"] = "configuring"
	}
	if len(updates) > 0 {
		if err := updateAdminCycle(cycleID, updates); err != nil {
			return nil, err
		}
	}
	cycle, err = loadAdminCycle(orgID, cycleID)
	if err != nil {
		return nil, err
	}
	return buildAdminCycleDetail(cycle)
}

// saveQuorumService writes the per-cycle quorum and remembers it as the org's most
// recent default (a convenience pre-fill, not an enforced floor).
func saveQuorumService(orgID, cycleID uuid.UUID, q QuorumConfigDTO) (*AdminCycleDetailDTO, error) {
	cycle, err := loadAdminCycle(orgID, cycleID)
	if err != nil {
		return nil, err
	}
	if isLocked(cycle.Status) {
		return nil, fmt.Errorf("%w: cycle is locked", ErrValidation)
	}
	cfg := &FeedbackQuorumConfig{
		CycleID:      cycleID,
		SkipManager:  clampNonNeg(q.SkipManager),
		Manager:      clampNonNeg(q.Manager),
		Peer:         clampNonNeg(q.Peer),
		DirectReport: clampNonNeg(q.DirectReport),
		Others:       clampNonNeg(q.Others),
	}
	if err := upsertQuorumConfig(cfg); err != nil {
		return nil, err
	}
	_ = upsertOrgQuorumDefault(&FeedbackOrgQuorumDefault{
		OrgID:        orgID,
		SkipManager:  cfg.SkipManager,
		Manager:      cfg.Manager,
		Peer:         cfg.Peer,
		DirectReport: cfg.DirectReport,
		Others:       cfg.Others,
	})
	if cycle.Status == "draft" {
		_ = updateAdminCycle(cycleID, map[string]any{"status": "configuring"})
	}
	cycle, _ = loadAdminCycle(orgID, cycleID)
	return buildAdminCycleDetail(cycle)
}

// lockCycleService freezes the cycle: snapshots the chosen competencies/behaviors
// (with finalized question wording) and quorum, sets locked_at, flips status to
// 'locked'. Designed so a later "reopen" is a status flip, not a rebuild.
func lockCycleService(orgID, cycleID uuid.UUID, req LockCycleRequest) (*AdminCycleDetailDTO, error) {
	cycle, err := loadAdminCycle(orgID, cycleID)
	if err != nil {
		return nil, err
	}
	if isLocked(cycle.Status) {
		return nil, fmt.Errorf("%w: cycle already locked", ErrValidation)
	}
	if len(req.Competencies) == 0 {
		return nil, fmt.Errorf("%w: at least one competency is required", ErrValidation)
	}

	// Snapshot competency links + behavior wording.
	var links []FeedbackCycleCompetency
	var behaviors []FeedbackCycleBehavior
	order := 0
	for ci, comp := range req.Competencies {
		cid, perr := uuid.Parse(comp.CompetencyID)
		if perr != nil {
			return nil, fmt.Errorf("%w: invalid competency_id", ErrValidation)
		}
		links = append(links, FeedbackCycleCompetency{CycleID: cycleID, CompetencyID: cid, SortOrder: ci})
		for _, b := range comp.Behaviors {
			stmt := strings.TrimSpace(b.Statement)
			if stmt == "" {
				continue
			}
			q := strings.TrimSpace(b.QuestionText)
			if q == "" {
				q = stmt // fall back to the behavior text as the question
			}
			behaviors = append(behaviors, FeedbackCycleBehavior{
				ID:              uuid.New(),
				CycleID:         cycleID,
				CompetencyID:    cid,
				CompetencyTitle: comp.Title,
				Statement:       stmt,
				QuestionText:    q,
				Mandatory:       b.Mandatory,
				SortOrder:       order,
			})
			order++
		}
	}

	// Persist quorum snapshot.
	cfg := &FeedbackQuorumConfig{
		CycleID:      cycleID,
		SkipManager:  clampNonNeg(req.Quorum.SkipManager),
		Manager:      clampNonNeg(req.Quorum.Manager),
		Peer:         clampNonNeg(req.Quorum.Peer),
		DirectReport: clampNonNeg(req.Quorum.DirectReport),
		Others:       clampNonNeg(req.Quorum.Others),
	}
	if err := upsertQuorumConfig(cfg); err != nil {
		return nil, err
	}
	_ = upsertOrgQuorumDefault(&FeedbackOrgQuorumDefault{
		OrgID: orgID, SkipManager: cfg.SkipManager, Manager: cfg.Manager,
		Peer: cfg.Peer, DirectReport: cfg.DirectReport, Others: cfg.Others,
	})

	// Replace cycle competency links + behavior snapshot.
	if err := replaceCycleCompetencies(cycleID, links); err != nil {
		return nil, err
	}
	if err := replaceCycleBehaviors(cycleID, behaviors); err != nil {
		return nil, err
	}

	if err := updateAdminCycle(cycleID, map[string]any{
		"status":    "locked",
		"locked_at": time.Now(),
	}); err != nil {
		return nil, err
	}
	cycle, _ = loadAdminCycle(orgID, cycleID)
	return buildAdminCycleDetail(cycle)
}

// ── Dashboard ─────────────────────────────────────────────────────

func listAdminCyclesSummaryService(orgID uuid.UUID) ([]AdminCycleSummaryDTO, error) {
	cycles, err := listAdminCyclesForOrg(orgID)
	if err != nil {
		return nil, err
	}
	ids := make([]string, 0, len(cycles))
	for _, c := range cycles {
		ids = append(ids, c.ID.String())
	}
	counts, err := adminCycleCounts(ids)
	if err != nil {
		return nil, err
	}
	out := make([]AdminCycleSummaryDTO, 0, len(cycles))
	for i := range cycles {
		c := cycles[i]
		cc := counts[c.ID.String()]
		out = append(out, AdminCycleSummaryDTO{
			ID:              c.ID.String(),
			Name:            derefStr(c.Name, c.Title),
			Status:          c.Status,
			InitiatedByRole: derefStr(c.InitiatedByRole, ""),
			LockedAt:        fmtTimePtr(c.LockedAt),
			CreatedAt:       c.CreatedAt.UTC().Format(time.RFC3339),
			AssignedCount:   cc.Assigned,
			InvitedCount:    cc.Invited,
			CompletedCount:  cc.Completed,
		})
	}
	return out, nil
}

func getAdminCycleDetailService(orgID, cycleID uuid.UUID) (*AdminCycleDetailDTO, error) {
	cycle, err := loadAdminCycle(orgID, cycleID)
	if err != nil {
		return nil, err
	}
	return buildAdminCycleDetail(cycle)
}

// ── Assign / invite ───────────────────────────────────────────────

func assignParticipantsService(orgID, cycleID uuid.UUID, req AssignRequest) (int, error) {
	cycle, err := loadAdminCycle(orgID, cycleID)
	if err != nil {
		return 0, err
	}
	if cycle.Status != "locked" && cycle.Status != "active" {
		return 0, fmt.Errorf("%w: cycle must be locked before assigning", ErrValidation)
	}

	// Resolve the target user id set.
	var userIDs []string
	if req.SelectAll {
		rows, lerr := listAssignableParticipants(cycleID, orgID, req.ProgramID, req.CohortID, req.EnrollmentStatus, req.Search)
		if lerr != nil {
			return 0, lerr
		}
		for _, r := range rows {
			if !r.AlreadyInCycle {
				userIDs = append(userIDs, r.UserID)
			}
		}
	} else {
		userIDs = req.UserIDs
	}
	if len(userIDs) == 0 {
		return 0, nil
	}

	// Skip anyone already assigned (idempotent re-runs).
	existing, err := existingParticipantIDs(cycleID)
	if err != nil {
		return 0, err
	}
	snaps, err := resolveAssignSnapshots(orgID, userIDs)
	if err != nil {
		return 0, err
	}

	rows := make([]FeedbackCycleParticipant, 0, len(userIDs))
	now := time.Now()
	for _, uid := range userIDs {
		if existing[uid] {
			continue
		}
		pid, perr := uuid.Parse(uid)
		if perr != nil {
			continue
		}
		row := FeedbackCycleParticipant{
			ID:            uuid.New(),
			CycleID:       cycleID,
			ParticipantID: pid,
			Status:        "assigned",
			AddedAt:       now,
		}
		if s, ok := snaps[uid]; ok {
			row.ProgramID = parseUUIDPtr(s.ProgramID)
			row.CohortID = parseUUIDPtr(s.CohortID)
		}
		rows = append(rows, row)
	}
	if err := insertCycleParticipants(rows); err != nil {
		return 0, err
	}

	// Flip a locked cycle to active on first assignment.
	if cycle.Status == "locked" && len(rows) > 0 {
		_ = updateAdminCycle(cycleID, map[string]any{"status": "active"})
	}

	// Fire invites (in-app + email) for everyone not yet invited in this cycle.
	invited, err := inviteUninvited(cycle, nil)
	if err != nil {
		log.Printf("feedback_360: invite dispatch warn: %v", err)
	}
	_ = invited
	return len(rows), nil
}

// inviteParticipantsService (re-)sends invites to specific not-yet-invited rows,
// or all uninvited when ids empty. Never re-invites the already-invited.
func inviteParticipantsService(orgID, cycleID uuid.UUID, ids []string) (int, error) {
	cycle, err := loadAdminCycle(orgID, cycleID)
	if err != nil {
		return 0, err
	}
	return inviteUninvited(cycle, ids)
}

func inviteUninvited(cycle *FeedbackCycle, ids []string) (int, error) {
	targets, err := participantsToInvite(cycle.ID, ids)
	if err != nil {
		return 0, err
	}
	if len(targets) == 0 {
		return 0, nil
	}
	orgName := orgNameFor(cycle.OrgID)
	cycleName := derefStr(cycle.Name, cycle.Title)
	sentIDs := make([]string, 0, len(targets))
	for _, t := range targets {
		notifyAndEmailInvite(t, cycleName, orgName)
		sentIDs = append(sentIDs, t.ID)
	}
	if err := markParticipantsInvited(sentIDs); err != nil {
		return 0, err
	}
	return len(sentIDs), nil
}

func remindParticipantsService(orgID, cycleID uuid.UUID, req RemindRequest) (int, error) {
	cycle, err := loadAdminCycle(orgID, cycleID)
	if err != nil {
		return 0, err
	}
	targets, err := participantsToRemind(cycleID, req.ParticipantIDs, req.All)
	if err != nil {
		return 0, err
	}
	if len(targets) == 0 {
		return 0, nil
	}
	orgName := orgNameFor(cycle.OrgID)
	cycleName := derefStr(cycle.Name, cycle.Title)
	ids := make([]string, 0, len(targets))
	for _, t := range targets {
		notifyAndEmailReminder(t, cycleName, orgName)
		ids = append(ids, t.ID)
	}
	if err := markParticipantsReminded(ids); err != nil {
		return 0, err
	}
	return len(ids), nil
}

func listCycleParticipantsService(orgID, cycleID uuid.UUID) ([]CycleParticipantDTO, error) {
	if _, err := loadAdminCycle(orgID, cycleID); err != nil {
		return nil, err
	}
	return listCycleParticipants(cycleID)
}

// ── Assign candidate listing + filter options ─────────────────────

func listAssignableService(orgID, cycleID uuid.UUID, programID, cohortID, enrollStatus, search string) ([]AssignableParticipantDTO, error) {
	rows, err := listAssignableParticipants(cycleID, orgID, programID, cohortID, enrollStatus, search)
	if err != nil {
		return nil, err
	}
	if rows == nil {
		rows = []AssignableParticipantDTO{}
	}
	return rows, nil
}

func listProgramOptionsService(orgID uuid.UUID) ([]ProgramOptionDTO, error) {
	rows, err := listOrgProgramOptions(orgID)
	if err != nil {
		return nil, err
	}
	if rows == nil {
		rows = []ProgramOptionDTO{}
	}
	return rows, nil
}

func listCohortOptionsService(orgID uuid.UUID, programID string) ([]CohortOptionDTO, error) {
	rows, err := listProgramCohortOptions(orgID, programID)
	if err != nil {
		return nil, err
	}
	if rows == nil {
		rows = []CohortOptionDTO{}
	}
	return rows, nil
}

// orgQuorumDefaultService returns the org's remembered quorum values (or the
// system defaults) to pre-fill a new cycle's quorum step.
func orgQuorumDefaultService(orgID uuid.UUID) QuorumConfigDTO {
	d, err := getOrgQuorumDefault(orgID)
	if err != nil || d == nil {
		return QuorumConfigDTO{SkipManager: 0, Manager: 1, Peer: 2, DirectReport: 1, Others: 0}
	}
	return QuorumConfigDTO{
		SkipManager: d.SkipManager, Manager: d.Manager, Peer: d.Peer,
		DirectReport: d.DirectReport, Others: d.Others,
	}
}

// ── DTO assembly ──────────────────────────────────────────────────

// buildAdminCycleDetail assembles the full config view. Behaviors come from the
// frozen snapshot once locked, otherwise from the live org framework.
func buildAdminCycleDetail(cycle *FeedbackCycle) (*AdminCycleDetailDTO, error) {
	dto := &AdminCycleDetailDTO{
		ID:              cycle.ID.String(),
		Name:            derefStr(cycle.Name, cycle.Title),
		OrgID:           cycle.OrgID.String(),
		Status:          cycle.Status,
		InitiatedByRole: derefStr(cycle.InitiatedByRole, ""),
		LockedAt:        fmtTimePtr(cycle.LockedAt),
		CreatedAt:       cycle.CreatedAt.UTC().Format(time.RFC3339),
		Competencies:    []CycleCompetencyDTO{},
	}

	// Quorum: cycle config if present, else org default.
	if q, err := getQuorumConfig(cycle.ID); err == nil && q != nil {
		dto.Quorum = QuorumConfigDTO{
			SkipManager: q.SkipManager, Manager: q.Manager, Peer: q.Peer,
			DirectReport: q.DirectReport, Others: q.Others,
		}
	} else {
		dto.Quorum = orgQuorumDefaultService(cycle.OrgID)
	}

	if isLocked(cycle.Status) {
		rows, err := listCycleBehaviors(cycle.ID)
		if err != nil {
			return nil, err
		}
		dto.Competencies = groupSnapshotBehaviors(rows)
	} else {
		rows, err := liveOrgFramework(cycle.OrgID)
		if err != nil {
			return nil, err
		}
		dto.Competencies = groupLiveFramework(rows)
	}
	return dto, nil
}

func groupSnapshotBehaviors(rows []FeedbackCycleBehavior) []CycleCompetencyDTO {
	order := []string{}
	byComp := map[string]*CycleCompetencyDTO{}
	for _, r := range rows {
		cid := r.CompetencyID.String()
		if _, ok := byComp[cid]; !ok {
			byComp[cid] = &CycleCompetencyDTO{CompetencyID: cid, Title: r.CompetencyTitle, Behaviors: []CycleBehaviorDTO{}}
			order = append(order, cid)
		}
		byComp[cid].Behaviors = append(byComp[cid].Behaviors, CycleBehaviorDTO{
			Statement: r.Statement, QuestionText: r.QuestionText, Mandatory: r.Mandatory, SortOrder: r.SortOrder,
		})
	}
	out := make([]CycleCompetencyDTO, 0, len(order))
	for _, cid := range order {
		out = append(out, *byComp[cid])
	}
	return out
}

func groupLiveFramework(rows []frameworkBehaviorRow) []CycleCompetencyDTO {
	order := []string{}
	byComp := map[string]*CycleCompetencyDTO{}
	for _, r := range rows {
		if _, ok := byComp[r.CompetencyID]; !ok {
			byComp[r.CompetencyID] = &CycleCompetencyDTO{CompetencyID: r.CompetencyID, Title: r.CompetencyTitle, Behaviors: []CycleBehaviorDTO{}}
			order = append(order, r.CompetencyID)
		}
		if r.BehaviorID == "" {
			continue // competency with no behaviors yet
		}
		q := ""
		if r.QuestionText != nil {
			q = *r.QuestionText
		}
		// use_statement mirrors the statement as the question in the resolved view.
		if (r.UseStatement != nil && *r.UseStatement) || q == "" {
			q = r.Statement
		}
		mandatory := r.Mandatory == nil || *r.Mandatory // default true
		byComp[r.CompetencyID].Behaviors = append(byComp[r.CompetencyID].Behaviors, CycleBehaviorDTO{
			Statement: r.Statement, QuestionText: q, Mandatory: mandatory, SortOrder: r.SortOrder,
		})
	}
	out := make([]CycleCompetencyDTO, 0, len(order))
	for _, cid := range order {
		out = append(out, *byComp[cid])
	}
	return out
}

// ── Notifications + email ─────────────────────────────────────────

// notifyAndEmailInvite inserts the in-app notification synchronously (fast, so
// tracking reflects immediately) and dispatches the SMTP email in the background
// so a bulk assign doesn't block the HTTP request on N sequential mail sends.
func notifyAndEmailInvite(t inviteTarget, cycleName, orgName string) {
	title := "360° Feedback: you've been invited"
	body := fmt.Sprintf("You've been added to the 360° feedback cycle \"%s\". Open the 360° Feedback tab to choose your reviewers and begin.", cycleName)
	_ = insertInAppNotification(t.UserID, title, body)
	go func() {
		html := email.Feedback360InviteTemplate(t.Name, cycleName, orgName)
		if err := email.Send(t.Email, "You've been invited to a 360° Feedback cycle", html); err != nil {
			log.Printf("feedback_360: invite email to %s failed: %v", t.Email, err)
		}
	}()
}

func notifyAndEmailReminder(t inviteTarget, cycleName, orgName string) {
	title := "360° Feedback: reminder"
	body := fmt.Sprintf("Reminder: your 360° feedback cycle \"%s\" is still open. Please complete your reviewer setup and responses.", cycleName)
	_ = insertInAppNotification(t.UserID, title, body)
	go func() {
		html := email.Feedback360ReminderTemplate(t.Name, cycleName, orgName)
		if err := email.Send(t.Email, "Reminder: complete your 360° Feedback", html); err != nil {
			log.Printf("feedback_360: reminder email to %s failed: %v", t.Email, err)
		}
	}()
}

// ── helpers ───────────────────────────────────────────────────────

func isLocked(status string) bool {
	switch status {
	case "locked", "active", "completed":
		return true
	}
	return false
}

func clampNonNeg(v int) int {
	if v < 0 {
		return 0
	}
	return v
}

func derefStr(p *string, fallback string) string {
	if p != nil && *p != "" {
		return *p
	}
	return fallback
}

func parseUUIDPtr(s *string) *uuid.UUID {
	if s == nil || *s == "" {
		return nil
	}
	id, err := uuid.Parse(*s)
	if err != nil {
		return nil
	}
	return &id
}
