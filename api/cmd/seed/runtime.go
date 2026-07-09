package main

import (
	"database/sql"
	"fmt"
	"log"
	"time"
)

// runtime carries shared state across the whole seeding sequence.
type runtime struct {
	db       *sql.DB
	apiBase  string
	orgID    string
	userIDs  map[string]string // email -> user_id
	personas []persona

	superadmin *apiClient
	pm         *apiClient
	faculty    map[string]*apiClient // email -> logged-in client
	coach      map[string]*apiClient

	progAActivities          progAActivityRefs
	progBActivities          progBActivityRefs
	progDActivities          progDActivityRefs
	progBCompletedSessionIDs []string

	// cohortMembers maps cohort name -> the user IDs enrolled into it by
	// enrollParticipants/exerciseCohortFormation, so later steps (session
	// scheduling, attendance, progress) can look up who belongs where without
	// re-querying the API.
	cohortMembers map[string][]string

	// userIDToEmail is the reverse of userIDs, since several steps only have a
	// user ID (from cohortMembers) but need to log in by email.
	userIDToEmail map[string]string
}

func (rt *runtime) cohortParticipantUserIDs(cohortName string) []string {
	return rt.cohortMembers[cohortName]
}

// loginAsUserID logs in as whichever persona owns this user ID. Used when a
// step only has a user ID (e.g. from cohortMembers) and needs to act as that
// participant (activity_progress must be driven by the participant themselves
// so completion_percent is computed server-side, per plan §6).
func (rt *runtime) loginAsUserID(userID string) (*apiClient, error) {
	email, ok := rt.userIDToEmail[userID]
	if !ok {
		return nil, fmt.Errorf("no email known for user id %s", userID)
	}
	return rt.loginAs(email)
}

func (rt *runtime) personaByRole(role string) *persona {
	for i := range rt.personas {
		if rt.personas[i].Role == role {
			return &rt.personas[i]
		}
	}
	return nil
}

func (rt *runtime) personaByEmail(email string) *persona {
	for i := range rt.personas {
		if rt.personas[i].Email == email {
			return &rt.personas[i]
		}
	}
	return nil
}

func (rt *runtime) loginAs(email string) (*apiClient, error) {
	c := newAPIClient(rt.apiBase)
	if err := c.login(email, seedPassword); err != nil {
		return nil, err
	}
	return c, nil
}

// run executes the full sequence per SEED_DATA_PLAN.md §6, in FK order.
func (rt *runtime) run() error {
	var err error

	log.Println("🔑 logging in as superadmin (tejas@psitech.co.in)...")
	rt.superadmin, err = rt.loginAs("tejas@psitech.co.in")
	if err != nil {
		return fmt.Errorf("superadmin login: %w", err)
	}

	log.Println("🔑 logging in as program manager (vaishnavi@psitech.co.in)...")
	rt.pm, err = rt.loginAs("vaishnavi@psitech.co.in")
	if err != nil {
		return fmt.Errorf("PM login: %w", err)
	}

	rt.faculty = map[string]*apiClient{}
	for _, email := range []string{"rohit@psitech.co.in", "chirag@psitech.co.in", "arjun.mehta@qa.psitech.co.in", "sunita.rao@qa.psitech.co.in"} {
		log.Printf("🔑 logging in as faculty (%s)...", email)
		c, err := rt.loginAs(email)
		if err != nil {
			return fmt.Errorf("faculty login %s: %w", email, err)
		}
		rt.faculty[email] = c
	}

	rt.coach = map[string]*apiClient{}
	for _, email := range []string{"akanksha@psitech.co.in", "kabir.singh@qa.psitech.co.in", "rohit@psitech.co.in"} {
		log.Printf("🔑 logging in as coach (%s)...", email)
		c, err := rt.loginAs(email)
		if err != nil {
			return fmt.Errorf("coach login %s: %w", email, err)
		}
		rt.coach[email] = c
	}

	// ── Programs A, B, C, D ─────────────────────────────────────────────
	progA, err := rt.buildProgramA() // "Emerging Leaders" — active, richest cohort mix
	if err != nil {
		return fmt.Errorf("program A: %w", err)
	}
	progB, err := rt.buildProgramB() // "Executive Coaching Track" — active, completed cohort
	if err != nil {
		return fmt.Errorf("program B: %w", err)
	}
	if err := rt.buildProgramC(); err != nil { // "New Manager Bootcamp" — draft, unpublished
		return fmt.Errorf("program C: %w", err)
	}
	progD, err := rt.buildProgramD() // "Digital Transformation Leadership" — active, starts TODAY
	if err != nil {
		return fmt.Errorf("program D: %w", err)
	}

	// akanksha's coach row is scoped to Program A specifically (plan: exercise
	// both org-wide and program-scoped coach eligibility) — resolve it now that
	// progA.ID is known, since addCoachRow ran before any program existed.
	if err := rescopeCoachProgram(rt.db, rt.orgID, rt.userIDs["akanksha@psitech.co.in"], progA.ID); err != nil {
		return fmt.Errorf("rescope akanksha's coach row: %w", err)
	}

	// ── Cohorts under Program A: not-started, mid-way (richest), + manual cohort ──
	cohortNotStarted, err := rt.createCohort(rt.pm, progA.ID, "Cohort A1 — Not Started", daysFromNow(14), daysFromNow(14+7*12))
	if err != nil {
		return fmt.Errorf("cohort A1: %w", err)
	}
	cohortMidway, err := rt.createCohort(rt.pm, progA.ID, "Cohort A2 — Mid-way", daysFromNow(-42), daysFromNow(42))
	if err != nil {
		return fmt.Errorf("cohort A2: %w", err)
	}
	cohortManual, err := rt.createCohort(rt.pm, progA.ID, "Cohort A3 — Manual Formation", daysFromNow(-7), daysFromNow(7*11))
	if err != nil {
		return fmt.Errorf("cohort A3: %w", err)
	}

	// ── Cohort under Program B: fully completed ──
	cohortCompleted, err := rt.createCohort(rt.pm, progB.ID, "Cohort B1 — Completed", daysFromNow(-98), daysFromNow(-7))
	if err != nil {
		return fmt.Errorf("cohort B1: %w", err)
	}

	// ── Cohort under Program D: starts today, nothing completed yet ──
	cohortKickoff, err := rt.createCohort(rt.pm, progD.ID, "Cohort D1 — Kickoff", daysFromNow(0), daysFromNow(7*10))
	if err != nil {
		return fmt.Errorf("cohort D1: %w", err)
	}

	// ── Enroll participants across cohorts ──
	if err := rt.enrollParticipants(cohortNotStarted, cohortMidway, cohortCompleted); err != nil {
		return fmt.Errorf("enrollment: %w", err)
	}

	// Program D's kickoff cohort reuses the same roster (a person can validly
	// belong to more than one program at once, same as the completed cohort).
	if err := rt.enrollAllParticipants(cohortKickoff); err != nil {
		return fmt.Errorf("cohort D1 enrollment: %w", err)
	}

	// ── Cohort formation mechanisms: manual enrollment + group shuffle for A3 ──
	if err := rt.exerciseCohortFormation(cohortManual); err != nil {
		return fmt.Errorf("cohort formation: %w", err)
	}

	// ── Sessions, attendance, activity progress for the mid-way cohort ──
	if err := rt.buildMidwayCohortActivity(progA, cohortMidway); err != nil {
		return fmt.Errorf("midway cohort activity: %w", err)
	}

	// ── Fully completed cohort: all sessions completed, 100% progress ──
	if err := rt.buildCompletedCohortActivity(progB, cohortCompleted); err != nil {
		return fmt.Errorf("completed cohort activity: %w", err)
	}

	// ── Coaching engagements (individual + group, org-wide + program-scoped coach) ──
	if err := rt.buildCoachingEngagements(progA.ID, cohortMidway); err != nil {
		return fmt.Errorf("coaching engagements: %w", err)
	}

	// ── Kickoff cohort activity: Program D starts today, nothing done yet ──
	if err := rt.buildKickoffCohortActivity(progD, cohortKickoff); err != nil {
		return fmt.Errorf("kickoff cohort activity: %w", err)
	}

	// ── Content library: real files uploaded + attached to pre/post-work ──
	if err := rt.buildContentLibrary(progA, progD); err != nil {
		return fmt.Errorf("content library: %w", err)
	}

	// ── Discussions: threads + replies across Program A and Program D cohorts ──
	if err := rt.buildDiscussions(progA, cohortMidway, progD, cohortKickoff); err != nil {
		return fmt.Errorf("discussions: %w", err)
	}

	return nil
}

func daysFromNow(days int) time.Time {
	return time.Now().AddDate(0, 0, days)
}

func ymd(t time.Time) string {
	return t.Format("2006-01-02")
}
