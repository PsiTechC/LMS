package main

import (
	"fmt"
	"log"
)

type engagementRef struct {
	ID string
}

// createCoachingEngagement uses the admin engagement endpoint — confirmed to
// NOT email the assigned coach (plan §7). coachID must already be eligible
// (a `coaches` row, or users.role='faculty' — countOrgCoach's OR clause).
func (rt *runtime) createCoachingEngagement(programID string, cohortID *string, coachID, name, assignmentType string, participantIDs []string, totalSessions int) (*engagementRef, error) {
	var out struct {
		ID string `json:"id"`
	}
	body := map[string]any{
		"org_id":          rt.orgID,
		"program_id":      programID,
		"cohort_id":       cohortID,
		"coach_id":        coachID,
		"assignment_type": assignmentType, // individual | group
		"name":            name,
		"participant_ids": participantIDs,
		"start_date":      ymd(daysFromNow(-30)),
		"frequency":       "Bi-weekly",
		"total_sessions":  totalSessions,
		"goals":           []string{"Build executive presence", "Strengthen delegation habits"},
	}
	if err := rt.pm.post("/api/v1/coaching/admin/engagements", body, &out); err != nil {
		return nil, err
	}
	log.Printf("✅ coaching engagement created: %s (%s, coach=%s, type=%s)", name, out.ID, coachID, assignmentType)
	return &engagementRef{ID: out.ID}, nil
}

func (rt *runtime) createCoachGoal(coachClient *apiClient, participantID, title string) error {
	return coachClient.post("/api/v1/coaching/goals", map[string]any{
		"participant_id": participantID,
		"title":          title,
		"pm_can_view":    true,
	}, nil)
}

// buildCoachingEngagements exercises: an individual engagement with the
// org-wide dedicated coach (akanksha, program-scoped per the rescope earlier),
// a group engagement with the dual faculty+coach (rohit), and a third
// individual engagement with the fake bulk coach (kabir) — covering both
// individual/group assignment types and both org-wide/program-scoped coach
// eligibility (plan intro requirement).
func (rt *runtime) buildCoachingEngagements(programID string, midwayCohort *cohortRef) error {
	log.Println("🧑‍🏫 building coaching engagements...")

	participants := rt.cohortParticipantUserIDs(midwayCohort.Name)
	if len(participants) < 3 {
		return fmt.Errorf("need at least 3 participants in %s for coaching engagements, got %d", midwayCohort.Name, len(participants))
	}

	akankshaID := rt.userIDs["akanksha@psitech.co.in"]
	rohitID := rt.userIDs["rohit@psitech.co.in"]
	kabirID := rt.userIDs["kabir.singh@qa.psitech.co.in"]
	cohortID := midwayCohort.ID

	eng1, err := rt.createCoachingEngagement(programID, &cohortID, akankshaID, "Akanksha ↔ "+midwayCohort.Name+" (Individual)", "individual", []string{participants[0]}, 6)
	if err != nil {
		return err
	}
	if err := rt.createCoachGoal(rt.coach["akanksha@psitech.co.in"], participants[0], "Improve stakeholder influence in cross-functional projects"); err != nil {
		return err
	}

	eng2, err := rt.createCoachingEngagement(programID, &cohortID, rohitID, "Rohit ↔ "+midwayCohort.Name+" (Group)", "group", participants[1:3], 8)
	if err != nil {
		return err
	}

	eng3, err := rt.createCoachingEngagement(programID, nil, kabirID, "Kabir — Org-wide Coaching", "individual", []string{participants[len(participants)-1]}, 6)
	if err != nil {
		return err
	}

	// completed_sessions sync (plan §5/§8): confirmed no API endpoint ever
	// writes this column, yet 4 frontend screens read it. eng1 gets 2 completed
	// sessions manually synced (no class_sessions were scheduled against these
	// engagements in this seed pass, so this directly sets the counter rather
	// than counting real rows — acceptable since the goal is non-zero, readable
	// numbers on those 4 screens, not perfect session-level traceability here).
	if err := syncCompletedSessions(rt.db, eng1.ID, 2); err != nil {
		return fmt.Errorf("sync completed_sessions for eng1: %w", err)
	}
	if err := syncCompletedSessions(rt.db, eng2.ID, 3); err != nil {
		return fmt.Errorf("sync completed_sessions for eng2: %w", err)
	}
	if err := syncCompletedSessions(rt.db, eng3.ID, 1); err != nil {
		return fmt.Errorf("sync completed_sessions for eng3: %w", err)
	}

	// Program B's coaching engagement (created implicitly via activity, not the
	// admin-engagement endpoint) doesn't exist as a coaching_engagements row at
	// all — Program B used plain class_sessions against a coaching-type
	// activity, not the coaching module's engagement flow. That's an
	// intentional scope choice: Program B demonstrates the "sessions against a
	// coaching activity" path, Program A demonstrates the "coaching_engagements"
	// admin-assignment path — both real, distinct flows in this codebase.
	log.Println("✅ coaching engagements built (3 total: 2 individual, 1 group)")
	return nil
}
