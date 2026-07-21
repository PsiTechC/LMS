package leaderboard

import (
	"errors"
	"log"
	"time"

	"github.com/google/uuid"
	"github.com/xa-lms/api/pkg/database"
	"gorm.io/gorm"
)

// ── Wiring the pure domain model (scoring.go) to persisted data ────────────
//
// Everything below reads real, already-committed rows (activity_progress,
// submissions, assessment_attempts, activities, cohorts, organizations) -
// never a caller-supplied score, date, or quality value (requirement #3).
// RecalculateActivityScore is the one entry point; it is NOT called from any
// live award/event path yet (activityprogress.upsertProgressService,
// assessments.submitAssessmentService, submissions.submitService, etc. are
// all untouched) - this phase makes direct recalculation possible and
// testable, wiring into those call sites is a later phase.

// ErrUnsupportedActivityType is returned for activity types this phase has
// no grounded, non-invented engagement signal for. live_session/coaching/
// survey have no reliable per-activity completion signal today - see
// api/internal/programs/completion.go's own doc comment, which treats them
// as "always satisfied" for GATING purposes only. Silently reusing that
// convenience here would fabricate speed/quality data for activity types
// that were never meant to be scored this way, so scoring these is
// deferred rather than guessed at.
var ErrUnsupportedActivityType = errors.New("activity type is not supported by the scoring model yet")

// ErrParticipantNotEnrolled mirrors AwardActivity's own authorization check
// in awards.go - scoring must never proceed for a participant who isn't
// actually enrolled in the activity's program (requirement #10).
var ErrParticipantNotEnrolled = errors.New("participant is not enrolled for this activity")

// activityScoringContextRow is the org/enrollment/timezone/deadline-input
// context for one (participant, activity) pair. Deliberately mirrors
// AwardActivity's own enrollment-resolution query in awards.go so both
// scoring engines agree on the same org/enrollment/timezone truth for the
// same participant+activity.
type activityScoringContextRow struct {
	OrganizationID, EnrollmentID, ProgramID, CohortID string
	ActivityType                                      string
	Timezone                                          string
	CohortStartDate                                   *time.Time
	ActivityStartDay                                  int
	ActivityDueDayOffset                              int
}

func loadActivityScoringContext(participantID, activityID uuid.UUID) (*activityScoringContextRow, error) {
	var row activityScoringContextRow
	err := database.DB.Raw(`
		SELECT p.org_id::text organization_id, e.id::text enrollment_id, p.id::text program_id, c.id::text cohort_id,
		       a.type activity_type, COALESCE(o.timezone,'UTC') timezone,
		       c.start_date cohort_start_date, a.start_day activity_start_day, a.due_day_offset activity_due_day_offset
		FROM activities a
		JOIN program_phases pp ON pp.id = a.phase_id
		JOIN programs p ON p.id = pp.program_id
		JOIN organizations o ON o.id = p.org_id
		JOIN enrollments e ON e.user_id = ? AND e.role = 'participant'
		JOIN cohorts c ON c.id = e.cohort_id AND c.program_id = p.id
		WHERE a.id = ? AND e.status <> 'withdrawn'
		ORDER BY e.enrolled_at DESC LIMIT 1
	`, participantID, activityID).Scan(&row).Error
	if err != nil {
		return nil, err
	}
	if row.OrganizationID == "" {
		return nil, ErrParticipantNotEnrolled
	}
	return &row, nil
}

// resolveDeadline derives the activity's due-date deadline instant (org
// timezone applied, per requirement #4) from the cohort's start date plus
// the activity's day offsets - the SAME arithmetic AwardActivity uses for
// due_at in awards.go (start_day + due_day_offset days after cohort start,
// end of that calendar day). Pure - takes no DB dependency, fully
// unit-testable on its own. Returns nil (no deadline) when the cohort has no
// start date set yet, matching CalculateAward's existing "don't invent a
// timestamp" behavior; ScoreSpeed then correctly excludes speed from the max
// for a nil deadline.
func resolveDeadline(row *activityScoringContextRow) (*time.Time, error) {
	if row.CohortStartDate == nil {
		return nil, nil
	}
	dueDate := row.CohortStartDate.AddDate(0, 0, row.ActivityStartDay+row.ActivityDueDayOffset)
	deadline, err := ResolveCalendarDeadline(dueDate, row.Timezone)
	if err != nil {
		return nil, err
	}
	return &deadline, nil
}

// DeriveEngagementLevel maps the persisted activity_progress signal (status
// + percent_complete) to an EngagementLevel. Pure - the caller has already
// read these values from the database.
func DeriveEngagementLevel(status string, percentComplete int) EngagementLevel {
	switch status {
	case "completed":
		return EngagementComplete
	case "in_progress":
		if percentComplete > 0 && percentComplete < 100 {
			return EngagementPartial
		}
		return EngagementNotStarted
	default:
		return EngagementNotStarted
	}
}

// engagementSignal is the resolved engagement level plus the completion
// timestamp SPEED needs, for one (participant, activity) pair.
type engagementSignal struct {
	Level       EngagementLevel
	CompletedAt time.Time
}

// loadEngagementSignal resolves engagement per activity type, from the same
// tables api/internal/programs/completion.go's activityCompletionMap already
// treats as the source of truth for "is this activity done" - content types
// (video/pdf/case_study/content) get a genuine partial state from
// activity_progress.percent_complete; submission-backed types (assessment,
// journal, assignment, peer_review) are binary (submitted or not) since
// there is no partial-submission concept for them today.
func loadEngagementSignal(participantID, activityID uuid.UUID, activityType string) (*engagementSignal, error) {
	switch activityType {
	case "video", "pdf", "case_study", "content":
		var row struct {
			Status          string
			PercentComplete int
			CompletedAt     *time.Time
		}
		err := database.DB.Raw(`
			SELECT status, percent_complete, completed_at
			FROM activity_progress WHERE user_id = ? AND activity_id = ?
		`, participantID, activityID).Scan(&row).Error
		if err != nil {
			return nil, err
		}
		sig := &engagementSignal{Level: DeriveEngagementLevel(row.Status, row.PercentComplete)}
		if row.CompletedAt != nil {
			sig.CompletedAt = *row.CompletedAt
		}
		return sig, nil

	case "assessment":
		var row struct {
			Count       int
			SubmittedAt *time.Time
		}
		err := database.DB.Raw(`
			SELECT COUNT(*) count, MAX(submitted_at) submitted_at
			FROM assessment_attempts WHERE participant_id = ? AND activity_id = ?
		`, participantID, activityID).Scan(&row).Error
		if err != nil {
			return nil, err
		}
		sig := &engagementSignal{Level: EngagementNotStarted}
		if row.Count > 0 {
			sig.Level = EngagementComplete
			if row.SubmittedAt != nil {
				sig.CompletedAt = *row.SubmittedAt
			}
		}
		return sig, nil

	case "journal", "assignment", "peer_review":
		var row struct {
			Count       int
			SubmittedAt *time.Time
		}
		err := database.DB.Raw(`
			SELECT COUNT(*) count, MAX(submitted_at) submitted_at
			FROM submissions WHERE participant_id = ? AND activity_id = ?
		`, participantID, activityID).Scan(&row).Error
		if err != nil {
			return nil, err
		}
		sig := &engagementSignal{Level: EngagementNotStarted}
		if row.Count > 0 {
			sig.Level = EngagementComplete
			if row.SubmittedAt != nil {
				sig.CompletedAt = *row.SubmittedAt
			}
		}
		return sig, nil

	default:
		return nil, ErrUnsupportedActivityType
	}
}

// loadPersistedQuality determines whether QUALITY is structurally applicable
// for this activity type (does it even have a grade/score concept), never
// whether a submission happens to be Excellent/Satisfactory/Poor - there is
// no existing grade -> tier banding convention anywhere in this codebase
// (see prior analysis §K1), and inventing thresholds here would be exactly
// the unapproved assumption the task asked to avoid. Until that policy is
// decided, every gradeable type correctly resolves to QualityNotEvaluated (0
// points, still counted toward the maximum) - a real, DB-grounded outcome,
// not a placeholder guess. Once a banding policy is approved, only this
// function needs to change (requirement #2 centralization).
func loadPersistedQuality(activityType string) (applicable bool, level QualityLevel) {
	switch activityType {
	case "assessment", "journal", "assignment", "peer_review":
		return true, QualityNotEvaluated
	default:
		return false, QualityNotEvaluated // video/pdf/case_study/content have no grade concept
	}
}

// RecalculateActivityScore is the authoritative entry point for this phase:
// resolves every signal from persisted data, computes the breakdown via
// ComputeActivityScore (scoring.go), and upserts exactly one row into
// activity_scores keyed by (organization, participant, enrollment, activity)
// - recalculating and overwriting the authoritative row rather than
// incrementing anything (requirement #8), inside one transaction
// (requirement #7). Calling this twice with unchanged underlying data
// produces an identical stored row (requirement #6); calling it again after
// a regrade or a deadline change produces an updated row, never a duplicate.
//
// Requires the activity_scores table (api/internal/leaderboard/
// schema_activity_scores.go) to already exist - that schema is proposed but
// NOT yet applied (see Phase 2's report); this function will fail with a
// "relation does not exist" error until a developer wires
// InitActivityScoresSchema() into main.go and redeploys.
func RecalculateActivityScore(participantID, activityID uuid.UUID, calculatedAt time.Time) (*ScoreBreakdown, error) {
	ctxRow, err := loadActivityScoringContext(participantID, activityID)
	if err != nil {
		return nil, err
	}
	return recalculateWithContext(ctxRow, participantID, activityID, calculatedAt)
}

// recalculateWithContext is RecalculateActivityScore's body, factored out so
// TryRecalculateActivityScore (below) can reuse an already-loaded context
// instead of querying it twice - once to check the feature flag's org, once
// to actually score.
func recalculateWithContext(ctxRow *activityScoringContextRow, participantID, activityID uuid.UUID, calculatedAt time.Time) (*ScoreBreakdown, error) {
	engagement, err := loadEngagementSignal(participantID, activityID, ctxRow.ActivityType)
	if err != nil {
		return nil, err
	}

	deadline, err := resolveDeadline(ctxRow)
	if err != nil {
		return nil, err
	}

	qualityApplicable, qualityLevel := loadPersistedQuality(ctxRow.ActivityType)

	breakdown := ComputeActivityScore(ActivityScoringInput{
		Engagement:        engagement.Level,
		SpeedApplicable:   true, // excluded automatically when deadline is nil - see ScoreSpeed
		DeadlineAt:        deadline,
		CompletedAt:       engagement.CompletedAt,
		QualityApplicable: qualityApplicable,
		Quality:           qualityLevel,
	}, calculatedAt)

	if err := database.DB.Transaction(func(tx *gorm.DB) error {
		return tx.Exec(`
			INSERT INTO activity_scores (
				organization_id, participant_id, enrollment_id, program_id, cohort_id, activity_id,
				engagement_score, speed_score, quality_score, earned_total, maximum_total,
				calculation_reason, calculated_at, updated_at
			) VALUES (?::uuid, ?::uuid, ?::uuid, ?::uuid, ?::uuid, ?::uuid, ?, ?, ?, ?, ?, ?, ?, NOW())
			ON CONFLICT (organization_id, participant_id, enrollment_id, activity_id)
			DO UPDATE SET
				engagement_score   = EXCLUDED.engagement_score,
				speed_score        = EXCLUDED.speed_score,
				quality_score      = EXCLUDED.quality_score,
				earned_total       = EXCLUDED.earned_total,
				maximum_total      = EXCLUDED.maximum_total,
				calculation_reason = EXCLUDED.calculation_reason,
				calculated_at      = EXCLUDED.calculated_at,
				updated_at         = NOW()
		`, ctxRow.OrganizationID, participantID, ctxRow.EnrollmentID, ctxRow.ProgramID, ctxRow.CohortID, activityID,
			breakdown.EngagementScore, breakdown.SpeedScore, breakdown.QualityScore, breakdown.EarnedTotal, breakdown.MaximumTotal,
			breakdown.CalculationReason, breakdown.CalculatedAt).Error
	}); err != nil {
		return nil, err
	}

	return &breakdown, nil
}

// activityScoresFeatureFlag gates the new engagement/speed/quality model per
// organization.
//
// Deliberately DEFAULT-OFF - unlike internal/ai's orgFeatureEnabled (which
// defaults ON, appropriate for features that don't depend on a schema change
// still pending review), this feature depends on the activity_scores table,
// which is proposed but NOT yet applied to the shared dev database (see
// schema_activity_scores.go). Defaulting on would make every activity
// completion/submission across the whole platform start trying to write to
// a table that doesn't exist yet, the moment this code ships - before a
// developer has explicitly reviewed and applied the migration. An org must
// explicitly set this to true after the table exists.
const activityScoresFeatureFlag = "activity_scores_v2"

func activityScoresEnabled(orgID string) bool {
	if orgID == "" {
		return false
	}
	var val *bool
	if err := database.DB.Raw(`SELECT (feature_flags ->> ?)::boolean FROM organizations WHERE id = ?::uuid`, activityScoresFeatureFlag, orgID).Scan(&val).Error; err != nil {
		return false
	}
	return val != nil && *val
}

// TryRecalculateActivityScore is the best-effort, feature-flagged entry
// point live event call sites use. It NEVER returns an error and never
// blocks or fails the caller's actual action (progress save, assessment
// submission, text/file submission) on a scoring problem - the same
// "log and continue" convention already used for auxiliary side effects
// elsewhere in this codebase (e.g. sessions.endSessionService's
// coaching-engagement activation). It no-ops entirely for an activity type
// loadEngagementSignal doesn't recognize (ErrUnsupportedActivityType) - many
// callers of this function (e.g. submissions.submitService) handle activity
// types this scoring model doesn't cover yet (capstone, feedback_360,
// discussion-as-a-submission), and that must never surface as a failure.
func TryRecalculateActivityScore(participantID, activityID uuid.UUID) {
	ctxRow, err := loadActivityScoringContext(participantID, activityID)
	if err != nil {
		// Not enrolled, activity not found, or a transient DB error - never
		// surface this to the caller of the real action.
		return
	}
	if !activityScoresEnabled(ctxRow.OrganizationID) {
		return
	}
	if _, err := recalculateWithContext(ctxRow, participantID, activityID, time.Now()); err != nil {
		log.Printf("leaderboard: activity_scores_v2 recalculation failed participant=%s activity=%s: %v", participantID, activityID, err)
	}
}
