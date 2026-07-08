package feedback360

import (
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/google/uuid"
)

var (
	ErrForbidden   = errors.New("forbidden")
	ErrValidation  = errors.New("validation error")
	ErrCycleClosed = errors.New("cycle is closed")
)

// Minimum submitted responses required per relationship category for a valid
// 360 (mirrors the reference UI quorum). 'self' is handled separately.
var quorumMins = map[string]int{
	"manager":       1,
	"peer":          2,
	"direct_report": 1,
}

var validRelationships = map[string]bool{
	"self": true, "manager": true, "peer": true, "direct_report": true, "skip_level": true,
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

	return buildCycleDTO(cycle)
}

// getMyCycleService returns the participant's latest cycle as a full DTO
// (scoped to programID from the switcher when provided), or ErrNotFound.
func getMyCycleService(participantID uuid.UUID, programID *uuid.UUID) (*CycleDTO, error) {
	cycle, err := latestCycleForParticipant(participantID, programID)
	if err != nil {
		return nil, err
	}
	return buildCycleDTO(cycle)
}

// ── Raters ────────────────────────────────────────────────────────

func addRaterService(participantID uuid.UUID, cycleID uuid.UUID, req AddRaterRequest) (*CycleDTO, error) {
	cycle, err := ownedCycle(participantID, cycleID)
	if err != nil {
		return nil, err
	}
	if cycle.Status == "closed" {
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
	r := &FeedbackRater{
		ID:           uuid.New(),
		CycleID:      cycleID,
		Name:         name,
		Email:        email,
		Relationship: rel,
		Status:       "pending",
		InviteToken:  uuid.New(),
		CreatedAt:    time.Now(),
	}
	if err := createRater(r); err != nil {
		return nil, err
	}
	// NOTE: invite email dispatch is a cross-role integration point — the token
	// exists; wiring it to the notifications/email service is a later task.
	return buildCycleDTO(cycle)
}

func removeRaterService(participantID, cycleID, raterID uuid.UUID) (*CycleDTO, error) {
	cycle, err := ownedCycle(participantID, cycleID)
	if err != nil {
		return nil, err
	}
	rater, err := getRaterByID(raterID)
	if err != nil {
		return nil, err
	}
	if rater.CycleID != cycleID {
		return nil, ErrForbidden
	}
	if rater.Relationship == "self" {
		return nil, fmt.Errorf("%w: cannot remove the self rater", ErrValidation)
	}
	if err := deleteRater(raterID); err != nil {
		return nil, err
	}
	return buildCycleDTO(cycle)
}

func remindRaterService(participantID, cycleID, raterID uuid.UUID) (*CycleDTO, error) {
	cycle, err := ownedCycle(participantID, cycleID)
	if err != nil {
		return nil, err
	}
	rater, err := getRaterByID(raterID)
	if err != nil {
		return nil, err
	}
	if rater.CycleID != cycleID {
		return nil, ErrForbidden
	}
	if err := markRaterReminded(raterID); err != nil {
		return nil, err
	}
	return buildCycleDTO(cycle)
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

	// Index the aggregates by cycle.
	relByCycle := map[string]map[string]float64{}
	for _, r := range relScores {
		if relByCycle[r.CycleID] == nil {
			relByCycle[r.CycleID] = map[string]float64{}
		}
		relByCycle[r.CycleID][r.Relationship] = r.Avg
	}
	overallByCycle := map[string]*float64{}
	for _, o := range overall {
		overallByCycle[o.CycleID] = o.Avg
	}
	compByCycle := map[string][]AdminCompScoreDTO{}
	for _, c := range compScores {
		compByCycle[c.CycleID] = append(compByCycle[c.CycleID], AdminCompScoreDTO{
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
		rel := relByCycle[c.CycleID]
		dto := AdminCycleDTO{
			CycleID:     c.CycleID,
			Title:       c.Title,
			CycleType:   c.CycleType,
			Participant: c.Participant,
			Org:         c.Org,
			OrgID:       c.OrgID,
			Program:     c.Program,
			CompletedAt: c.CompletedAt.UTC().Format(time.RFC3339),
			Breakdown: AdminBreakdownDTO{
				Self:         pick(rel, "self"),
				Manager:      pick(rel, "manager"),
				Peer:         pick(rel, "peer"),
				DirectReport: pick(rel, "direct_report"),
			},
			Competencies: compByCycle[c.CycleID],
		}
		if dto.Competencies == nil {
			dto.Competencies = []AdminCompScoreDTO{}
		}
		dto.OverallScore = round1Ptr(overallByCycle[c.CycleID])
		out = append(out, dto)
	}
	return out, nil
}

// ── DTO assembly ──────────────────────────────────────────────────

func buildCycleDTO(cycle *FeedbackCycle) (*CycleDTO, error) {
	raters, err := listRaters(cycle.ID)
	if err != nil {
		return nil, err
	}
	comps, err := cycleCompetencies(cycle.ID)
	if err != nil {
		return nil, err
	}
	scores, err := aggregateScores(cycle.ID)
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

	// Raters (exclude 'self' from the invited/submitted counts shown as "raters").
	for _, r := range raters {
		if r.Relationship == "self" {
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

	// Quorum per relationship category.
	for _, rel := range []string{"manager", "peer", "direct_report"} {
		q := QuorumDTO{Relationship: rel, Min: quorumMins[rel]}
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

	return dto, nil
}

// ── AI narrative (deterministic today; swappable for LLM later) ────

// regenerateSummary builds a developmental narrative from real aggregate scores:
// strengths (highest others-rated), blind spots (self >> others), development
// (lowest others-rated). Persisted on the cycle.
func regenerateSummary(cycle *FeedbackCycle) error {
	dto, err := buildCycleDTO(cycle)
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

// ownedCycle loads a cycle and verifies the caller owns it.
func ownedCycle(participantID, cycleID uuid.UUID) (*FeedbackCycle, error) {
	cycle, err := getCycleByID(cycleID)
	if err != nil {
		return nil, err
	}
	if cycle.ParticipantID == nil || *cycle.ParticipantID != participantID {
		return nil, ErrForbidden
	}
	return cycle, nil
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
