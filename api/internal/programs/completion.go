package programs

import (
	"time"

	"github.com/google/uuid"
	"github.com/xa-lms/api/pkg/database"
)

// Participant-only prerequisite locking: a post-slot activity in a module is
// locked until every pre-slot sibling in the SAME module is complete, and a
// phase (after the first) is locked until the prior phase is fully complete
// AND its own start date has arrived. Both gates need one thing this
// codebase didn't have: a single "is this activity complete for this
// participant" signal that works across every activity type - completion is
// otherwise fragmented across four independent tables owned by four
// different modules (survey_completions, submissions, assessment_attempts,
// activity_progress). This file reads all four directly via raw SQL - the
// established "modules never import each other's Go package, read shared
// tables directly" convention (see surveys/repository.go, assessments/repository.go).

// activityCompletionMap returns activityID -> completed for every activity
// in a program, for one participant. "Completed" per type:
//   - survey (incl. Kirkpatrick L1-L4): a survey_completions row exists.
//   - assessment (quiz-backed) + any activity with an attached knowledge
//     check: at least one assessment_attempts row exists - NOT "passed" and
//     NOT "every allowed attempt used" (assessments' own stricter internal
//     "completed" status), so a gate unblocks as soon as the participant has
//     engaged rather than trapping them behind quiz performance.
//   - everything else that produces a submissions row (journal, assignment,
//     peer_review, capstone, feedback_360, discussion, non-quiz assessment):
//     a submissions row exists.
//   - video/pdf/case_study/content: activity_progress.status = 'completed'
//     (self-reported by the content viewer - the existing signal for these
//     types, not a new enforcement).
//   - live_session/coaching: always treated as satisfied. There is no
//     reliable activity_id-keyed attendance signal for these today (class
//     sessions are only optionally linked back to an activity, and two
//     separate attendance tables exist for different check-in flows) -
//     permanently blocking downstream unlocks on a type this codebase can't
//     yet verify would be worse than not gating on it at all.
func activityCompletionMap(participantID, programID uuid.UUID) (map[string]bool, error) {
	out := map[string]bool{}

	type row struct{ ActivityID string }
	var rows []row

	err := database.DB.Raw(`
		SELECT sc.activity_id::text AS activity_id
		FROM survey_completions sc
		JOIN activities a ON a.id = sc.activity_id
		JOIN program_phases pp ON pp.id = a.phase_id
		WHERE pp.program_id = ? AND sc.participant_id = ?
	`, programID, participantID).Scan(&rows).Error
	if err != nil {
		return nil, err
	}
	for _, r := range rows {
		out[r.ActivityID] = true
	}

	rows = nil
	err = database.DB.Raw(`
		SELECT s.activity_id::text AS activity_id
		FROM submissions s
		JOIN activities a ON a.id = s.activity_id
		JOIN program_phases pp ON pp.id = a.phase_id
		WHERE pp.program_id = ? AND s.participant_id = ?
	`, programID, participantID).Scan(&rows).Error
	if err != nil {
		return nil, err
	}
	for _, r := range rows {
		out[r.ActivityID] = true
	}

	rows = nil
	err = database.DB.Raw(`
		SELECT DISTINCT aa.activity_id::text AS activity_id
		FROM assessment_attempts aa
		JOIN activities a ON a.id = aa.activity_id
		JOIN program_phases pp ON pp.id = a.phase_id
		WHERE pp.program_id = ? AND aa.participant_id = ?
	`, programID, participantID).Scan(&rows).Error
	if err != nil {
		return nil, err
	}
	for _, r := range rows {
		out[r.ActivityID] = true
	}

	rows = nil
	err = database.DB.Raw(`
		SELECT ap.activity_id::text AS activity_id
		FROM activity_progress ap
		JOIN activities a ON a.id = ap.activity_id
		JOIN program_phases pp ON pp.id = a.phase_id
		WHERE pp.program_id = ? AND ap.user_id = ? AND ap.status = 'completed'
	`, programID, participantID).Scan(&rows).Error
	if err != nil {
		return nil, err
	}
	for _, r := range rows {
		out[r.ActivityID] = true
	}

	// live_session/coaching: no reliable per-activity signal - always satisfied.
	var liveIDs []string
	err = database.DB.Raw(`
		SELECT a.id::text
		FROM activities a
		JOIN program_phases pp ON pp.id = a.phase_id
		WHERE pp.program_id = ? AND a.type IN ('live_session', 'coaching')
	`, programID).Scan(&liveIDs).Error
	if err != nil {
		return nil, err
	}
	for _, id := range liveIDs {
		out[id] = true
	}

	return out, nil
}

// cohortStartForParticipant returns the start_date of the cohort linking this
// participant to this program - the same anchor activity/phase open dates
// are computed from elsewhere (see surveys/repository.go's identically-named
// pattern). Nil when the participant has no active enrollment or the cohort
// has no start date set.
func cohortStartForParticipant(participantID, programID uuid.UUID) (*time.Time, error) {
	// Scan into a one-field struct, not a bare *time.Time - when a row IS
	// returned but start_date is NULL (a cohort with no start date set yet),
	// database/sql's scalar-destination Scan fails with "unsupported Scan,
	// storing driver.Value type <nil> into type *time.Time" instead of
	// leaving the pointer nil. Struct-field binding (GORM's normal path)
	// handles a NULL column correctly. Same class of fix as surveys'
	// getAssetMeta (see its doc comment for the general pattern).
	var row struct{ StartDate *time.Time }
	err := database.DB.Raw(`
		SELECT c.start_date AS start_date
		FROM enrollments e
		JOIN cohorts c ON c.id = e.cohort_id
		WHERE e.user_id = ? AND c.program_id = ? AND e.role = 'participant' AND e.status <> 'withdrawn'
		ORDER BY e.enrolled_at DESC
		LIMIT 1
	`, participantID, programID).Scan(&row).Error
	return row.StartDate, err
}

// applyParticipantLocks mutates detail in place, setting Locked/LockedReason
// on post-slot activities (module gate) and phases (phase gate) for this
// participant's view. Only called from the participant path of getProgramService.
func applyParticipantLocks(detail *ProgramDetailDTO, participantID uuid.UUID) {
	programID, err := uuid.Parse(detail.ID)
	if err != nil {
		return
	}
	completion, err := activityCompletionMap(participantID, programID)
	if err != nil {
		return // best-effort - leave everything unlocked rather than fail the whole page
	}
	cohortStart, _ := cohortStartForParticipant(participantID, programID)
	now := time.Now()

	// ── Stamp the real, cross-type Completed flag on EVERY activity (not
	// just the ones involved in gating) - this is the one signal Timeline/
	// Surveys/Assessments should all read instead of each independently
	// (and inconsistently) re-deriving "done" from whichever single table
	// they happen to already have on hand. ──
	for pi := range detail.Phases {
		for ai := range detail.Phases[pi].Activities {
			a := &detail.Phases[pi].Activities[ai]
			a.Completed = completion[a.ID]
		}
		for mi := range detail.Phases[pi].Modules {
			m := &detail.Phases[pi].Modules[mi]
			for ai := range m.Pre {
				m.Pre[ai].Completed = completion[m.Pre[ai].ID]
			}
			for ai := range m.Post {
				m.Post[ai].Completed = completion[m.Post[ai].ID]
			}
		}
	}

	// ── Module gate: post-slot activities locked until every pre-slot
	// sibling in the same module is complete. ──
	for pi := range detail.Phases {
		for mi := range detail.Phases[pi].Modules {
			m := &detail.Phases[pi].Modules[mi]
			// Only MANDATORY pre-work gates the module - an optional item
			// (is_mandatory=false), or one that's broken/unreachable for any
			// reason, must never be able to permanently lock everyone out of
			// the module's post-work. Modules with no mandatory pre-work are
			// trivially never gated, same as modules with no pre-work at all.
			preDone := true
			for _, a := range m.Pre {
				if a.IsMandatory && !completion[a.ID] {
					preDone = false
					break
				}
			}
			if preDone {
				continue
			}
			for ai := range m.Post {
				m.Post[ai].Locked = true
				m.Post[ai].LockedReason = "Complete this module's required pre-work first"
			}
		}
	}

	// ── Phase gate: phase i (i>0) locked until phase i-1's MANDATORY
	// activities are complete AND phase i's own start date has arrived. Same
	// "only mandatory gates" rule as the module gate above - one optional or
	// broken activity must never be able to permanently block every later
	// phase for a participant. ──
	phaseComplete := func(ph *PhaseDTO) bool {
		for _, a := range ph.Activities {
			if a.IsMandatory && !completion[a.ID] {
				return false
			}
		}
		for _, m := range ph.Modules {
			for _, a := range m.Pre {
				if a.IsMandatory && !completion[a.ID] {
					return false
				}
			}
			for _, a := range m.Post {
				if a.IsMandatory && !completion[a.ID] {
					return false
				}
			}
		}
		return true
	}
	for i := 1; i < len(detail.Phases); i++ {
		prior := &detail.Phases[i-1]
		cur := &detail.Phases[i]

		priorDone := phaseComplete(prior)
		var opensYet bool
		var opensLabel string
		if cohortStart != nil {
			openDate := cohortStart.AddDate(0, 0, cur.StartDay)
			opensYet = !now.Before(openDate)
			opensLabel = openDate.Format("2006-01-02")
		} else {
			// No cohort start known - don't block on a date this participant
			// has no anchor for, only on prior-phase completion.
			opensYet = true
		}

		if priorDone && opensYet {
			continue
		}
		cur.Locked = true
		switch {
		case !priorDone && !opensYet:
			cur.LockedReason = "Finish \"" + prior.Title + "\" first - opens " + opensLabel
		case !priorDone:
			cur.LockedReason = "Finish \"" + prior.Title + "\" first"
		default:
			cur.LockedReason = "Opens " + opensLabel
		}
	}
}
