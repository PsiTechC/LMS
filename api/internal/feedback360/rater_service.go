package feedback360

import (
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
)

// Public rater form (/rater/{token}). No auth: the token IS the security
// boundary. It's a v4 UUID (122 bits of CSPRNG entropy), unguessable by
// enumeration.

// importanceCategories are the only rater relationships asked for an importance
// rating. Everyone else (peer / direct_report / self / others) never sees it.
var importanceCategories = map[string]bool{
	"manager":    true,
	"skip_level": true,
}

// getRaterFormV2Service renders the form from the cycle's frozen snapshot.
//
// Viewing NEVER consumes the token: corporate mail scanners (Outlook Safe Links,
// spam filters) pre-fetch links before a human ever clicks, so locking on view
// would make real raters find their link already "used". Only submit consumes it.
func getRaterFormV2Service(token uuid.UUID) (*RaterFormV2DTO, error) {
	rater, err := getRaterByToken(token)
	if err != nil {
		return nil, err // ErrNotFound → caller returns a generic "invalid link"
	}
	cycle, err := getCycleByID(rater.CycleID)
	if err != nil {
		return nil, err
	}

	dto := &RaterFormV2DTO{
		CycleName:        derefStr(cycle.Name, cycle.Title),
		OrgName:          orgNameFor(cycle.OrgID),
		Relationship:     rater.Relationship,
		ShowImportance:   importanceCategories[rater.Relationship],
		AlreadySubmitted: rater.Status == "submitted",
		Competencies:     []RaterCompetencyV2DTO{},
		OpenQuestions:    []RaterOpenQuestionDTO{},
	}
	// Whose feedback this is: the assigned participant, else the legacy owner.
	switch {
	case rater.ParticipantID != nil:
		dto.ParticipantName = participantFirstNameFor(*rater.ParticipantID)
	case cycle.ParticipantID != nil:
		dto.ParticipantName = participantFirstNameFor(*cycle.ParticipantID)
	}

	// Short-circuit: an already-submitted rater sees a thank-you, not the form.
	if dto.AlreadySubmitted {
		return dto, nil
	}

	behaviors, err := cycleSnapshotBehaviors(cycle.ID)
	if err != nil {
		return nil, err
	}
	dto.Competencies = groupRaterBehaviors(behaviors)

	opens, err := cycleSnapshotOpenQuestions(cycle.ID)
	if err != nil {
		return nil, err
	}
	for _, o := range opens {
		dto.OpenQuestions = append(dto.OpenQuestions, RaterOpenQuestionDTO{
			QuestionID: o.QuestionID, Prompt: o.Prompt,
			Mandatory: o.Mandatory, SortOrder: o.SortOrder,
		})
	}
	return dto, nil
}

// groupRaterBehaviors nests the flat snapshot rows under their competency,
// preserving snapshot order.
func groupRaterBehaviors(rows []snapshotBehaviorRow) []RaterCompetencyV2DTO {
	order := []string{}
	byComp := map[string]*RaterCompetencyV2DTO{}
	for _, r := range rows {
		if _, ok := byComp[r.CompetencyID]; !ok {
			byComp[r.CompetencyID] = &RaterCompetencyV2DTO{
				CompetencyID: r.CompetencyID, Title: r.CompetencyTitle,
				Behaviors: []RaterBehaviorDTO{},
			}
			order = append(order, r.CompetencyID)
		}
		byComp[r.CompetencyID].Behaviors = append(byComp[r.CompetencyID].Behaviors, RaterBehaviorDTO{
			BehaviorID: r.BehaviorID, QuestionText: r.QuestionText,
			Mandatory: r.Mandatory, SortOrder: r.SortOrder,
		})
	}
	out := make([]RaterCompetencyV2DTO, 0, len(order))
	for _, cid := range order {
		out = append(out, *byComp[cid])
	}
	return out
}

// submitRaterFormV2Service validates and persists a rater's answers, then marks
// the token consumed. Idempotency: an already-submitted token is rejected rather
// than silently overwritten.
func submitRaterFormV2Service(token uuid.UUID, req SubmitRaterFormRequest) error {
	rater, err := getRaterByToken(token)
	if err != nil {
		return err
	}
	if rater.Status == "submitted" {
		return fmt.Errorf("%w: this feedback has already been submitted", ErrValidation)
	}
	cycle, err := getCycleByID(rater.CycleID)
	if err != nil {
		return err
	}
	if cycle.Status == "closed" || cycle.Status == "completed" {
		return ErrCycleClosed
	}

	behaviorComp, err := validBehaviorIDs(cycle.ID)
	if err != nil {
		return err
	}
	openIDs, err := validOpenQuestionIDs(cycle.ID)
	if err != nil {
		return err
	}
	askImportance := importanceCategories[rater.Relationship]

	// ── Behavior answers ──
	seen := map[string]bool{}
	rows := make([]FeedbackBehaviorResponse, 0, len(req.Behaviors))
	for _, b := range req.Behaviors {
		compID, ok := behaviorComp[b.BehaviorID]
		if !ok {
			return fmt.Errorf("%w: unknown behavior", ErrValidation)
		}
		if seen[b.BehaviorID] {
			return fmt.Errorf("%w: duplicate answer for a question", ErrValidation)
		}
		seen[b.BehaviorID] = true

		bid, _ := uuid.Parse(b.BehaviorID)
		cid, _ := uuid.Parse(compID)
		row := FeedbackBehaviorResponse{
			RaterID: rater.ID, CycleBehaviorID: bid, CompetencyID: cid,
			NotObserved: b.NotObserved,
		}
		if !b.NotObserved {
			if b.Score == nil || *b.Score < 1 || *b.Score > 5 {
				return fmt.Errorf("%w: each rated question needs a score of 1–5", ErrValidation)
			}
			row.Score = b.Score
			// Importance is only stored for the categories that are asked for it.
			if askImportance && b.Importance != nil {
				if *b.Importance < 1 || *b.Importance > 5 {
					return fmt.Errorf("%w: importance must be 1–5", ErrValidation)
				}
				row.Importance = b.Importance
			}
		}
		rows = append(rows, row)
	}

	// Every mandatory behavior must be answered (a "not observed" counts).
	snapshot, err := cycleSnapshotBehaviors(cycle.ID)
	if err != nil {
		return err
	}
	for _, s := range snapshot {
		if s.Mandatory && !seen[s.BehaviorID] {
			return fmt.Errorf("%w: please answer all required questions", ErrValidation)
		}
	}

	// ── Open answers ──
	openSeen := map[string]bool{}
	opens := make([]FeedbackOpenResponse, 0, len(req.OpenAnswers))
	for _, o := range req.OpenAnswers {
		if !openIDs[o.QuestionID] {
			return fmt.Errorf("%w: unknown question", ErrValidation)
		}
		openSeen[o.QuestionID] = true
		qid, _ := uuid.Parse(o.QuestionID)
		opens = append(opens, FeedbackOpenResponse{
			RaterID: rater.ID, OpenQuestionID: qid,
			AnswerText: strings.TrimSpace(o.AnswerText),
		})
	}
	openQs, err := cycleSnapshotOpenQuestions(cycle.ID)
	if err != nil {
		return err
	}
	answered := map[string]string{}
	for _, o := range opens {
		answered[o.OpenQuestionID.String()] = o.AnswerText
	}
	for _, q := range openQs {
		if q.Mandatory && strings.TrimSpace(answered[q.QuestionID]) == "" {
			return fmt.Errorf("%w: please answer all required questions", ErrValidation)
		}
	}

	if err := saveRaterSubmission(rater.ID, rows, opens); err != nil {
		return err
	}
	// Refresh the participant's narrative from the new aggregate.
	_ = regenerateSummary(cycle)
	return nil
}

// ── Abuse guard: per-token + per-IP submission rate limiting ──────

// This endpoint is public and unauthenticated, so cap how often a single token
// or IP may attempt a submission. In-memory is sufficient: the window is short
// and a restart simply resets it (no security regression, only a lost counter).
type rateLimiter struct {
	mu   sync.Mutex
	hits map[string][]time.Time
}

var submitLimiter = &rateLimiter{hits: map[string][]time.Time{}}

const (
	rateWindow   = 10 * time.Minute
	rateMaxHits  = 10 // attempts per key per window
	rateSweepCap = 5000
)

// Allow reports whether key may act now, recording the attempt if so.
func (rl *rateLimiter) Allow(key string) bool {
	now := time.Now()
	rl.mu.Lock()
	defer rl.mu.Unlock()

	// Opportunistic sweep so the map can't grow without bound.
	if len(rl.hits) > rateSweepCap {
		for k, ts := range rl.hits {
			if len(ts) == 0 || now.Sub(ts[len(ts)-1]) > rateWindow {
				delete(rl.hits, k)
			}
		}
	}

	fresh := rl.hits[key][:0]
	for _, t := range rl.hits[key] {
		if now.Sub(t) < rateWindow {
			fresh = append(fresh, t)
		}
	}
	if len(fresh) >= rateMaxHits {
		rl.hits[key] = fresh
		return false
	}
	rl.hits[key] = append(fresh, now)
	return true
}
