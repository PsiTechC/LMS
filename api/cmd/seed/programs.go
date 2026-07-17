package main

import (
	"encoding/json"
	"fmt"
	"log"
)

type programRef struct {
	ID string
}

type phaseRef struct {
	ID string
}

type moduleRef struct {
	ID string
}

type activityRef struct {
	ID   string
	Type string
}

func (rt *runtime) createProgram(actor *apiClient, title, description string, durationWeeks int) (*programRef, error) {
	var out struct {
		ID string `json:"id"`
	}
	body := map[string]any{
		"title":          title,
		"description":    description,
		"color":          "#C8A860",
		"duration_weeks": durationWeeks,
	}
	if err := actor.post(fmt.Sprintf("/api/v1/programs?org_id=%s", rt.orgID), body, &out); err != nil {
		return nil, err
	}
	log.Printf("✅ program created: %s (%s)", title, out.ID)
	return &programRef{ID: out.ID}, nil
}

func (rt *runtime) setProgramDates(actor *apiClient, programID, startDate, endDate string) error {
	body := map[string]any{"start_date": startDate, "end_date": endDate}
	return actor.patch("/api/v1/programs/"+programID, body, nil)
}

func (rt *runtime) publishProgram(actor *apiClient, programID string) error {
	return actor.post("/api/v1/programs/"+programID+"/publish", nil, nil)
}

func (rt *runtime) createPhase(actor *apiClient, programID, title, phaseType, deliveryMode string, phaseNumber, startDay, endDay int) (*phaseRef, error) {
	var out struct {
		ID string `json:"id"`
	}
	body := map[string]any{
		"title":         title,
		"phase_number":  phaseNumber,
		"phase_type":    phaseType,
		"delivery_mode": deliveryMode,
		"start_day":     startDay,
		"end_day":       endDay,
	}
	if err := actor.post("/api/v1/programs/"+programID+"/phases", body, &out); err != nil {
		return nil, err
	}
	log.Printf("  ✅ phase created: %s (%s, type=%s)", title, out.ID, phaseType)
	return &phaseRef{ID: out.ID}, nil
}

func (rt *runtime) createModule(actor *apiClient, programID, phaseID, title, deliveryMode string, sortOrder int) (*moduleRef, error) {
	var out struct {
		ID string `json:"id"`
	}
	body := map[string]any{
		"title":         title,
		"delivery_mode": deliveryMode,
		"sort_order":    sortOrder,
	}
	if err := actor.post(fmt.Sprintf("/api/v1/programs/%s/phases/%s/modules", programID, phaseID), body, &out); err != nil {
		return nil, err
	}
	log.Printf("    ✅ module created: %s (%s, %s)", title, out.ID, deliveryMode)
	return &moduleRef{ID: out.ID}, nil
}

// activitySpec describes one activity to create, including its optional
// module/slot placement and its config_json payload.
type activitySpec struct {
	Title        string
	Type         string // must match the activity_type enum
	DeliveryMode string // self_paced | live | async — independent axis, see plan §1/§9
	ModuleID     string // "" = attaches directly to the phase
	Slot         string // "" | pre | post — only meaningful when ModuleID is set
	DurationMins int
	StartDay     int
	DurationDays int
	DueDayOffset int
	IsMandatory  bool
	Config       map[string]any
}

func (rt *runtime) createActivity(actor *apiClient, programID, phaseID string, spec activitySpec) (*activityRef, error) {
	var out struct {
		ID string `json:"id"`
	}
	var rawConfig json.RawMessage
	if spec.Config != nil {
		b, err := json.Marshal(spec.Config)
		if err != nil {
			return nil, fmt.Errorf("marshal config for %s: %w", spec.Title, err)
		}
		rawConfig = b
	}
	body := map[string]any{
		"phase_id":       phaseID,
		"module_id":      spec.ModuleID,
		"slot":           spec.Slot,
		"title":          spec.Title,
		"type":           spec.Type,
		"delivery_mode":  spec.DeliveryMode,
		"duration_mins":  spec.DurationMins,
		"start_day":      spec.StartDay,
		"duration_days":  spec.DurationDays,
		"due_day_offset": spec.DueDayOffset,
		"is_mandatory":   spec.IsMandatory,
		"config":         rawConfig,
	}
	if err := actor.post("/api/v1/programs/"+programID+"/activities", body, &out); err != nil {
		return nil, err
	}
	log.Printf("    ✅ activity created: %s (%s, type=%s, mode=%s)", spec.Title, out.ID, spec.Type, spec.DeliveryMode)
	return &activityRef{ID: out.ID, Type: spec.Type}, nil
}

// assignFacultyToProgram grants a faculty member program-level access via the
// REAL live flow (Faculty Management tab → "Manage Faculty Access" modal), NOT
// the Design Studio's assignFacultyService route. That route (POST
// /programs/:id/activities/:actId/faculty) is dead code from the UI's
// perspective — Program Design no longer assigns faculty; a hardcoded
// `isSessionType = false` in PMDesignStudio.tsx means no button ever calls it.
// The real path is POST /faculty_assignments/program, which resolves its own
// "representative activity" for the program server-side (preferring a
// coaching-type activity, else lowest sort_order) and inserts one
// activity_faculty row — it must be called AFTER at least one activity exists
// on the program, and it is a program-level toggle, not a per-activity pick.
func (rt *runtime) assignFacultyToProgram(actor *apiClient, facultyUserID, programID string) error {
	body := map[string]any{
		"faculty_user_id": facultyUserID,
		"program_id":      programID,
	}
	return actor.post("/api/v1/faculty_assignments/program", body, nil)
}

// ── Program A: "Emerging Leaders" — active, richest cohort mix ──────────────

func (rt *runtime) buildProgramA() (*programRef, error) {
	log.Println("📘 building Program A: Emerging Leaders")
	prog, err := rt.createProgram(rt.superadmin, "Emerging Leaders", "12-month leadership development journey for high-potential mid-level managers.", 48)
	if err != nil {
		return nil, err
	}
	if err := rt.setProgramDates(rt.pm, prog.ID, ymd(daysFromNow(-42)), ymd(daysFromNow(7*40))); err != nil {
		return nil, err
	}

	facultyChirag := rt.userIDs["chirag@psitech.co.in"]
	facultyRohit := rt.userIDs["rohit@psitech.co.in"]
	facultyArjun := rt.userIDs["arjun.mehta@qa.psitech.co.in"]

	// Phase 1: pre-enrolment (activity-phase, no modules) — admin_task activities
	phasePre, err := rt.createPhase(rt.pm, prog.ID, "Pre-Enrolment", "pre-enrolment", "", 0, -14, 0)
	if err != nil {
		return nil, err
	}
	if _, err := rt.createActivity(rt.pm, prog.ID, phasePre.ID, activitySpec{
		Title: "Nomination & Manager Briefing", Type: "admin_task", DeliveryMode: "async",
		DurationMins: 30, StartDay: -14, DurationDays: 7, DueDayOffset: 7, IsMandatory: true,
		Config: map[string]any{"fields": map[string]string{"subject": "You've been nominated"}, "email_body": "You have been nominated for the Emerging Leaders program."},
	}); err != nil {
		return nil, err
	}

	// Phase 2: orientation
	phaseOrient, err := rt.createPhase(rt.pm, prog.ID, "Orientation", "orientation", "virtual", 1, 1, 7)
	if err != nil {
		return nil, err
	}
	actOrientVideo, err := rt.createActivity(rt.pm, prog.ID, phaseOrient.ID, activitySpec{
		Title: "Welcome to the Program", Type: "video", DeliveryMode: "self_paced",
		DurationMins: 20, StartDay: 1, DurationDays: 3, DueDayOffset: 3, IsMandatory: true,
		Config: map[string]any{}, // no content_assets row seeded — asset_id left blank intentionally
	})
	if err != nil {
		return nil, err
	}
	if _, err := rt.createActivity(rt.pm, prog.ID, phaseOrient.ID, activitySpec{
		Title: "Pre-Program Self-Assessment", Type: "survey", DeliveryMode: "self_paced",
		DurationMins: 15, StartDay: 2, DurationDays: 5, DueDayOffset: 5, IsMandatory: true,
		Config: map[string]any{"survey_type": "pre", "time_estimate_mins": 15},
	}); err != nil {
		return nil, err
	}

	// Phase 3: module-in-person — real pre/post-work module structure
	phaseModuleIP, err := rt.createPhase(rt.pm, prog.ID, "Module 1: Foundations of Leadership", "module-in-person", "in-person", 2, 8, 21)
	if err != nil {
		return nil, err
	}
	mod1, err := rt.createModule(rt.pm, prog.ID, phaseModuleIP.ID, "Foundations Classroom Block", "in-person", 0)
	if err != nil {
		return nil, err
	}
	actPreWorkCaseStudy, err := rt.createActivity(rt.pm, prog.ID, phaseModuleIP.ID, activitySpec{
		Title: "Pre-Work: Leadership Styles Case Study", Type: "case_study", DeliveryMode: "self_paced",
		ModuleID: mod1.ID, Slot: "pre", DurationMins: 45, StartDay: 8, DurationDays: 4, DueDayOffset: 4, IsMandatory: true,
	})
	if err != nil {
		return nil, err
	}
	// Attaches directly to the PHASE, not the module: a module's Slot ('pre'|'post')
	// is only valid when module_id is set (backend enforces this), and the live
	// classroom/virtual event itself is neither pre- nor post-work — it's the
	// module's own wrapped session, conceptually alongside the module, so it
	// carries no ModuleID/Slot at all. (Deliberately mismatched delivery-mode
	// axis vs. the in-person module/phase — the two axes have zero
	// cross-validation, plan §9 optional coverage.)
	actLiveClassroom, err := rt.createActivity(rt.pm, prog.ID, phaseModuleIP.ID, activitySpec{
		Title: "Classroom: Leading Through Influence", Type: "live_session", DeliveryMode: "live",
		DurationMins: 180, StartDay: 14, DurationDays: 1, DueDayOffset: 1, IsMandatory: true,
		Config: map[string]any{"session_type": "classroom"},
	})
	if err != nil {
		return nil, err
	}
	if _, err := rt.createActivity(rt.pm, prog.ID, phaseModuleIP.ID, activitySpec{
		Title: "Post-Work: Reflection Journal", Type: "journal", DeliveryMode: "self_paced",
		ModuleID: mod1.ID, Slot: "post", DurationMins: 20, StartDay: 15, DurationDays: 5, DueDayOffset: 5, IsMandatory: true,
		Config: map[string]any{"prompt": "What is one influence tactic you will try this week?"},
	}); err != nil {
		return nil, err
	}

	// Phase 4: module-virtual
	phaseModuleV, err := rt.createPhase(rt.pm, prog.ID, "Module 2: Strategic Decision-Making", "module-virtual", "virtual", 3, 22, 35)
	if err != nil {
		return nil, err
	}
	mod2, err := rt.createModule(rt.pm, prog.ID, phaseModuleV.ID, "Decision-Making Virtual Block", "virtual", 0)
	if err != nil {
		return nil, err
	}
	// Same reasoning as actLiveClassroom above: attaches directly to the phase,
	// no ModuleID/Slot.
	actVirtualLive, err := rt.createActivity(rt.pm, prog.ID, phaseModuleV.ID, activitySpec{
		Title: "Virtual Session: Data-Driven Decisions", Type: "live_session", DeliveryMode: "live",
		DurationMins: 90, StartDay: 24, DurationDays: 1, DueDayOffset: 1, IsMandatory: true,
		Config: map[string]any{"session_type": "virtual"},
	})
	if err != nil {
		return nil, err
	}
	if _, err := rt.createActivity(rt.pm, prog.ID, phaseModuleV.ID, activitySpec{
		Title: "Post-Work: Assignment — Decision Memo", Type: "assignment", DeliveryMode: "async",
		ModuleID: mod2.ID, Slot: "post", DurationMins: 60, StartDay: 25, DurationDays: 7, DueDayOffset: 7, IsMandatory: true,
		Config: map[string]any{"instructions": "Submit a 1-page decision memo applying the framework."},
	}); err != nil {
		return nil, err
	}
	if _, err := rt.createActivity(rt.pm, prog.ID, phaseModuleV.ID, activitySpec{
		Title: "Peer Review: Decision Memos", Type: "peer_review", DeliveryMode: "async",
		ModuleID: mod2.ID, Slot: "post", DurationMins: 30, StartDay: 30, DurationDays: 5, DueDayOffset: 5, IsMandatory: false,
		Config: map[string]any{"instructions": "Review two peers' decision memos.", "reviewers_per_submission": 2},
	}); err != nil {
		return nil, err
	}

	// Phase 5: coaching
	phaseCoaching, err := rt.createPhase(rt.pm, prog.ID, "1:1 Coaching", "coaching", "virtual", 4, 36, 49)
	if err != nil {
		return nil, err
	}
	actCoaching, err := rt.createActivity(rt.pm, prog.ID, phaseCoaching.ID, activitySpec{
		Title: "Coaching Session 1", Type: "coaching", DeliveryMode: "live",
		DurationMins: 45, StartDay: 36, DurationDays: 14, DueDayOffset: 14, IsMandatory: true,
		Config: map[string]any{"session_type": "coaching_individual"},
	})
	if err != nil {
		return nil, err
	}

	// Phase 6: capstone
	phaseCapstone, err := rt.createPhase(rt.pm, prog.ID, "Capstone Project", "capstone", "", 5, 50, 70)
	if err != nil {
		return nil, err
	}
	if _, err := rt.createActivity(rt.pm, prog.ID, phaseCapstone.ID, activitySpec{
		Title: "Capstone: Leadership Action Plan", Type: "assessment", DeliveryMode: "async",
		DurationMins: 90, StartDay: 50, DurationDays: 14, DueDayOffset: 14, IsMandatory: true,
		Config: map[string]any{"attempts_allowed": 2, "time_limit_mins": 0, "scoring_method": "highest", "passing_score_pct": 70},
	}); err != nil {
		return nil, err
	}

	// Phase 7: post-program (activity-phase)
	phasePost, err := rt.createPhase(rt.pm, prog.ID, "Post-Program", "post-program", "", 6, 71, 84)
	if err != nil {
		return nil, err
	}
	if _, err := rt.createActivity(rt.pm, prog.ID, phasePost.ID, activitySpec{
		Title: "Program Feedback Survey", Type: "survey", DeliveryMode: "self_paced",
		DurationMins: 10, StartDay: 71, DurationDays: 7, DueDayOffset: 7, IsMandatory: true,
		Config: map[string]any{"survey_type": "post", "time_estimate_mins": 10},
	}); err != nil {
		return nil, err
	}

	// ── Faculty program access — via the REAL Faculty Management flow, not the
	// dead Design Studio route (see assignFacultyToProgram doc comment). This is
	// a program-level grant, not a per-activity pick, so one call per faculty
	// member covers their access to everything in Program A.
	if err := rt.assignFacultyToProgram(rt.pm, facultyChirag, prog.ID); err != nil {
		return nil, err
	}
	if err := rt.assignFacultyToProgram(rt.pm, facultyRohit, prog.ID); err != nil {
		return nil, err
	}
	if err := rt.assignFacultyToProgram(rt.pm, facultyArjun, prog.ID); err != nil {
		return nil, err
	}
	// stash activity refs the runtime needs later for session scheduling +
	// content-library attachment
	rt.progAActivities = progAActivityRefs{
		OrientVideo:      actOrientVideo,
		PreWorkCaseStudy: actPreWorkCaseStudy,
		LiveClassroom:    actLiveClassroom,
		VirtualLive:      actVirtualLive,
		Coaching:         actCoaching,
	}

	if err := rt.publishProgram(rt.superadmin, prog.ID); err != nil {
		return nil, err
	}
	log.Println("✅ Program A published")
	return prog, nil
}

// progAActivityRefs holds the activity IDs the runtime needs when scheduling
// sessions for the mid-way cohort, and when attaching content-library assets,
// later in the sequence.
type progAActivityRefs struct {
	OrientVideo      *activityRef
	PreWorkCaseStudy *activityRef
	LiveClassroom    *activityRef
	VirtualLive      *activityRef
	Coaching         *activityRef
}

// ── Program B: "Executive Coaching Track" — active, fully-completed cohort ──

func (rt *runtime) buildProgramB() (*programRef, error) {
	log.Println("📘 building Program B: Executive Coaching Track")
	prog, err := rt.createProgram(rt.superadmin, "Executive Coaching Track", "6-month 1:1 executive coaching engagement for senior leaders.", 24)
	if err != nil {
		return nil, err
	}
	if err := rt.setProgramDates(rt.pm, prog.ID, ymd(daysFromNow(-98)), ymd(daysFromNow(-7))); err != nil {
		return nil, err
	}

	facultyRohit := rt.userIDs["rohit@psitech.co.in"]

	phaseOrient, err := rt.createPhase(rt.pm, prog.ID, "Orientation", "orientation", "virtual", 0, 1, 7)
	if err != nil {
		return nil, err
	}
	if _, err := rt.createActivity(rt.pm, prog.ID, phaseOrient.ID, activitySpec{
		Title: "Program Orientation Video", Type: "video", DeliveryMode: "self_paced",
		DurationMins: 15, StartDay: 1, DurationDays: 3, DueDayOffset: 3, IsMandatory: true,
	}); err != nil {
		return nil, err
	}

	phaseCoaching, err := rt.createPhase(rt.pm, prog.ID, "Coaching Engagement", "coaching", "virtual", 1, 8, 70)
	if err != nil {
		return nil, err
	}
	actCoachingB, err := rt.createActivity(rt.pm, prog.ID, phaseCoaching.ID, activitySpec{
		Title: "Executive Coaching Sessions", Type: "coaching", DeliveryMode: "live",
		DurationMins: 60, StartDay: 8, DurationDays: 60, DueDayOffset: 60, IsMandatory: true,
		Config: map[string]any{"session_type": "coaching_individual"},
	})
	if err != nil {
		return nil, err
	}
	if err := rt.assignFacultyToProgram(rt.pm, facultyRohit, prog.ID); err != nil {
		return nil, err
	}

	phasePost, err := rt.createPhase(rt.pm, prog.ID, "Post-Program", "post-program", "", 2, 71, 84)
	if err != nil {
		return nil, err
	}
	if _, err := rt.createActivity(rt.pm, prog.ID, phasePost.ID, activitySpec{
		Title: "Final Impact Survey", Type: "survey", DeliveryMode: "self_paced",
		DurationMins: 10, StartDay: 71, DurationDays: 7, DueDayOffset: 7, IsMandatory: true,
		Config: map[string]any{"survey_type": "post"},
	}); err != nil {
		return nil, err
	}

	rt.progBActivities = progBActivityRefs{Coaching: actCoachingB}

	if err := rt.publishProgram(rt.superadmin, prog.ID); err != nil {
		return nil, err
	}
	// Note: publish always sets status="active" (service.go behavior) — there is
	// no dedicated "mark delivered" transition endpoint in this codebase, so
	// Program B stays "active" even though its one cohort has fully completed.
	// That's a real product gap, not something this script should paper over.
	log.Println("✅ Program B published")
	return prog, nil
}

type progBActivityRefs struct {
	Coaching *activityRef
}

// ── Program D: "Digital Transformation Leadership" — active, starts TODAY ───
// Full-fledged structure (pre-enrolment → orientation → 2 modules with real
// pre/post-work → coaching → capstone → post-program), same depth as Program
// A, but dated so day 0 = today: orientation is due THIS week, everything
// else is genuinely ahead of today — a clean "just kicked off" program,
// distinct from Program A (already mid-flight) and Program C (draft).

func (rt *runtime) buildProgramD() (*programRef, error) {
	log.Println("📘 building Program D: Digital Transformation Leadership (starts today)")
	prog, err := rt.createProgram(rt.superadmin, "Digital Transformation Leadership", "10-week program equipping senior managers to lead digital transformation initiatives.", 10)
	if err != nil {
		return nil, err
	}
	// Day 0 = today. Program spans today through +10 weeks.
	if err := rt.setProgramDates(rt.pm, prog.ID, ymd(daysFromNow(0)), ymd(daysFromNow(7*10))); err != nil {
		return nil, err
	}

	facultySunita := rt.userIDs["sunita.rao@qa.psitech.co.in"]
	facultyArjun := rt.userIDs["arjun.mehta@qa.psitech.co.in"]

	// Phase 1: pre-enrolment (already happened, day -7 to 0 — nominations close today)
	phasePre, err := rt.createPhase(rt.pm, prog.ID, "Pre-Enrolment", "pre-enrolment", "", 0, -7, 0)
	if err != nil {
		return nil, err
	}
	if _, err := rt.createActivity(rt.pm, prog.ID, phasePre.ID, activitySpec{
		Title: "Nomination & Manager Briefing", Type: "admin_task", DeliveryMode: "async",
		DurationMins: 30, StartDay: -7, DurationDays: 7, DueDayOffset: 7, IsMandatory: true,
		Config: map[string]any{"fields": map[string]string{"subject": "You've been nominated"}, "email_body": "You have been nominated for the Digital Transformation Leadership program."},
	}); err != nil {
		return nil, err
	}

	// Phase 2: orientation — due THIS week, starting today
	phaseOrient, err := rt.createPhase(rt.pm, prog.ID, "Orientation", "orientation", "virtual", 1, 0, 7)
	if err != nil {
		return nil, err
	}
	actOrientVideo, err := rt.createActivity(rt.pm, prog.ID, phaseOrient.ID, activitySpec{
		Title: "Welcome: Leading Digital Transformation", Type: "video", DeliveryMode: "self_paced",
		DurationMins: 20, StartDay: 0, DurationDays: 3, DueDayOffset: 3, IsMandatory: true,
	})
	if err != nil {
		return nil, err
	}
	if _, err := rt.createActivity(rt.pm, prog.ID, phaseOrient.ID, activitySpec{
		Title: "Pre-Program Self-Assessment", Type: "survey", DeliveryMode: "self_paced",
		DurationMins: 15, StartDay: 1, DurationDays: 5, DueDayOffset: 5, IsMandatory: true,
		Config: map[string]any{"survey_type": "pre", "time_estimate_mins": 15},
	}); err != nil {
		return nil, err
	}

	// Phase 3: module-in-person — Module 1, real pre/post-work
	phaseModuleIP, err := rt.createPhase(rt.pm, prog.ID, "Module 1: Digital Strategy Foundations", "module-in-person", "in-person", 2, 8, 21)
	if err != nil {
		return nil, err
	}
	mod1, err := rt.createModule(rt.pm, prog.ID, phaseModuleIP.ID, "Digital Strategy Classroom Block", "in-person", 0)
	if err != nil {
		return nil, err
	}
	actPreWorkCaseStudy, err := rt.createActivity(rt.pm, prog.ID, phaseModuleIP.ID, activitySpec{
		Title: "Pre-Work: Digital Transformation Case Brief", Type: "case_study", DeliveryMode: "self_paced",
		ModuleID: mod1.ID, Slot: "pre", DurationMins: 45, StartDay: 8, DurationDays: 4, DueDayOffset: 4, IsMandatory: true,
	})
	if err != nil {
		return nil, err
	}
	actLiveClassroom, err := rt.createActivity(rt.pm, prog.ID, phaseModuleIP.ID, activitySpec{
		Title: "Classroom: Leading Change at Scale", Type: "live_session", DeliveryMode: "live",
		DurationMins: 180, StartDay: 14, DurationDays: 1, DueDayOffset: 1, IsMandatory: true,
		Config: map[string]any{"session_type": "classroom"},
	})
	if err != nil {
		return nil, err
	}
	if _, err := rt.createActivity(rt.pm, prog.ID, phaseModuleIP.ID, activitySpec{
		Title: "Post-Work: Reflection Journal", Type: "journal", DeliveryMode: "self_paced",
		ModuleID: mod1.ID, Slot: "post", DurationMins: 20, StartDay: 15, DurationDays: 5, DueDayOffset: 5, IsMandatory: true,
		Config: map[string]any{"prompt": "What is the biggest barrier to digital adoption on your team, and what will you try first?"},
	}); err != nil {
		return nil, err
	}

	// Phase 4: module-virtual — Module 2
	phaseModuleV, err := rt.createPhase(rt.pm, prog.ID, "Module 2: Data & Technology Fluency", "module-virtual", "virtual", 3, 22, 35)
	if err != nil {
		return nil, err
	}
	mod2, err := rt.createModule(rt.pm, prog.ID, phaseModuleV.ID, "Data Fluency Virtual Block", "virtual", 0)
	if err != nil {
		return nil, err
	}
	actVirtualLive, err := rt.createActivity(rt.pm, prog.ID, phaseModuleV.ID, activitySpec{
		Title: "Virtual Session: Reading the Data Room", Type: "live_session", DeliveryMode: "live",
		DurationMins: 90, StartDay: 24, DurationDays: 1, DueDayOffset: 1, IsMandatory: true,
		Config: map[string]any{"session_type": "virtual"},
	})
	if err != nil {
		return nil, err
	}
	if _, err := rt.createActivity(rt.pm, prog.ID, phaseModuleV.ID, activitySpec{
		Title: "Post-Work: Assignment — Tech Roadmap", Type: "assignment", DeliveryMode: "async",
		ModuleID: mod2.ID, Slot: "post", DurationMins: 60, StartDay: 25, DurationDays: 7, DueDayOffset: 7, IsMandatory: true,
		Config: map[string]any{"instructions": "Submit a 1-page technology adoption roadmap for your team."},
	}); err != nil {
		return nil, err
	}
	if _, err := rt.createActivity(rt.pm, prog.ID, phaseModuleV.ID, activitySpec{
		Title: "Peer Review: Tech Roadmaps", Type: "peer_review", DeliveryMode: "async",
		ModuleID: mod2.ID, Slot: "post", DurationMins: 30, StartDay: 30, DurationDays: 5, DueDayOffset: 5, IsMandatory: false,
		Config: map[string]any{"instructions": "Review two peers' technology roadmaps.", "reviewers_per_submission": 2},
	}); err != nil {
		return nil, err
	}

	// Phase 5: coaching
	phaseCoaching, err := rt.createPhase(rt.pm, prog.ID, "1:1 Coaching", "coaching", "virtual", 4, 36, 49)
	if err != nil {
		return nil, err
	}
	actCoaching, err := rt.createActivity(rt.pm, prog.ID, phaseCoaching.ID, activitySpec{
		Title: "Coaching Session 1", Type: "coaching", DeliveryMode: "live",
		DurationMins: 45, StartDay: 36, DurationDays: 14, DueDayOffset: 14, IsMandatory: true,
		Config: map[string]any{"session_type": "coaching_individual"},
	})
	if err != nil {
		return nil, err
	}

	// Phase 6: capstone
	phaseCapstone, err := rt.createPhase(rt.pm, prog.ID, "Capstone Project", "capstone", "", 5, 50, 63)
	if err != nil {
		return nil, err
	}
	if _, err := rt.createActivity(rt.pm, prog.ID, phaseCapstone.ID, activitySpec{
		Title: "Capstone: Digital Transformation Roadmap", Type: "assessment", DeliveryMode: "async",
		DurationMins: 90, StartDay: 50, DurationDays: 14, DueDayOffset: 14, IsMandatory: true,
		Config: map[string]any{"attempts_allowed": 2, "time_limit_mins": 0, "scoring_method": "highest", "passing_score_pct": 70},
	}); err != nil {
		return nil, err
	}

	// Phase 7: post-program
	phasePost, err := rt.createPhase(rt.pm, prog.ID, "Post-Program", "post-program", "", 6, 64, 70)
	if err != nil {
		return nil, err
	}
	if _, err := rt.createActivity(rt.pm, prog.ID, phasePost.ID, activitySpec{
		Title: "Program Feedback Survey", Type: "survey", DeliveryMode: "self_paced",
		DurationMins: 10, StartDay: 64, DurationDays: 7, DueDayOffset: 7, IsMandatory: true,
		Config: map[string]any{"survey_type": "post", "time_estimate_mins": 10},
	}); err != nil {
		return nil, err
	}

	if err := rt.assignFacultyToProgram(rt.pm, facultySunita, prog.ID); err != nil {
		return nil, err
	}
	if err := rt.assignFacultyToProgram(rt.pm, facultyArjun, prog.ID); err != nil {
		return nil, err
	}

	rt.progDActivities = progDActivityRefs{
		OrientVideo:      actOrientVideo,
		PreWorkCaseStudy: actPreWorkCaseStudy,
		LiveClassroom:    actLiveClassroom,
		VirtualLive:      actVirtualLive,
		Coaching:         actCoaching,
	}

	if err := rt.publishProgram(rt.superadmin, prog.ID); err != nil {
		return nil, err
	}
	log.Println("✅ Program D published (day 0 = today)")
	return prog, nil
}

// progDActivityRefs mirrors progAActivityRefs for Program D's activities.
type progDActivityRefs struct {
	OrientVideo      *activityRef
	PreWorkCaseStudy *activityRef
	LiveClassroom    *activityRef
	VirtualLive      *activityRef
	Coaching         *activityRef
}

// ── Program C: "New Manager Bootcamp" — draft, never published ──────────────

func (rt *runtime) buildProgramC() error {
	log.Println("📘 building Program C: New Manager Bootcamp (stays draft — never published)")
	prog, err := rt.createProgram(rt.superadmin, "New Manager Bootcamp", "4-week foundational program for first-time people managers.", 4)
	if err != nil {
		return err
	}
	phase, err := rt.createPhase(rt.pm, prog.ID, "Week 1: Fundamentals", "orientation", "virtual", 0, 1, 7)
	if err != nil {
		return err
	}
	if _, err := rt.createActivity(rt.pm, prog.ID, phase.ID, activitySpec{
		Title: "What Makes a Great First-Time Manager", Type: "video", DeliveryMode: "self_paced",
		DurationMins: 25, StartDay: 1, DurationDays: 5, DueDayOffset: 5, IsMandatory: true,
	}); err != nil {
		return err
	}
	// Deliberately NOT published — exercises the "draft, not yet published" state.
	log.Println("✅ Program C created as draft (not published)")
	return nil
}
