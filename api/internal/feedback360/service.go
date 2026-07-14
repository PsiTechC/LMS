package feedback360

import (
	"errors"
	"fmt"
	"log"
	"os"
	"sort"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/xa-lms/api/pkg/email"
)

var (
	ErrForbidden   = errors.New("forbidden")
	ErrValidation  = errors.New("validation error")
	ErrCycleClosed = errors.New("cycle is closed")
)

// legacyQuorumMins is the fallback minimum-response requirement, used ONLY for
// old self-initiated cycles that predate feedback_quorum_config. Admin-initiated
// cycles read their real per-cycle config (set at Configure time).
var legacyQuorumMins = map[string]int{
	"manager":       1,
	"peer":          2,
	"direct_report": 1,
}

// validRelationships gates what a participant may nominate. 'self' is seeded by
// the system, never nominated. 'others' covers cross-functional stakeholders.
var validRelationships = map[string]bool{
	"self": true, "manager": true, "peer": true,
	"direct_report": true, "skip_level": true, "others": true,
}

// quorumForCycle returns the minimum responses required per relationship for a
// cycle: its feedback_quorum_config when present (admin-initiated), else the
// legacy defaults.
//
// Every category is returned, including ones with a minimum of 0 — the
// participant always sees the full set of cards so they know a category exists
// and may still nominate reviewers into it. A minimum of 0 simply means no
// responses are required there for quorum.
func quorumForCycle(cycleID uuid.UUID) map[string]int {
	cfg, err := getQuorumConfig(cycleID)
	if err != nil || cfg == nil {
		return legacyQuorumMins
	}
	return map[string]int{
		"manager":       cfg.Manager,
		"skip_level":    cfg.SkipManager,
		"peer":          cfg.Peer,
		"direct_report": cfg.DirectReport,
		"others":        cfg.Others,
	}
}

// defaultRelLabels are the participant-facing names for the fixed categories.
var defaultRelLabels = map[string]string{
	"manager":       "Manager",
	"skip_level":    "Skip Level",
	"peer":          "Peer",
	"direct_report": "Direct Report",
	"others":        "Others",
}

// othersLabelForCycle returns the admin's name for the "Others" category
// (e.g. "Customers"), or the generic default when none was set.
func othersLabelForCycle(cycleID uuid.UUID) string {
	cfg, err := getQuorumConfig(cycleID)
	if err == nil && cfg != nil && cfg.OthersLabel != nil && strings.TrimSpace(*cfg.OthersLabel) != "" {
		return strings.TrimSpace(*cfg.OthersLabel)
	}
	return defaultRelLabels["others"]
}

// relationshipLabelForCycle resolves a rater's relationship key to its
// participant-facing name for this cycle — e.g. for rater invite/reminder
// emails, so the recipient knows why they were asked ("as their Manager").
// Respects the admin's custom "Others" label the same way the participant UI
// does (relLabel in Feedback360Experience.tsx).
func relationshipLabelForCycle(cycleID uuid.UUID, rel string) string {
	if rel == "others" {
		return othersLabelForCycle(cycleID)
	}
	if label, ok := defaultRelLabels[rel]; ok {
		return label
	}
	return strings.ReplaceAll(rel, "_", " ")
}

// ── Cycle lifecycle ───────────────────────────────────────────────

func createCycleService(orgID, participantID uuid.UUID, req CreateCycleRequest) (*CycleDTO, error) {
	title := strings.TrimSpace(req.Title)
	if title == "" {
		title = "360° Feedback"
	}
	cycleType := req.CycleType
	if cycleType == "" {
		cycleType = "baseline"
	}

	cycle := &FeedbackCycle{
		ID:            uuid.New(),
		OrgID:         orgID,
		ParticipantID: &participantID,
		CreatedBy:     participantID,
		Title:         title,
		CycleType:     cycleType,
		Status:        "open",
		CreatedAt:     time.Now(),
		UpdatedAt:     time.Now(),
	}
	if req.ProgramID != "" {
		if pid, err := uuid.Parse(req.ProgramID); err == nil {
			cycle.ProgramID = &pid
		}
	}
	if req.CohortID != "" {
		if cid, err := uuid.Parse(req.CohortID); err == nil {
			cycle.CohortID = &cid
		}
	}
	if req.Deadline != "" {
		if d, err := time.Parse("2006-01-02", req.Deadline); err == nil {
			cycle.Deadline = &d
		}
	}

	if err := createCycle(cycle); err != nil {
		return nil, err
	}

	// Resolve competencies: explicit subset, else all org competencies.
	var compIDs []uuid.UUID
	if len(req.CompetencyIDs) > 0 {
		for _, s := range req.CompetencyIDs {
			if id, err := uuid.Parse(s); err == nil {
				compIDs = append(compIDs, id)
			}
		}
	} else {
		ids, err := orgCompetencyIDs(orgID)
		if err != nil {
			return nil, err
		}
		compIDs = ids
	}
	links := make([]FeedbackCycleCompetency, 0, len(compIDs))
	for i, id := range compIDs {
		links = append(links, FeedbackCycleCompetency{CycleID: cycle.ID, CompetencyID: id, SortOrder: i})
	}
	if err := addCycleCompetencies(links); err != nil {
		return nil, err
	}

	// Seed a 'self' rater so the participant can submit their own rating.
	self := &FeedbackRater{
		ID:           uuid.New(),
		CycleID:      cycle.ID,
		Name:         "Self",
		Email:        "",
		Relationship: "self",
		Status:       "pending",
		InviteToken:  uuid.New(),
		CreatedAt:    time.Now(),
	}
	if err := createRater(self); err != nil {
		return nil, err
	}

	return buildCycleDTO(cycle, participantID)
}

// getMyCycleService returns the cycle the participant was assigned (or their
// legacy self-initiated one), scoped to programID from the switcher.
func getMyCycleService(participantID uuid.UUID, programID *uuid.UUID) (*CycleDTO, error) {
	cycle, err := latestCycleForParticipant(participantID, programID)
	if err != nil {
		return nil, err
	}
	return buildCycleDTO(cycle, participantID)
}

// ErrReportNotReady signals the PDF report can't be generated yet — the
// frontend gate mirrors this, but the server re-checks so the download can't
// be forced by calling the endpoint directly before quorum is met.
var ErrReportNotReady = errors.New("report is not ready yet")

// getMyReportService renders the participant's PDF report, gated on the same
// completeness bar shown on screen: every quorum category met AND the
// participant's own self-rating submitted (without it, "self vs others" has no
// self side to compare).
func getMyReportService(participantID uuid.UUID, programID *uuid.UUID) ([]byte, error) {
	cycle, err := latestCycleForParticipant(participantID, programID)
	if err != nil {
		return nil, err
	}
	dto, err := buildCycleDTO(cycle, participantID)
	if err != nil {
		return nil, err
	}
	selfDone := dto.SelfRater != nil && dto.SelfRater.Status == "submitted"
	quorumMet := len(dto.Quorum) > 0
	for _, q := range dto.Quorum {
		if !q.Met {
			quorumMet = false
			break
		}
	}
	if !selfDone || !quorumMet {
		return nil, ErrReportNotReady
	}

	data, err := buildParticipantReportData(cycle, participantID)
	if err != nil {
		return nil, err
	}
	return generateParticipantReportPDF(data)
}

// maybeCompleteCycle flips a cycle to "completed" once its completeness bar is
// met — the same self-rating-submitted + every-quorum-category-met check used
// to gate the participant's PDF report (getMyReportService above). Called
// after every rater submission so the Superadmin "360° & Psychometrics" cross-
// org list (which only surfaces status IN ('closed','completed')) picks the
// cycle up as soon as it's genuinely done, with no separate manual "close"
// step. Already-completed cycles are left alone (no downgrade, no re-trigger).
func maybeCompleteCycle(cycle *FeedbackCycle, participantID uuid.UUID) {
	if cycle.Status == "closed" || cycle.Status == "completed" {
		return
	}
	dto, err := buildCycleDTO(cycle, participantID)
	if err != nil {
		return
	}
	selfDone := dto.SelfRater != nil && dto.SelfRater.Status == "submitted"
	quorumMet := len(dto.Quorum) > 0
	for _, q := range dto.Quorum {
		if !q.Met {
			quorumMet = false
			break
		}
	}
	if selfDone && quorumMet {
		_ = updateCycleStatus(cycle.ID, "completed")
	}
}

// BackfillCompletedCycles re-checks every still-open admin cycle's
// completeness once at startup and flips any that already meet quorum to
// "completed" — the same maybeCompleteCycle logic normally triggered by a
// rater submission. Needed because that trigger only fires on submissions
// made AFTER it was introduced: cycles whose quorum was already met by
// earlier submissions would otherwise stay stuck at their old status forever
// and never surface in the Superadmin "360° & Psychometrics" list. Cheap and
// safe to run on every boot (idempotent — already-completed cycles are
// skipped by maybeCompleteCycle itself).
func BackfillCompletedCycles() {
	pairs, err := listOpenAdminCycleParticipants()
	if err != nil {
		return
	}
	cycleCache := map[uuid.UUID]*FeedbackCycle{}
	for _, p := range pairs {
		cycle, ok := cycleCache[p.CycleID]
		if !ok {
			cycle, err = getCycleByID(p.CycleID)
			if err != nil {
				continue
			}
			cycleCache[p.CycleID] = cycle
		}
		maybeCompleteCycle(cycle, p.ParticipantID)
	}
}

// ── Raters ────────────────────────────────────────────────────────

// addRaterService nominates an EXTERNAL rater (name + email only — raters are
// not platform users) and sends them their token link by email.
func addRaterService(participantID uuid.UUID, cycleID uuid.UUID, req AddRaterRequest) (*CycleDTO, error) {
	cycle, err := accessibleCycle(participantID, cycleID)
	if err != nil {
		return nil, err
	}
	if cycle.Status == "closed" || cycle.Status == "completed" {
		return nil, ErrCycleClosed
	}
	name := strings.TrimSpace(req.Name)
	email := strings.TrimSpace(req.Email)
	rel := req.Relationship
	if name == "" || email == "" {
		return nil, fmt.Errorf("%w: name and email are required", ErrValidation)
	}
	if rel == "self" || !validRelationships[rel] {
		return nil, fmt.Errorf("%w: invalid relationship", ErrValidation)
	}
	pid := participantID
	r := &FeedbackRater{
		ID:            uuid.New(),
		CycleID:       cycleID,
		ParticipantID: &pid,
		Name:          name,
		Email:         email,
		Relationship:  rel,
		Status:        "pending",
		InviteToken:   uuid.New(),
		CreatedAt:     time.Now(),
	}
	if err := createRater(r); err != nil {
		return nil, err
	}
	sendRaterInviteEmail(r, cycle, participantID)
	return buildCycleDTO(cycle, participantID)
}

func removeRaterService(participantID, cycleID, raterID uuid.UUID) (*CycleDTO, error) {
	cycle, err := accessibleCycle(participantID, cycleID)
	if err != nil {
		return nil, err
	}
	rater, err := getRaterByID(raterID)
	if err != nil {
		return nil, err
	}
	if err := raterBelongsTo(rater, cycleID, participantID); err != nil {
		return nil, err
	}
	if rater.Relationship == "self" {
		return nil, fmt.Errorf("%w: cannot remove the self rater", ErrValidation)
	}
	if err := deleteRater(raterID); err != nil {
		return nil, err
	}
	return buildCycleDTO(cycle, participantID)
}

// remindRaterService re-sends the rater's token link and stamps reminded_at.
func remindRaterService(participantID, cycleID, raterID uuid.UUID) (*CycleDTO, error) {
	cycle, err := accessibleCycle(participantID, cycleID)
	if err != nil {
		return nil, err
	}
	rater, err := getRaterByID(raterID)
	if err != nil {
		return nil, err
	}
	if err := raterBelongsTo(rater, cycleID, participantID); err != nil {
		return nil, err
	}
	if rater.Relationship == "self" || rater.Status == "submitted" {
		return nil, fmt.Errorf("%w: nothing to remind", ErrValidation)
	}
	if err := markRaterReminded(raterID); err != nil {
		return nil, err
	}
	sendRaterReminderEmail(rater, cycle, participantID)
	return buildCycleDTO(cycle, participantID)
}

// ── Rater invite / reminder emails (external recipients) ──────────

// raterLinkBaseURL is where the public rater form lives.
func raterLinkBaseURL() string {
	if v := strings.TrimRight(os.Getenv("APP_BASE_URL"), "/"); v != "" {
		return v
	}
	return "http://localhost:3000"
}

func raterLink(token uuid.UUID) string {
	return fmt.Sprintf("%s/rater/%s", raterLinkBaseURL(), token.String())
}

// sendRaterInviteEmail mails an external rater their unique form link.
// Dispatched in the background so nominating a rater returns immediately.
func sendRaterInviteEmail(r *FeedbackRater, cycle *FeedbackCycle, participantID uuid.UUID) {
	name := participantFirstNameFor(participantID)
	orgName := orgNameFor(cycle.OrgID)
	relLabel := relationshipLabelForCycle(cycle.ID, r.Relationship)
	link := raterLink(r.InviteToken)
	to, rater := r.Email, r.Name
	go func() {
		html := email.RaterInviteTemplate(rater, name, orgName, relLabel, link)
		if err := email.Send(to, "You've been asked to give 360° feedback", html); err != nil {
			log.Printf("feedback_360: rater invite email to %s failed: %v", to, err)
		}
	}()
}

func sendRaterReminderEmail(r *FeedbackRater, cycle *FeedbackCycle, participantID uuid.UUID) {
	name := participantFirstNameFor(participantID)
	orgName := orgNameFor(cycle.OrgID)
	relLabel := relationshipLabelForCycle(cycle.ID, r.Relationship)
	link := raterLink(r.InviteToken)
	to, rater := r.Email, r.Name
	go func() {
		html := email.RaterReminderTemplate(rater, name, orgName, relLabel, link)
		if err := email.Send(to, "Reminder: your 360° feedback is still pending", html); err != nil {
			log.Printf("feedback_360: rater reminder email to %s failed: %v", to, err)
		}
	}()
}

// ── Rater intake (public, token-based) ────────────────────────────

func getRaterFormService(token uuid.UUID) (*RaterFormDTO, error) {
	rater, err := getRaterByToken(token)
	if err != nil {
		return nil, err
	}
	cycle, err := getCycleByID(rater.CycleID)
	if err != nil {
		return nil, err
	}
	comps, err := cycleCompetencies(cycle.ID)
	if err != nil {
		return nil, err
	}
	var participantName string
	if cycle.ParticipantID != nil {
		participantName, _ = participantFirstName(*cycle.ParticipantID)
	}

	form := &RaterFormDTO{
		CycleTitle:       cycle.Title,
		ParticipantName:  participantName,
		Relationship:     rater.Relationship,
		AlreadySubmitted: rater.Status == "submitted",
		Competencies:     make([]RaterCompetencyDTO, 0, len(comps)),
	}
	for _, c := range comps {
		form.Competencies = append(form.Competencies, RaterCompetencyDTO{
			CompetencyID: c.CompetencyID.String(), Title: c.Title, Description: c.Description,
		})
	}
	return form, nil
}

func submitResponsesService(token uuid.UUID, req SubmitResponsesRequest) error {
	rater, err := getRaterByToken(token)
	if err != nil {
		return err
	}
	cycle, err := getCycleByID(rater.CycleID)
	if err != nil {
		return err
	}
	if cycle.Status == "closed" {
		return ErrCycleClosed
	}
	if len(req.Responses) == 0 {
		return fmt.Errorf("%w: no responses provided", ErrValidation)
	}
	rows := make([]FeedbackResponse, 0, len(req.Responses))
	for _, r := range req.Responses {
		cid, err := uuid.Parse(r.CompetencyID)
		if err != nil {
			return fmt.Errorf("%w: invalid competency_id", ErrValidation)
		}
		if r.Score < 0 || r.Score > 5 {
			return fmt.Errorf("%w: score must be 0-5", ErrValidation)
		}
		fr := FeedbackResponse{ID: uuid.New(), RaterID: rater.ID, CompetencyID: cid, Score: r.Score, CreatedAt: time.Now()}
		if strings.TrimSpace(r.Comment) != "" {
			c := r.Comment
			fr.Comment = &c
		}
		rows = append(rows, fr)
	}
	if err := replaceRaterResponses(rater.ID, rows); err != nil {
		return err
	}
	if err := markRaterSubmitted(rater.ID); err != nil {
		return err
	}
	// Refresh the developmental narrative from the new aggregate.
	_ = regenerateSummary(cycle)
	return nil
}

// ── Admin aggregate (superadmin cross-org, completed cycles) ──────

// listAdminCyclesService assembles the superadmin 360 view: every completed
// (closed) cycle with overall score, self/manager/peer/direct-report breakdown,
// and per-competency scores. orgID "" = all orgs. All values are real.
func listAdminCyclesService(orgID string) ([]AdminCycleDTO, error) {
	cycles, err := listAdminClosedCycles(orgID)
	if err != nil {
		return nil, err
	}
	if len(cycles) == 0 {
		return []AdminCycleDTO{}, nil
	}

	relScores, err := adminRelationshipScores(orgID)
	if err != nil {
		return nil, err
	}
	overall, err := adminOverallScores(orgID)
	if err != nil {
		return nil, err
	}
	compScores, err := adminCompetencyScores(orgID)
	if err != nil {
		return nil, err
	}

	// Index the aggregates by (cycle, participant) — an admin cycle can carry
	// many participants sharing one feedback_cycles row, so cycle_id alone is
	// not a unique key for "one completed panel" (see adminCycleRow doc).
	panelKey := func(cycleID, participantID string) string { return cycleID + "|" + participantID }

	relByPanel := map[string]map[string]float64{}
	for _, r := range relScores {
		k := panelKey(r.CycleID, r.ParticipantID)
		if relByPanel[k] == nil {
			relByPanel[k] = map[string]float64{}
		}
		relByPanel[k][r.Relationship] = r.Avg
	}
	overallByPanel := map[string]*float64{}
	for _, o := range overall {
		overallByPanel[panelKey(o.CycleID, o.ParticipantID)] = o.Avg
	}
	compByPanel := map[string][]AdminCompScoreDTO{}
	for _, c := range compScores {
		k := panelKey(c.CycleID, c.ParticipantID)
		compByPanel[k] = append(compByPanel[k], AdminCompScoreDTO{
			CompetencyID: c.CompetencyID, Title: c.Title, Score: round1(c.Avg),
		})
	}

	pick := func(m map[string]float64, key string) *float64 {
		if m == nil {
			return nil
		}
		if v, ok := m[key]; ok {
			r := round1(v)
			return &r
		}
		return nil
	}

	out := make([]AdminCycleDTO, 0, len(cycles))
	for _, c := range cycles {
		k := panelKey(c.CycleID, c.ParticipantID)
		rel := relByPanel[k]
		dto := AdminCycleDTO{
			CycleID:       c.CycleID,
			ParticipantID: c.ParticipantID,
			Title:         c.Title,
			CycleType:     c.CycleType,
			Participant:   c.Participant,
			Org:           c.Org,
			OrgID:         c.OrgID,
			Program:       c.Program,
			CompletedAt:   c.CompletedAt.UTC().Format(time.RFC3339),
			Breakdown: AdminBreakdownDTO{
				Self:         pick(rel, "self"),
				Manager:      pick(rel, "manager"),
				Peer:         pick(rel, "peer"),
				DirectReport: pick(rel, "direct_report"),
			},
			Competencies: compByPanel[k],
		}
		if dto.Competencies == nil {
			dto.Competencies = []AdminCompScoreDTO{}
		}
		dto.OverallScore = round1Ptr(overallByPanel[k])
		out = append(out, dto)
	}
	return out, nil
}

// ── DTO assembly ──────────────────────────────────────────────────

// buildCycleDTO assembles a participant's view of a cycle. Raters and scores are
// scoped to that participant's own panel — an admin cycle holds many participants.
func buildCycleDTO(cycle *FeedbackCycle, participantID uuid.UUID) (*CycleDTO, error) {
	isAdminCycle := cycle.ParticipantID == nil

	var raters []FeedbackRater
	var err error
	if isAdminCycle {
		raters, err = listRatersFor(cycle.ID, participantID)
	} else {
		raters, err = listRaters(cycle.ID)
	}
	if err != nil {
		return nil, err
	}
	// Self-heal: an admin-cycle participant should always have a seeded 'self'
	// rater (assignParticipantsService creates one). Participants assigned
	// before that seeding existed can still be missing one — backfill on read
	// rather than leaving them permanently unable to self-rate.
	if isAdminCycle {
		hasSelf := false
		for _, r := range raters {
			if r.Relationship == "self" {
				hasSelf = true
				break
			}
		}
		if !hasSelf {
			self := &FeedbackRater{
				ID: uuid.New(), CycleID: cycle.ID, ParticipantID: &participantID,
				Name: "Self", Email: "", Relationship: "self", Status: "pending",
				InviteToken: uuid.New(), CreatedAt: time.Now(),
			}
			if err := createRater(self); err == nil {
				raters = append(raters, *self)
			}
		}
	}
	comps, err := cycleCompetencies(cycle.ID)
	if err != nil {
		return nil, err
	}
	// Legacy cycles have one owner, so no per-participant scoping is needed.
	scopeID := participantID
	if !isAdminCycle {
		scopeID = uuid.Nil
	}
	scores, err := aggregateScores(cycle.ID, scopeID)
	if err != nil {
		return nil, err
	}
	scoreByComp := map[uuid.UUID]scoreRow{}
	for _, s := range scores {
		scoreByComp[s.CompetencyID] = s
	}

	dto := &CycleDTO{
		ID:        cycle.ID.String(),
		Title:     cycle.Title,
		CycleType: cycle.CycleType,
		Status:    cycle.Status,
		AISummary: cycle.AISummary,
		CreatedAt: cycle.CreatedAt.Format(time.RFC3339),
		// Initialize slices so JSON marshals [] (not null) — the client maps over these.
		Raters:       []RaterDTO{},
		Competencies: []CompetencyScoreDTO{},
		Quorum:       []QuorumDTO{},
	}
	if cycle.Deadline != nil {
		s := cycle.Deadline.Format("2006-01-02")
		dto.Deadline = &s
	}

	// Raters (exclude 'self' from the invited/submitted counts shown as "raters" —
	// it's surfaced separately via dto.SelfRater instead).
	for _, r := range raters {
		if r.Relationship == "self" {
			dto.SelfRater = &SelfRaterDTO{InviteToken: r.InviteToken.String(), Status: r.Status}
			continue
		}
		rd := RaterDTO{
			ID: r.ID.String(), Name: r.Name, Email: r.Email,
			Relationship: r.Relationship, Status: r.Status,
		}
		if r.RemindedAt != nil {
			s := r.RemindedAt.Format(time.RFC3339)
			rd.RemindedAt = &s
		}
		if r.SubmittedAt != nil {
			s := r.SubmittedAt.Format(time.RFC3339)
			rd.SubmittedAt = &s
		}
		dto.Raters = append(dto.Raters, rd)
		dto.RatersInvited++
		if r.Status == "submitted" {
			dto.RatersSubmitted++
		}
	}

	// Competency self-vs-others scores.
	for _, c := range comps {
		cs := CompetencyScoreDTO{CompetencyID: c.CompetencyID.String(), Title: c.Title}
		if sr, ok := scoreByComp[c.CompetencyID]; ok {
			cs.SelfScore = sr.SelfScore
			cs.OthersScore = sr.OthersScore
			if sr.SelfScore != nil && sr.OthersScore != nil {
				gap := round1(*sr.SelfScore - *sr.OthersScore)
				cs.Gap = &gap
			}
			cs.SelfScore = round1Ptr(cs.SelfScore)
			cs.OthersScore = round1Ptr(cs.OthersScore)
		}
		dto.Competencies = append(dto.Competencies, cs)
	}

	// Quorum per relationship category, from this cycle's config. Every category
	// is shown (including a minimum of 0, which requires no responses but still
	// accepts nominations). Fixed display order.
	mins := quorumForCycle(cycle.ID)
	othersLabel := othersLabelForCycle(cycle.ID)
	for _, rel := range []string{"manager", "skip_level", "peer", "direct_report", "others"} {
		min, present := mins[rel]
		if !present {
			continue // legacy cycles don't define skip_level / others at all
		}
		label := defaultRelLabels[rel]
		if rel == "others" {
			label = othersLabel
		}
		q := QuorumDTO{Relationship: rel, Label: label, Min: min}
		for _, r := range raters {
			if r.Relationship != rel {
				continue
			}
			q.Nominated++
			if r.Status == "submitted" {
				q.Submitted++
			}
		}
		q.Met = q.Submitted >= q.Min
		dto.Quorum = append(dto.Quorum, q)
	}

	// Admin cycles can't persist a per-participant narrative on the shared cycle
	// row, so derive this participant's from their own scores at read time.
	if isAdminCycle {
		if s := composeNarrative(dto.Competencies); s != "" {
			dto.AISummary = &s
		} else {
			dto.AISummary = nil
		}
	}

	return dto, nil
}

// ── AI narrative (deterministic today; swappable for LLM later) ────

// regenerateSummary builds a developmental narrative from real aggregate scores:
// strengths (highest others-rated), blind spots (self >> others), development
// (lowest others-rated).
//
// It only PERSISTS for legacy single-owner cycles, where feedback_cycles.ai_summary
// is unambiguous. An admin cycle has many participants, so one shared column can't
// hold their narratives — buildCycleDTO composes each participant's on read.
func regenerateSummary(cycle *FeedbackCycle) error {
	if cycle.ParticipantID == nil {
		return nil // admin cycle: narrative is derived per participant on read
	}
	dto, err := buildCycleDTO(cycle, *cycle.ParticipantID)
	if err != nil {
		return err
	}
	summary := composeNarrative(dto.Competencies)
	if summary == "" {
		return nil
	}
	if err := updateCycleSummary(cycle.ID, summary); err != nil {
		return err
	}
	return nil
}

func composeNarrative(comps []CompetencyScoreDTO) string {
	type rated struct {
		title              string
		others, gap        float64
		hasOthers, hasGap  bool
	}
	var list []rated
	for _, c := range comps {
		r := rated{title: c.Title}
		if c.OthersScore != nil {
			r.others = *c.OthersScore
			r.hasOthers = true
		}
		if c.Gap != nil {
			r.gap = *c.Gap
			r.hasGap = true
		}
		if r.hasOthers {
			list = append(list, r)
		}
	}
	if len(list) == 0 {
		return ""
	}

	strongest := append([]rated{}, list...)
	sort.Slice(strongest, func(i, j int) bool { return strongest[i].others > strongest[j].others })
	weakest := append([]rated{}, list...)
	sort.Slice(weakest, func(i, j int) bool { return weakest[i].others < weakest[j].others })
	// Blind spots: self rated meaningfully higher than others (gap > 0.5).
	blind := append([]rated{}, list...)
	sort.Slice(blind, func(i, j int) bool { return blind[i].gap > blind[j].gap })

	var b strings.Builder
	b.WriteString("Strengths: Raters consistently recognise your ")
	b.WriteString(strongest[0].title)
	b.WriteString(".")

	if blind[0].hasGap && blind[0].gap > 0.5 {
		b.WriteString(" Blind Spots: You rate yourself higher on ")
		b.WriteString(blind[0].title)
		b.WriteString(" than others do — worth reflecting on how this shows up.")
	}

	b.WriteString(" Development Theme: Prioritise ")
	b.WriteString(weakest[0].title)
	b.WriteString(" — it scored lowest across your raters and offers the biggest growth opportunity.")
	return b.String()
}

// ── helpers ───────────────────────────────────────────────────────

// accessibleCycle loads a cycle the participant is allowed to act on: either an
// admin cycle they were assigned to, or their own legacy self-initiated cycle.
func accessibleCycle(participantID, cycleID uuid.UUID) (*FeedbackCycle, error) {
	cycle, err := getCycleByID(cycleID)
	if err != nil {
		return nil, err
	}
	// Legacy: the participant owns the cycle outright.
	if cycle.ParticipantID != nil && *cycle.ParticipantID == participantID {
		return cycle, nil
	}
	// Admin-initiated: the participant must be assigned to it.
	assigned, err := participantAssignedTo(cycleID, participantID)
	if err != nil {
		return nil, err
	}
	if !assigned {
		return nil, ErrForbidden
	}
	return cycle, nil
}

// raterBelongsTo verifies a rater row is on this cycle AND belongs to this
// participant's panel — so one participant can never touch another's raters.
func raterBelongsTo(rater *FeedbackRater, cycleID, participantID uuid.UUID) error {
	if rater.CycleID != cycleID {
		return ErrForbidden
	}
	// Legacy rows have no participant_id; the cycle-level ownership check covers them.
	if rater.ParticipantID != nil && *rater.ParticipantID != participantID {
		return ErrForbidden
	}
	return nil
}

func round1(v float64) float64 { return float64(int(v*10+sign(v)*0.5)) / 10 }
func sign(v float64) float64 {
	if v < 0 {
		return -1
	}
	return 1
}
func round1Ptr(v *float64) *float64 {
	if v == nil {
		return nil
	}
	r := round1(*v)
	return &r
}
