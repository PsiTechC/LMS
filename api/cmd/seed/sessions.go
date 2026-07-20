package main

import (
	"fmt"
	"log"
	"time"
)

type sessionRef struct {
	ID string
}

// scheduleSession uses the CANONICAL PM-driven route (plan §6):
// POST /programs/:id/activities/:actId/sessions - NOT the faculty self-service
// POST /sessions route, which forces faculty_id=callerID and doesn't match the
// PM-schedules/faculty-reads model this system is designed around.
func (rt *runtime) scheduleSession(programID, activityID, cohortID, facultyID, title, sessionType string, scheduledAt time.Time, durationMins int) (*sessionRef, error) {
	var out struct {
		ID string `json:"id"`
	}
	body := map[string]any{
		"program_id":    programID,
		"cohort_id":     cohortID,
		"faculty_id":    facultyID,
		"title":         title,
		"session_type":  sessionType,
		"scheduled_at":  scheduledAt.Format(time.RFC3339),
		"duration_mins": durationMins,
	}
	if err := rt.pm.post(fmt.Sprintf("/api/v1/programs/%s/activities/%s/sessions", programID, activityID), body, &out); err != nil {
		return nil, err
	}
	log.Printf("  ✅ session scheduled: %s (%s) at %s", title, out.ID, scheduledAt.Format("2006-01-02"))
	return &sessionRef{ID: out.ID}, nil
}

// markSessionCompleted uses the PATCH status shortcut - confirmed to skip
// start/end lifecycle validation entirely, safe for backdating past sessions
// (plan §6).
func (rt *runtime) markSessionCompleted(actor *apiClient, sessionID string) error {
	return actor.patch("/api/v1/sessions/"+sessionID, map[string]any{"status": "completed"}, nil)
}

// markAttendance has NO session-status precondition (confirmed, plan §6) - safe
// to call regardless of the session's current status.
func (rt *runtime) markAttendance(actor *apiClient, sessionID string, entries []map[string]string) error {
	body := map[string]any{"entries": entries}
	return actor.post("/api/v1/sessions/"+sessionID+"/attendance", body, nil)
}

func (rt *runtime) markActionItemDone(actor *apiClient, sessionID, participantID, description string) error {
	var out struct {
		ID string `json:"id"`
	}
	if err := actor.post("/api/v1/sessions/"+sessionID+"/action-items", map[string]any{
		"participant_id": participantID,
		"description":    description,
	}, &out); err != nil {
		return err
	}
	return actor.patch("/api/v1/sessions/"+sessionID+"/action-items/"+out.ID, map[string]any{"status": "completed"}, nil)
}

// upsertProgress drives activity_progress organically as the participant
// persona, so completion_percent is computed server-side (plan §6) rather than
// hand-set via the cohorts PATCH shortcut (which gets silently overwritten the
// next time real progress is recorded anyway).
func (rt *runtime) upsertProgress(participantClient *apiClient, activityID string, progressPct int, completed bool) error {
	body := map[string]any{
		"activity_id":  activityID,
		"progress_pct": progressPct,
		"completed":    completed,
	}
	return participantClient.post("/api/v1/activity_progress", body, nil)
}

// buildMidwayCohortActivity gives Cohort A2 a real mix of past-completed and
// future-scheduled sessions, attendance, resolved action items, and partial
// activity_progress - the richest cohort in the timeline (plan §3).
func (rt *runtime) buildMidwayCohortActivity(prog *programRef, cohort *cohortRef) error {
	log.Println("🗓  building mid-way cohort activity (Cohort A2)...")

	facultyChirag := rt.userIDs["chirag@psitech.co.in"]
	facultyRohit := rt.userIDs["rohit@psitech.co.in"]

	participants := rt.cohortParticipantUserIDs("Cohort A2 - Mid-way")
	if len(participants) == 0 {
		return fmt.Errorf("no participants resolved for cohort A2 - enrollment must run before session activity")
	}

	// Past, completed classroom session (week -5).
	sess1, err := rt.scheduleSession(prog.ID, rt.progAActivities.LiveClassroom.ID, cohort.ID, facultyChirag,
		"Classroom: Leading Through Influence", "classroom", daysFromNow(-35), 180)
	if err != nil {
		return err
	}
	if err := rt.markSessionCompleted(rt.faculty["chirag@psitech.co.in"], sess1.ID); err != nil {
		return err
	}
	if err := rt.markAttendance(rt.faculty["chirag@psitech.co.in"], sess1.ID, attendanceFor(participants, "present")); err != nil {
		return err
	}

	// Past, completed virtual session (week -3).
	sess2, err := rt.scheduleSession(prog.ID, rt.progAActivities.VirtualLive.ID, cohort.ID, facultyRohit,
		"Virtual Session: Data-Driven Decisions", "classroom", daysFromNow(-21), 90)
	if err != nil {
		return err
	}
	if err := rt.markSessionCompleted(rt.faculty["rohit@psitech.co.in"], sess2.ID); err != nil {
		return err
	}
	if err := rt.markAttendance(rt.faculty["rohit@psitech.co.in"], sess2.ID, mixedAttendance(participants)); err != nil {
		return err
	}
	if err := rt.markActionItemDone(rt.faculty["rohit@psitech.co.in"], sess2.ID, participants[0], "Submit decision memo by Friday"); err != nil {
		return err
	}

	// Past coaching session (week -1) + a coaching_notes row.
	coachingSess, err := rt.scheduleSession(prog.ID, rt.progAActivities.Coaching.ID, cohort.ID, facultyRohit,
		"Coaching Session 1", "coaching_individual", daysFromNow(-7), 45)
	if err != nil {
		return err
	}
	if err := rt.markSessionCompleted(rt.faculty["rohit@psitech.co.in"], coachingSess.ID); err != nil {
		return err
	}
	if err := rt.coach["rohit@psitech.co.in"].post("/api/v1/coaching/coach/notes", map[string]any{
		"session_id":     coachingSess.ID,
		"participant_id": participants[0],
		"notes":          "Good progress on influence tactics from the classroom session. Discussed applying the framework to the upcoming reorg conversation.",
	}, nil); err != nil {
		return err
	}

	// Upcoming, still-scheduled session (today/+1wk) - deliberately left
	// status="scheduled" (the create default), no attendance yet.
	if _, err := rt.scheduleSession(prog.ID, rt.progAActivities.OrientVideo.ID, cohort.ID, facultyChirag,
		"Upcoming Check-in Session", "classroom", daysFromNow(3), 60); err != nil {
		return err
	}

	// Partial activity_progress: orientation activities completed for everyone,
	// the case-study pre-work partially done for a subset - driven as each
	// participant, so completion_percent is computed by the real service layer.
	for i, uid := range participants {
		client, err := rt.loginAsUserID(uid)
		if err != nil {
			return err
		}
		if err := rt.upsertProgress(client, rt.progAActivities.OrientVideo.ID, 100, true); err != nil {
			return err
		}
		if i%2 == 0 {
			if err := rt.upsertProgress(client, rt.progAActivities.VirtualLive.ID, 60, false); err != nil {
				return err
			}
		}
	}
	log.Println("✅ mid-way cohort activity built")
	return nil
}

// buildCompletedCohortActivity gives Cohort B1 a fully-finished lifecycle: every
// session completed, full attendance, 100% progress for everyone.
func (rt *runtime) buildCompletedCohortActivity(prog *programRef, cohort *cohortRef) error {
	log.Println("🗓  building completed cohort activity (Cohort B1)...")
	facultyRohit := rt.userIDs["rohit@psitech.co.in"]

	participants := rt.cohortParticipantUserIDs("Cohort B1 - Completed")
	if len(participants) == 0 {
		return fmt.Errorf("no participants resolved for cohort B1")
	}

	var completedSessionIDs []string
	weeksAgo := []int{-90, -75, -60, -45, -30, -15}
	for i, w := range weeksAgo {
		sess, err := rt.scheduleSession(prog.ID, rt.progBActivities.Coaching.ID, cohort.ID, facultyRohit,
			fmt.Sprintf("Executive Coaching Session %d", i+1), "coaching_individual", daysFromNow(w), 60)
		if err != nil {
			return err
		}
		if err := rt.markSessionCompleted(rt.faculty["rohit@psitech.co.in"], sess.ID); err != nil {
			return err
		}
		if err := rt.markAttendance(rt.faculty["rohit@psitech.co.in"], sess.ID, attendanceFor(participants, "present")); err != nil {
			return err
		}
		completedSessionIDs = append(completedSessionIDs, sess.ID)
	}

	for _, uid := range participants {
		client, err := rt.loginAsUserID(uid)
		if err != nil {
			return err
		}
		if err := rt.upsertProgress(client, rt.progBActivities.Coaching.ID, 100, true); err != nil {
			return err
		}
	}

	rt.progBCompletedSessionIDs = completedSessionIDs
	log.Printf("✅ completed cohort activity built: %d sessions all completed", len(completedSessionIDs))
	return nil
}

// buildKickoffCohortActivity gives Program D's cohort a genuine "day one"
// state: nothing completed yet, orientation activities visible but not due
// for a few days, and one orientation session scheduled for later this week
// - distinct from Cohort A2 (mid-way, mixed past/future) and Cohort B1 (fully
// completed).
func (rt *runtime) buildKickoffCohortActivity(prog *programRef, cohort *cohortRef) error {
	log.Println("🗓  building kickoff cohort activity (Program D)...")

	facultySunita := rt.userIDs["sunita.rao@qa.psitech.co.in"]

	participants := rt.cohortParticipantUserIDs(cohort.Name)
	if len(participants) == 0 {
		return fmt.Errorf("no participants resolved for %s - enrollment must run before session activity", cohort.Name)
	}

	// One orientation session scheduled for later this week - status stays
	// "scheduled" (create default), no attendance yet, since it hasn't
	// happened.
	if _, err := rt.scheduleSession(prog.ID, rt.progDActivities.OrientVideo.ID, cohort.ID, facultySunita,
		"Live Kickoff: Program Orientation", "classroom", daysFromNow(3), 60); err != nil {
		return err
	}

	// Deliberately no activity_progress calls here - day 0 means nobody has
	// started orientation yet. That's the point of this cohort existing.
	log.Println("✅ kickoff cohort activity built (nothing completed yet - starts today)")
	return nil
}

func attendanceFor(userIDs []string, status string) []map[string]string {
	out := make([]map[string]string, 0, len(userIDs))
	for _, uid := range userIDs {
		out = append(out, map[string]string{"user_id": uid, "status": status})
	}
	return out
}

func mixedAttendance(userIDs []string) []map[string]string {
	out := make([]map[string]string, 0, len(userIDs))
	for i, uid := range userIDs {
		status := "present"
		if i%5 == 0 {
			status = "absent"
		} else if i%7 == 0 {
			status = "late"
		}
		out = append(out, map[string]string{"user_id": uid, "status": status})
	}
	return out
}
