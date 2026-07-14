package feedback360

import (
	"errors"
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

// ── Org 360° configuration ────────────────────────────────────────
//
// An organization has exactly ONE 360° configuration — there is no cycle
// concept. getOrCreateOrgConfigService returns it, creating an empty draft the
// first time an admin opens the screen. A DB unique index enforces the
// invariant even under concurrent first-opens.

func getOrCreateOrgConfigService(orgID, actorID uuid.UUID, actorRole string) (*AdminCycleDetailDTO, error) {
	cfg, err := loadOrgConfig(orgID)
	if err == nil {
		return buildAdminCycleDetail(cfg)
	}
	if !errors.Is(err, ErrNotFound) {
		return nil, err
	}

	now := time.Now()
	title := "360° Feedback"
	cfg = &FeedbackCycle{
		ID:                uuid.New(),
		OrgID:             orgID,
		CreatedBy:         actorID,
		Title:             title,
		Name:              &title,
		CycleType:         "custom",
		Status:            "draft",
		InitiatedByUserID: &actorID,
		InitiatedByRole:   &actorRole,
		CreatedAt:         now,
		UpdatedAt:         now,
	}
	if err := createAdminCycle(cfg); err != nil {
		// Lost a race against a concurrent first-open: the unique index rejected
		// the insert, so the other request already created it. Read it back.
		if existing, rerr := loadOrgConfig(orgID); rerr == nil {
			return buildAdminCycleDetail(existing)
		}
		return nil, err
	}
	return buildAdminCycleDetail(cfg)
}


// quorumFromDTO validates and normalizes a quorum payload. A named "Others"
// category is required once its minimum is >= 1 — an unnamed one would show
// participants a meaningless "Others" bucket.
func quorumFromDTO(cycleID uuid.UUID, q QuorumConfigDTO) (*FeedbackQuorumConfig, error) {
	cfg := &FeedbackQuorumConfig{
		CycleID:      cycleID,
		SkipManager:  clampNonNeg(q.SkipManager),
		Manager:      clampNonNeg(q.Manager),
		Peer:         clampNonNeg(q.Peer),
		DirectReport: clampNonNeg(q.DirectReport),
		Others:       clampNonNeg(q.Others),
	}
	label := strings.TrimSpace(q.OthersLabel)
	if cfg.Others >= 1 {
		if label == "" {
			return nil, fmt.Errorf("%w: name the Others category (e.g. \"Customers\")", ErrValidation)
		}
		cfg.OthersLabel = &label
	}
	return cfg, nil
}

// saveQuorumService writes the org config's quorum.
func saveQuorumService(orgID uuid.UUID, q QuorumConfigDTO) (*AdminCycleDetailDTO, error) {
	cycle, err := loadOrgConfig(orgID)
	if err != nil {
		return nil, err
	}
	if isLocked(cycle.Status) {
		return nil, fmt.Errorf("%w: the 360° configuration is locked", ErrValidation)
	}
	cycleID := cycle.ID
	cfg, verr := quorumFromDTO(cycleID, q)
	if verr != nil {
		return nil, verr
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
		OthersLabel:  cfg.OthersLabel,
	})
	if cycle.Status == "draft" {
		_ = updateAdminCycle(cycleID, map[string]any{"status": "configuring"})
	}
	cycle, _ = loadOrgConfig(orgID)
	return buildAdminCycleDetail(cycle)
}

// defaultOpenQuestions are the three standard 360° free-text prompts used when an
// org has no remembered set yet. The admin can reword any of them in the wizard.
func defaultOpenQuestions() []OpenQuestionDTO {
	return []OpenQuestionDTO{
		{Prompt: "What should this person START doing to be more effective?", Mandatory: true, SortOrder: 0},
		{Prompt: "What should this person STOP doing that limits their effectiveness?", Mandatory: true, SortOrder: 1},
		{Prompt: "What should this person CONTINUE doing because it works well?", Mandatory: true, SortOrder: 2},
	}
}

// orgOpenQuestionsService returns the org's remembered prompts, else the defaults.
func orgOpenQuestionsService(orgID uuid.UUID) []OpenQuestionDTO {
	rows, err := listOrgOpenQuestionDefaults(orgID)
	if err != nil || len(rows) == 0 {
		return defaultOpenQuestions()
	}
	return rows
}

// saveOpenQuestionsService writes the org config's three open-ended questions.
// Editable until the configuration is locked.
func saveOpenQuestionsService(orgID uuid.UUID, qs []OpenQuestionDTO) (*AdminCycleDetailDTO, error) {
	cycle, err := loadOrgConfig(orgID)
	if err != nil {
		return nil, err
	}
	if isLocked(cycle.Status) {
		return nil, fmt.Errorf("%w: the 360° configuration is locked", ErrValidation)
	}
	if err := replaceCycleOpenQuestions(cycle.ID, qs); err != nil {
		return nil, err
	}
	_ = upsertOrgOpenQuestionDefaults(orgID, qs)
	if cycle.Status == "draft" {
		_ = updateAdminCycle(cycle.ID, map[string]any{"status": "configuring"})
	}
	cycle, _ = loadOrgConfig(orgID)
	return buildAdminCycleDetail(cycle)
}

// lockCycleService freezes the org's 360° configuration: snapshots the chosen
// competencies and their behavior statements, the open-ended questions, and the
// quorum; sets locked_at and flips status to 'locked'. Designed so a later
// "reopen" is a status flip, not a rebuild.
func lockCycleService(orgID uuid.UUID, req LockCycleRequest) (*AdminCycleDetailDTO, error) {
	cycle, err := loadOrgConfig(orgID)
	if err != nil {
		return nil, err
	}
	if isLocked(cycle.Status) {
		return nil, fmt.Errorf("%w: the 360° configuration is already locked", ErrValidation)
	}
	if len(req.Competencies) == 0 {
		return nil, fmt.Errorf("%w: at least one competency is required", ErrValidation)
	}
	cycleID := cycle.ID

	// Snapshot competency links + behavior statements.
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
			behaviors = append(behaviors, FeedbackCycleBehavior{
				ID:              uuid.New(),
				CycleID:         cycleID,
				CompetencyID:    cid,
				CompetencyTitle: comp.Title,
				Statement:       stmt,
				Mandatory:       b.Mandatory,
				SortOrder:       order,
			})
			order++
		}
	}

	// Persist quorum snapshot.
	cfg, verr := quorumFromDTO(cycleID, req.Quorum)
	if verr != nil {
		return nil, verr
	}
	if err := upsertQuorumConfig(cfg); err != nil {
		return nil, err
	}
	_ = upsertOrgQuorumDefault(&FeedbackOrgQuorumDefault{
		OrgID: orgID, SkipManager: cfg.SkipManager, Manager: cfg.Manager,
		Peer: cfg.Peer, DirectReport: cfg.DirectReport, Others: cfg.Others,
		OthersLabel: cfg.OthersLabel,
	})

	// Replace cycle competency links + behavior snapshot.
	if err := replaceCycleCompetencies(cycleID, links); err != nil {
		return nil, err
	}
	if err := replaceCycleBehaviors(cycleID, behaviors); err != nil {
		return nil, err
	}

	// Freeze the cycle-level open-ended questions (fall back to the org's set if
	// the client didn't send them, so a locked cycle always carries all three).
	openQs := req.OpenQuestions
	if len(openQs) == 0 {
		openQs = orgOpenQuestionsService(orgID)
	}
	if err := replaceCycleOpenQuestions(cycleID, openQs); err != nil {
		return nil, err
	}
	_ = upsertOrgOpenQuestionDefaults(orgID, openQs)

	if err := updateAdminCycle(cycleID, map[string]any{
		"status":    "locked",
		"locked_at": time.Now(),
	}); err != nil {
		return nil, err
	}
	cycle, _ = loadOrgConfig(orgID)
	return buildAdminCycleDetail(cycle)
}

// reopenCycleService unlocks a locked/active cycle back to 'configuring' so an
// admin (Superadmin or Program Manager — same access) can edit its framework,
// open questions, and quorum, then lock it again. The frozen snapshot stays in
// place until the next lock overwrites it, and assigned participants are kept.
// A completed cycle is not reopenable — its responses are already final.
func reopenCycleService(orgID uuid.UUID) (*AdminCycleDetailDTO, error) {
	cycle, err := loadOrgConfig(orgID)
	if err != nil {
		return nil, err
	}
	if cycle.Status == "completed" {
		return nil, fmt.Errorf("%w: a completed cycle cannot be reopened", ErrValidation)
	}
	if !isLocked(cycle.Status) {
		return nil, fmt.Errorf("%w: cycle is not locked", ErrValidation)
	}
	if err := updateAdminCycle(cycle.ID, map[string]any{
		"status":    "configuring",
		"locked_at": nil,
	}); err != nil {
		return nil, err
	}
	cycle, _ = loadOrgConfig(orgID)
	return buildAdminCycleDetail(cycle)
}

func getAdminCycleDetailService(orgID uuid.UUID) (*AdminCycleDetailDTO, error) {
	cycle, err := loadOrgConfig(orgID)
	if err != nil {
		return nil, err
	}
	return buildAdminCycleDetail(cycle)
}

// ── Assign / invite ───────────────────────────────────────────────

func assignParticipantsService(orgID uuid.UUID, req AssignRequest) (int, error) {
	cycle, err := loadOrgConfig(orgID)
	if err != nil {
		return 0, err
	}
	cycleID := cycle.ID
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
	selfRaters := make([]FeedbackRater, 0, len(userIDs))
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

		// Seed this participant's self rater so they can rate themselves — the
		// legacy self-initiated flow does this in createCycleService; the admin
		// flow has no equivalent single-participant hook, so it happens here.
		selfRaters = append(selfRaters, FeedbackRater{
			ID:            uuid.New(),
			CycleID:       cycleID,
			ParticipantID: &pid,
			Name:          "Self",
			Email:         "",
			Relationship:  "self",
			Status:        "pending",
			InviteToken:   uuid.New(),
			CreatedAt:     now,
		})
	}
	if err := insertCycleParticipants(rows); err != nil {
		return 0, err
	}
	if err := createRaters(selfRaters); err != nil {
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
func inviteParticipantsService(orgID uuid.UUID, ids []string) (int, error) {
	cycle, err := loadOrgConfig(orgID)
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

func remindParticipantsService(orgID uuid.UUID, req RemindRequest) (int, error) {
	cycle, err := loadOrgConfig(orgID)
	if err != nil {
		return 0, err
	}
	cycleID := cycle.ID
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

func listCycleParticipantsService(orgID uuid.UUID) ([]CycleParticipantDTO, error) {
	cfg, err := loadOrgConfig(orgID)
	if err != nil {
		return nil, err
	}
	return listCycleParticipants(cfg.ID)
}

// ── Assign candidate listing + filter options ─────────────────────

func listAssignableService(orgID uuid.UUID, programID, cohortID, enrollStatus, search string) ([]AssignableParticipantDTO, error) {
	cfg, err := loadOrgConfig(orgID)
	if err != nil {
		return nil, err
	}
	rows, err := listAssignableParticipants(cfg.ID, orgID, programID, cohortID, enrollStatus, search)
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
		OthersLabel: derefStr(d.OthersLabel, ""),
	}
}

// ── DTO assembly ──────────────────────────────────────────────────

// buildAdminCycleDetail assembles the full config view. Behaviors come from the
// frozen snapshot once locked, otherwise from the live org framework.
func buildAdminCycleDetail(cycle *FeedbackCycle) (*AdminCycleDetailDTO, error) {
	dto := &AdminCycleDetailDTO{
		ID:              cycle.ID.String(),
		OrgID:           cycle.OrgID.String(),
		Status:          cycle.Status,
		InitiatedByRole: derefStr(cycle.InitiatedByRole, ""),
		LockedAt:        fmtTimePtr(cycle.LockedAt),
		CreatedAt:       cycle.CreatedAt.UTC().Format(time.RFC3339),
		Competencies:    []CycleCompetencyDTO{},
	}
	if counts, err := adminCycleCounts([]string{cycle.ID.String()}); err == nil {
		if cc, ok := counts[cycle.ID.String()]; ok {
			dto.AssignedCount, dto.InvitedCount, dto.CompletedCount = cc.Assigned, cc.Invited, cc.Completed
		}
	}

	// Quorum: cycle config if present, else org default.
	if q, err := getQuorumConfig(cycle.ID); err == nil && q != nil {
		dto.Quorum = QuorumConfigDTO{
			SkipManager: q.SkipManager, Manager: q.Manager, Peer: q.Peer,
			DirectReport: q.DirectReport, Others: q.Others,
			OthersLabel: derefStr(q.OthersLabel, ""),
		}
	} else {
		dto.Quorum = orgQuorumDefaultService(cycle.OrgID)
	}

	// Prefer the frozen snapshot whenever one exists — a locked cycle must show
	// what it froze, and a reopened cycle must show what it had locked (not the
	// org's live framework, which may have drifted since).
	snap, err := listCycleBehaviors(cycle.ID)
	if err != nil {
		return nil, err
	}
	if len(snap) > 0 {
		dto.Competencies = groupSnapshotBehaviors(snap)
	} else {
		rows, err := liveOrgFramework(cycle.OrgID)
		if err != nil {
			return nil, err
		}
		dto.Competencies = groupLiveFramework(rows)
	}

	// A snapshot only ever exists because a lock created it, so its presence (or
	// a currently-locked status) means the cycle completed Review & Lock once.
	dto.WasLocked = isLocked(cycle.Status) || len(snap) > 0

	// Open questions: the cycle's own set once saved, else the org's pre-fill.
	openQs, err := listCycleOpenQuestions(cycle.ID)
	if err != nil {
		return nil, err
	}
	if len(openQs) == 0 {
		openQs = orgOpenQuestionsService(cycle.OrgID)
	}
	dto.OpenQuestions = openQs

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
			Statement: r.Statement, Mandatory: r.Mandatory, SortOrder: r.SortOrder,
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
		mandatory := r.Mandatory == nil || *r.Mandatory // default true
		byComp[r.CompetencyID].Behaviors = append(byComp[r.CompetencyID].Behaviors, CycleBehaviorDTO{
			Statement: r.Statement, Mandatory: mandatory, SortOrder: r.SortOrder,
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
