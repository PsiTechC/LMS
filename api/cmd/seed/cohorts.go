package main

import (
	"log"
	"time"
)

type cohortRef struct {
	ID   string
	Name string
}

func (rt *runtime) createCohort(actor *apiClient, programID, name string, start, end time.Time) (*cohortRef, error) {
	var out struct {
		ID string `json:"id"`
	}
	body := map[string]any{
		"program_id": programID,
		"name":       name,
		"start_date": ymd(start),
		"end_date":   ymd(end),
		"max_seats":  50,
	}
	if err := actor.post("/api/v1/cohorts?org_id="+rt.orgID, body, &out); err != nil {
		return nil, err
	}
	log.Printf("✅ cohort created: %s (%s), %s → %s", name, out.ID, ymd(start), ymd(end))
	return &cohortRef{ID: out.ID, Name: name}, nil
}

// enrollParticipant enrolls one existing user into a cohort — confirmed
// email-safe (plan §6/§7, zero email import in the cohorts module) — and
// records the membership in rt.cohortMembers so later steps (session
// scheduling, attendance, progress) can look up who belongs where.
func (rt *runtime) enrollParticipant(actor *apiClient, cohort *cohortRef, userID, role string) error {
	body := map[string]any{"user_id": userID, "role": role}
	if err := actor.post("/api/v1/cohorts/"+cohort.ID+"/participants", body, nil); err != nil {
		return err
	}
	rt.cohortMembers[cohort.Name] = append(rt.cohortMembers[cohort.Name], userID)
	return nil
}

func (rt *runtime) participantEmails() []string {
	var out []string
	for _, p := range rt.personas {
		if p.Role == "participant" || p.Role == "participant_retailer" {
			out = append(out, p.Email)
		}
	}
	return out
}

// enrollParticipants spreads every seeded participant persona across the
// cohorts, per the plan's timeline (§3). The roster is split into thirds for
// Program A's not-started / mid-way / manual-formation cohorts (the last third
// is deliberately left unenrolled here — exerciseCohortFormation enrolls them
// via the manual-formation path instead, to keep that path genuinely separate
// from this bulk enrollment). Every participant is additionally enrolled into
// Program B's completed cohort, since a person can validly belong to more than
// one program at once.
func (rt *runtime) enrollParticipants(notStarted, midway, completedCohort *cohortRef) error {
	log.Println("👥 enrolling participants across cohorts...")

	emails := rt.participantEmails()
	n := len(emails)
	thirdsCut1, thirdsCut2 := n/3, 2*n/3

	for i, email := range emails {
		userID := rt.userIDs[email]
		switch {
		case i < thirdsCut1:
			if err := rt.enrollParticipant(rt.pm, notStarted, userID, "participant"); err != nil {
				return err
			}
		case i < thirdsCut2:
			if err := rt.enrollParticipant(rt.pm, midway, userID, "participant"); err != nil {
				return err
			}
			// else: left for exerciseCohortFormation's manual-enrollment step.
		}
		if err := rt.enrollParticipant(rt.pm, completedCohort, userID, "participant"); err != nil {
			return err
		}
	}
	log.Printf("✅ enrolled %d participants (not-started/midway split; all also in completed cohort)", n)
	return nil
}

// enrollAllParticipants enrolls every seeded participant persona into a single
// cohort — used for Program D's kickoff cohort, which (unlike Program A's
// deliberately-split not-started/mid-way/manual roster) doesn't need a
// three-way split since it's the only cohort in its program.
func (rt *runtime) enrollAllParticipants(cohort *cohortRef) error {
	log.Printf("👥 enrolling all participants into %s...", cohort.Name)
	for _, email := range rt.participantEmails() {
		if err := rt.enrollParticipant(rt.pm, cohort, rt.userIDs[email], "participant"); err != nil {
			return err
		}
	}
	log.Printf("✅ enrolled %d participants into %s", len(rt.participantEmails()), cohort.Name)
	return nil
}

// exerciseCohortFormation drives the two real, distinct formation mechanisms
// confirmed to exist (plan §6): manual per-participant enrollment into cohort
// A3, followed by the cohort_group-level shuffle within that cohort. It
// deliberately does NOT call POST /cohorts/distribute — see the comment below.
func (rt *runtime) exerciseCohortFormation(manualCohort *cohortRef) error {
	log.Println("🎲 exercising cohort formation mechanisms (manual enrollment + group shuffle)...")

	emails := rt.participantEmails()
	n := len(emails)
	thirdsCut2 := 2 * n / 3
	for i := thirdsCut2; i < n; i++ {
		if err := rt.enrollParticipant(rt.pm, manualCohort, rt.userIDs[emails[i]], "participant"); err != nil {
			return err
		}
	}
	log.Printf("✅ manually enrolled %d participants into %s", n-thirdsCut2, manualCohort.Name)

	// data is a bare array of GroupDTO, not {"groups": [...]}.
	var groupsOut []struct {
		ID string `json:"id"`
	}
	if err := rt.pm.post("/api/v1/cohorts/"+manualCohort.ID+"/groups", map[string]any{
		"count":       2,
		"name_prefix": "Coaching Circle",
		"group_type":  "coaching_circle",
	}, &groupsOut); err != nil {
		return err
	}
	log.Printf("✅ cohort_groups formed via shuffle: %d groups in %s", len(groupsOut), manualCohort.Name)

	// Deliberately NOT calling /cohorts/distribute here: it reshuffles ALL
	// currently-enrolled participants across EVERY cohort of the program
	// (randomDistributeService withdraws everyone from every cohort in the
	// program, then round-robins them back) — running it against Program A
	// would scramble the deliberately-built not-started/mid-way/manual timeline
	// distinction this seed exists to demonstrate. Proving the endpoint works
	// isn't worth destroying that. The real UI wizard's "Randomize" button does
	// its shuffle client-side and commits via manual transfer calls anyway — it
	// does NOT call this endpoint — so calling it here would prove less than it
	// costs. See plan §6/§9. If you want to see it in action, call it by hand
	// against a disposable program you don't need to preserve.
	return nil
}
