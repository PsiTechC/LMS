// Package tools holds the per-role tool registrations for the shared
// chatbot core (internal/ai/chatbot). Each file in this package is one
// role's capability set - adding a new role means adding a new file here
// and calling chatbot.Register from its init(), nothing else changes.
//
// Every tool's Run function scopes its query by s.UserID (or another Scope
// field) taken from the authenticated caller - never from model-supplied
// arguments - so a tool can never be tricked into returning another user's
// data. This mirrors the access-boundary pattern already established in
// internal/ai/rag (raw SQL, scope-filtered, no cross-module Go imports).
package tools

import (
	"context"
	"encoding/json"

	"github.com/xa-lms/api/internal/ai/chatbot"
	"github.com/xa-lms/api/internal/ai/provider"
	"github.com/xa-lms/api/internal/ai/rag"
	"github.com/xa-lms/api/internal/ai/scope"
	"github.com/xa-lms/api/internal/shared"
	"github.com/xa-lms/api/pkg/database"
)

func participantTools() []chatbot.Tool {
	return []chatbot.Tool{
		getMyProfileTool(),
		getMyEnrollmentsTool(),
		getMyActivityProgressTool(),
		getMySubmissionsTool(),
		getMyGoalsTool(),
		getMyUpcomingSessionsTool(),
		getMyCoachingTool(),
		getMyFeedback360Tool(),
		getMyCapstoneTool(),
		getMySurveysTool(),
		searchResourcesTool(),
	}
}

func init() {
	chatbot.Register(shared.RoleParticipant, participantTools()...)
	// Participant Retailer is a narrower Scope over the same participant
	// experience (per Phase 0's design), so it gets the identical tool set -
	// narrowing happens at the Scope/permission layer, not by forking tools.
	chatbot.Register(shared.RoleParticipantRetailer, participantTools()...)
}

func noParams() json.RawMessage { return json.RawMessage(`{"type":"object","properties":{}}`) }

func toJSON(v any) string {
	b, err := json.Marshal(v)
	if err != nil {
		return `{"error":"failed to serialize result"}`
	}
	return string(b)
}

// ── get_my_profile ──────────────────────────────────────────────────

func getMyProfileTool() chatbot.Tool {
	return chatbot.Tool{
		Def: provider.ToolDef{
			Name:        "get_my_profile",
			Description: "Get the caller's own profile: name, email, role, and about text.",
			Parameters:  noParams(),
		},
		Run: func(_ context.Context, s scope.Scope, _ string) (string, error) {
			type row struct {
				Name  string
				Email string
				Role  string
				About string
			}
			var r row
			err := database.DB.Raw(`
				SELECT name, email, role, COALESCE(about, '') AS about
				FROM users WHERE id = ?
			`, s.UserID).Scan(&r).Error
			if err != nil {
				return "", err
			}
			return toJSON(r), nil
		},
	}
}

// ── get_my_enrollments ──────────────────────────────────────────────

func getMyEnrollmentsTool() chatbot.Tool {
	return chatbot.Tool{
		Def: provider.ToolDef{
			Name:        "get_my_enrollments",
			Description: "List the programs and cohorts the caller is enrolled in, with completion percent and risk level.",
			Parameters:  noParams(),
		},
		Run: func(_ context.Context, s scope.Scope, _ string) (string, error) {
			type row struct {
				ProgramTitle      string
				CohortName        string
				Status            string
				CompletionPercent int
				RiskLevel         string
				StartDate         *string
				EndDate           *string
			}
			var rows []row
			err := database.DB.Raw(`
				SELECT p.title AS program_title, c.name AS cohort_name, e.status,
				       COALESCE(e.completion_percent, 0) AS completion_percent,
				       COALESCE(e.risk_level, 'unknown') AS risk_level,
				       to_char(c.start_date, 'YYYY-MM-DD') AS start_date,
				       to_char(c.end_date, 'YYYY-MM-DD') AS end_date
				FROM enrollments e
				JOIN cohorts c ON c.id = e.cohort_id
				JOIN programs p ON p.id = c.program_id
				WHERE e.user_id = ? AND e.status <> 'withdrawn'
				ORDER BY e.enrolled_at DESC
			`, s.UserID).Scan(&rows).Error
			if err != nil {
				return "", err
			}
			return toJSON(rows), nil
		},
	}
}

// ── get_my_activity_progress ────────────────────────────────────────

func getMyActivityProgressTool() chatbot.Tool {
	return chatbot.Tool{
		Def: provider.ToolDef{
			Name: "get_my_activity_progress",
			Description: "List the caller's activities (content, assessments, surveys, etc.) across their programs, " +
				"with completion status and due dates, so questions like 'what should I work on before Thursday' can be answered.",
			Parameters: noParams(),
		},
		Run: func(_ context.Context, s scope.Scope, _ string) (string, error) {
			type row struct {
				ActivityTitle string
				ActivityType  string
				PhaseTitle    string
				Status        string
				PercentDone   int
				DueDate       *string
			}
			var rows []row
			err := database.DB.Raw(`
				SELECT a.title AS activity_title, a.type::text AS activity_type, ph.title AS phase_title,
				       CASE
					       WHEN EXISTS (SELECT 1 FROM submissions sub WHERE sub.activity_id = a.id AND sub.participant_id = e.user_id) THEN 'completed'
					       WHEN EXISTS (SELECT 1 FROM survey_completions sc WHERE sc.activity_id = a.id AND sc.participant_id = e.user_id) THEN 'completed'
					       WHEN EXISTS (SELECT 1 FROM assessment_attempts aa WHERE aa.activity_id = a.id AND aa.participant_id = e.user_id AND aa.status IN ('auto_scored', 'pending_review', 'graded')) THEN 'completed'
					       ELSE COALESCE(ap.status::text, 'not_started')
				       END AS status,
				       CASE
					       WHEN EXISTS (SELECT 1 FROM submissions sub WHERE sub.activity_id = a.id AND sub.participant_id = e.user_id) THEN 100
					       WHEN EXISTS (SELECT 1 FROM survey_completions sc WHERE sc.activity_id = a.id AND sc.participant_id = e.user_id) THEN 100
					       WHEN EXISTS (SELECT 1 FROM assessment_attempts aa WHERE aa.activity_id = a.id AND aa.participant_id = e.user_id AND aa.status IN ('auto_scored', 'pending_review', 'graded')) THEN 100
					       ELSE COALESCE(ap.percent_complete, 0)
				       END AS percent_done,
				       to_char(c.start_date + ((COALESCE(ph.start_day,0) + COALESCE(a.due_day_offset,0)) || ' days')::interval, 'YYYY-MM-DD') AS due_date
				FROM enrollments e
				JOIN cohorts c ON c.id = e.cohort_id
				JOIN program_phases ph ON ph.program_id = c.program_id
				JOIN activities a ON a.phase_id = ph.id
				LEFT JOIN activity_progress ap ON ap.activity_id = a.id AND ap.enrollment_id = e.id
				WHERE e.user_id = ? AND e.status <> 'withdrawn' AND a.type <> 'admin_task'
				ORDER BY due_date ASC NULLS LAST
				LIMIT 100
			`, s.UserID).Scan(&rows).Error
			if err != nil {
				return "", err
			}
			return toJSON(rows), nil
		},
	}
}

// ── get_my_submissions ──────────────────────────────────────────────

func getMySubmissionsTool() chatbot.Tool {
	return chatbot.Tool{
		Def: provider.ToolDef{
			Name:        "get_my_submissions",
			Description: "List the caller's own assignment/assessment submissions, with status, grade, and feedback if graded.",
			Parameters:  noParams(),
		},
		Run: func(_ context.Context, s scope.Scope, _ string) (string, error) {
			type row struct {
				ActivityTitle string
				Status        string
				Grade         *float64
				Feedback      *string
				SubmittedAt   string
			}
			var rows []row
			err := database.DB.Raw(`
				SELECT a.title AS activity_title, sub.status, sub.grade, sub.feedback,
				       to_char(sub.submitted_at, 'YYYY-MM-DD') AS submitted_at
				FROM submissions sub
				JOIN activities a ON a.id = sub.activity_id
				WHERE sub.participant_id = ?
				ORDER BY sub.submitted_at DESC
				LIMIT 50
			`, s.UserID).Scan(&rows).Error
			if err != nil {
				return "", err
			}
			return toJSON(rows), nil
		},
	}
}

// ── get_my_goals ─────────────────────────────────────────────────────

func getMyGoalsTool() chatbot.Tool {
	return chatbot.Tool{
		Def: provider.ToolDef{
			Name:        "get_my_goals",
			Description: "List the caller's coaching goals, with progress percent and status (active, completed, dropped).",
			Parameters:  noParams(),
		},
		Run: func(_ context.Context, s scope.Scope, _ string) (string, error) {
			type row struct {
				Title    string
				Status   string
				Progress int
			}
			var rows []row
			err := database.DB.Raw(`
				SELECT title, status, COALESCE(progress, 0) AS progress
				FROM participant_goals
				WHERE participant_id = ?
				ORDER BY created_at DESC
				LIMIT 20
			`, s.UserID).Scan(&rows).Error
			if err != nil {
				return "", err
			}
			return toJSON(rows), nil
		},
	}
}

// ── get_my_upcoming_sessions ────────────────────────────────────────

func getMyUpcomingSessionsTool() chatbot.Tool {
	return chatbot.Tool{
		Def: provider.ToolDef{
			Name:        "get_my_upcoming_sessions",
			Description: "List the caller's upcoming scheduled class or coaching sessions across their cohorts.",
			Parameters:  noParams(),
		},
		Run: func(_ context.Context, s scope.Scope, _ string) (string, error) {
			type row struct {
				Title       string
				SessionType string
				ScheduledAt string
				DurationMin int
			}
			var rows []row
			err := database.DB.Raw(`
				SELECT DISTINCT cs.title, cs.session_type, to_char(cs.scheduled_at, 'YYYY-MM-DD HH24:MI') AS scheduled_at,
				       cs.duration_mins AS duration_min
				FROM class_sessions cs
				JOIN enrollments e ON e.cohort_id = cs.cohort_id
				WHERE e.user_id = ? AND e.status <> 'withdrawn'
				  AND cs.status IN ('scheduled', 'live') AND cs.scheduled_at >= NOW()
				ORDER BY scheduled_at ASC
				LIMIT 20
			`, s.UserID).Scan(&rows).Error
			if err != nil {
				return "", err
			}
			return toJSON(rows), nil
		},
	}
}

// ── get_my_coaching ─────────────────────────────────────────────────

func getMyCoachingTool() chatbot.Tool {
	return chatbot.Tool{
		Def: provider.ToolDef{
			Name:        "get_my_coaching",
			Description: "Get the caller's assigned coach and coaching engagement status, if they have one.",
			Parameters:  noParams(),
		},
		Run: func(_ context.Context, s scope.Scope, _ string) (string, error) {
			type row struct {
				CoachName         string
				EngagementName    string
				Status            string
				Frequency         string
				TotalSessions     int
				CompletedSessions int
			}
			var r row
			err := database.DB.Raw(`
				SELECT u.name AS coach_name, ce.name AS engagement_name, ce.status,
				       ce.frequency, ce.total_sessions, ce.completed_sessions
				FROM coaching_engagement_participants cep
				JOIN coaching_engagements ce ON ce.id = cep.engagement_id
				JOIN users u ON u.id = ce.coach_id
				WHERE cep.participant_id = ? AND ce.status IN ('scheduled', 'active')
				ORDER BY ce.created_at DESC
				LIMIT 1
			`, s.UserID).Scan(&r).Error
			if err != nil {
				return "", err
			}
			if r.CoachName == "" {
				return `{"message":"no active coaching engagement"}`, nil
			}
			return toJSON(r), nil
		},
	}
}

// ── get_my_feedback360 ──────────────────────────────────────────────

func getMyFeedback360Tool() chatbot.Tool {
	return chatbot.Tool{
		Def: provider.ToolDef{
			Name:        "get_my_feedback360",
			Description: "Get the status of the caller's most recent 360-degree feedback cycle: how many raters have responded.",
			Parameters:  noParams(),
		},
		Run: func(_ context.Context, s scope.Scope, _ string) (string, error) {
			type row struct {
				Title          string
				Status         string
				Deadline       *string
				RatersTotal    int
				RatersSubmitted int
			}
			var r row
			err := database.DB.Raw(`
				SELECT fc.title, fc.status, to_char(fc.deadline, 'YYYY-MM-DD') AS deadline,
				       COUNT(fr.id) AS raters_total,
				       COUNT(fr.id) FILTER (WHERE fr.status = 'submitted') AS raters_submitted
				FROM feedback_cycles fc
				LEFT JOIN feedback_raters fr ON fr.cycle_id = fc.id
				WHERE fc.participant_id = ?
				GROUP BY fc.id
				ORDER BY fc.created_at DESC
				LIMIT 1
			`, s.UserID).Scan(&r).Error
			if err != nil {
				return "", err
			}
			if r.Title == "" {
				return `{"message":"no 360 feedback cycle yet"}`, nil
			}
			return toJSON(r), nil
		},
	}
}

// ── get_my_capstone ─────────────────────────────────────────────────

func getMyCapstoneTool() chatbot.Tool {
	return chatbot.Tool{
		Def: provider.ToolDef{
			Name:        "get_my_capstone",
			Description: "Get the caller's capstone team and project submission status, if they're on a capstone team.",
			Parameters:  noParams(),
		},
		Run: func(_ context.Context, s scope.Scope, _ string) (string, error) {
			type row struct {
				GroupName         string
				Title             string
				SubmissionStatus  string
				PanelStatus       string
			}
			var r row
			err := database.DB.Raw(`
				SELECT g.name AS group_name, ct.title, ct.submission_status, ct.panel_status
				FROM enrollments e
				JOIN cohort_groups g ON g.id = e.group_id AND g.group_type = 'als_team'
				JOIN capstone_teams ct ON ct.group_id = g.id
				WHERE e.user_id = ? AND e.role = 'participant'
				ORDER BY e.enrolled_at DESC
				LIMIT 1
			`, s.UserID).Scan(&r).Error
			if err != nil {
				return "", err
			}
			if r.GroupName == "" {
				return `{"message":"not on a capstone team"}`, nil
			}
			return toJSON(r), nil
		},
	}
}

// ── get_my_surveys ──────────────────────────────────────────────────

func getMySurveysTool() chatbot.Tool {
	return chatbot.Tool{
		Def: provider.ToolDef{
			Name:        "get_my_surveys",
			Description: "List the caller's pending and completed surveys across their programs.",
			Parameters:  noParams(),
		},
		Run: func(_ context.Context, s scope.Scope, _ string) (string, error) {
			type row struct {
				Title     string
				Completed bool
			}
			var rows []row
			err := database.DB.Raw(`
				SELECT a.title, (sc.id IS NOT NULL) AS completed
				FROM enrollments e
				JOIN cohorts c ON c.id = e.cohort_id
				JOIN program_phases ph ON ph.program_id = c.program_id
				JOIN activities a ON a.phase_id = ph.id AND a.type = 'survey'
				LEFT JOIN survey_completions sc ON sc.activity_id = a.id AND sc.participant_id = e.user_id
				WHERE e.user_id = ? AND e.status <> 'withdrawn'
				ORDER BY completed ASC, a.title
				LIMIT 50
			`, s.UserID).Scan(&rows).Error
			if err != nil {
				return "", err
			}
			return toJSON(rows), nil
		},
	}
}

// ── search_resources ────────────────────────────────────────────────

type searchResourcesArgs struct {
	Query string `json:"query"`
}

func searchResourcesTool() chatbot.Tool {
	return chatbot.Tool{
		Def: provider.ToolDef{
			Name: "search_resources",
			Description: "Semantic search over the caller's program learning resources/content library. " +
				"Use this when the caller asks for a resource, reading, or material on a topic.",
			Parameters: chatbot.JSONSchema(map[string]any{
				"query": map[string]any{"type": "string", "description": "What to search for"},
			}, "query"),
		},
		Run: func(ctx context.Context, s scope.Scope, argsJSON string) (string, error) {
			var args searchResourcesArgs
			if err := json.Unmarshal([]byte(argsJSON), &args); err != nil || args.Query == "" {
				return `{"error":"query is required"}`, nil
			}
			chunks, err := rag.Retrieve(ctx, s, args.Query, 5)
			if err != nil {
				return "", err
			}
			type result struct {
				Title   string `json:"title"`
				Excerpt string `json:"excerpt"`
			}
			out := make([]result, 0, len(chunks))
			for _, c := range chunks {
				excerpt := c.Content
				if len(excerpt) > 300 {
					excerpt = excerpt[:300] + "…"
				}
				out = append(out, result{Title: c.Title, Excerpt: excerpt})
			}
			return toJSON(out), nil
		},
	}
}
