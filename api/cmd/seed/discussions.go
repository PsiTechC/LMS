package main

import "log"

type threadRef struct {
	ID string
}

// createThread posts a discussion thread as the given actor. Threads are
// stored per-cohort at the DB level (cohort_id is NOT NULL), but the
// program_id on every row lets the real UI's "program-wide" discussions view
// aggregate across a program's cohorts - so seeding one thread per cohort
// under a program is what makes that program-wide view show real content.
func (rt *runtime) createThread(actor *apiClient, programID, cohortID, title, body, category string) (*threadRef, error) {
	var out struct {
		ID string `json:"id"`
	}
	reqBody := map[string]any{
		"program_id": programID,
		"cohort_id":  cohortID,
		"title":      title,
		"body":       body,
		"category":   category,
	}
	if err := actor.post("/api/v1/discussions/threads", reqBody, &out); err != nil {
		return nil, err
	}
	log.Printf("  ✅ thread created: %s (%s)", title, out.ID)
	return &threadRef{ID: out.ID}, nil
}

func (rt *runtime) createReply(actor *apiClient, threadID, body string) error {
	return actor.post("/api/v1/discussions/threads/"+threadID+"/replies", map[string]any{"body": body}, nil)
}

// plainParticipantUserIDs filters a cohort's member list down to users whose
// role is exactly "participant" - cohorts also contain "participant_retailer"
// members (participantEmails() returns both), and that role has no
// discussions:create/reply permission by design (rbac.go
// participantRetailerAllow - discussions is a deliberately locked tab for
// retailers). Picking an arbitrary cohort member for a discussions call risks
// a 403 if it lands on a retailer.
func (rt *runtime) plainParticipantUserIDs(cohortName string) []string {
	out := make([]string, 0)
	for _, uid := range rt.cohortParticipantUserIDs(cohortName) {
		email := rt.userIDToEmail[uid]
		if p := rt.personaByEmail(email); p != nil && p.Role == "participant" {
			out = append(out, uid)
		}
	}
	return out
}

// buildDiscussions seeds a handful of realistic threads + replies across
// Program A's cohorts and Program D's new cohort, so the Discussions tab
// isn't empty and a program-wide view (aggregating every cohort under one
// program_id) shows genuine cross-cohort activity, not just one isolated
// thread.
func (rt *runtime) buildDiscussions(progA *programRef, cohortMidway *cohortRef, progD *programRef, cohortKickoff *cohortRef) error {
	log.Println("💬 building discussion threads + replies...")

	midwayParticipants := rt.plainParticipantUserIDs(cohortMidway.Name)
	if len(midwayParticipants) == 0 {
		return nil // enrollment step should have run first; nothing to do without participants
	}
	asMidwayParticipant, err := rt.loginAsUserID(midwayParticipants[0])
	if err != nil {
		return err
	}

	t1, err := rt.createThread(asMidwayParticipant, progA.ID, cohortMidway.ID,
		"How are you applying the influence tactics from Module 1?",
		"Just finished the classroom session on leading through influence. Curious what's actually landed with your teams so far - I tried the 'ask before telling' approach in my 1:1s this week and got some surprisingly honest pushback.",
		"discussion")
	if err != nil {
		return err
	}
	if err := rt.createReply(rt.faculty["chirag@psitech.co.in"], t1.ID,
		"Great to hear this is already showing up in your 1:1s. Pushback is actually a good sign - it means people trust you enough to be honest. Bring this example to the next classroom session."); err != nil {
		return err
	}
	if len(midwayParticipants) > 1 {
		asMidwayParticipant2, err := rt.loginAsUserID(midwayParticipants[1])
		if err != nil {
			return err
		}
		if err := rt.createReply(asMidwayParticipant2, t1.ID,
			"Same here - I used it in a project kickoff instead of a 1:1 and it slowed the meeting down but the plan we landed on was much better than what I'd have dictated."); err != nil {
			return err
		}
	}

	t2, err := rt.createThread(rt.faculty["rohit@psitech.co.in"], progA.ID, cohortMidway.ID,
		"Resources for the upcoming Decision Memo assignment",
		"A few of you asked for extra reading before the Decision Memo is due. I've attached the reference notes from the virtual session to the Content Library - worth a re-read if the cost-of-delay framework didn't fully click live.",
		"resource")
	if err != nil {
		return err
	}
	if err := rt.createReply(asMidwayParticipant, t2.ID, "Thanks - the reversibility test (one-way vs two-way doors) is the part I want to revisit before I write mine."); err != nil {
		return err
	}
	if err := rt.pm.post("/api/v1/discussions/threads/"+t2.ID+"/pin", nil, nil); err != nil {
		return err
	}

	// ── Program D - kickoff cohort: day-one intro thread ──
	kickoffParticipants := rt.plainParticipantUserIDs(cohortKickoff.Name)
	if len(kickoffParticipants) == 0 {
		return nil
	}
	asKickoffParticipant, err := rt.loginAsUserID(kickoffParticipants[0])
	if err != nil {
		return err
	}

	t3, err := rt.createThread(rt.faculty["sunita.rao@qa.psitech.co.in"], progD.ID, cohortKickoff.ID,
		"Welcome to Digital Transformation Leadership - introduce yourself!",
		"Program officially kicks off today. Before Thursday's live orientation, drop a quick intro here: your role, one system or process you think is overdue for a digital rethink, and what you're hoping to get out of the next 10 weeks.",
		"announcement")
	if err != nil {
		return err
	}
	if err := rt.createReply(asKickoffParticipant, t3.ID,
		"Excited for this one. My team is still running approvals over email and I'm hoping this program gives me the case to finally move us onto a proper workflow tool."); err != nil {
		return err
	}
	if len(kickoffParticipants) > 1 {
		asKickoffParticipant2, err := rt.loginAsUserID(kickoffParticipants[1])
		if err != nil {
			return err
		}
		if err := rt.createReply(asKickoffParticipant2, t3.ID,
			"Same boat, different tool - for us it's inventory tracking still on spreadsheets. Looking forward to the Data & Technology Fluency module in particular."); err != nil {
			return err
		}
	}

	log.Println("✅ discussions built: 3 threads, replies, 1 pinned")
	return nil
}
