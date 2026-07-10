package ai

import (
	"errors"
	"fmt"
	"strings"

	"github.com/google/uuid"
	"github.com/xa-lms/api/pkg/database"
	"gorm.io/gorm"
)

var ErrNotFound = errors.New("conversation not found")

// ── Conversations & messages ───────────────────────────────────────

func createConversation(c *Conversation) error {
	return database.DB.Create(c).Error
}

func listConversations(userID string) ([]Conversation, error) {
	var rows []Conversation
	err := database.DB.Where("user_id = ?", userID).Order("updated_at DESC").Find(&rows).Error
	return rows, err
}

// getConversation returns a conversation only if it belongs to the user.
func getConversation(userID, convID string) (*Conversation, error) {
	var c Conversation
	err := database.DB.Where("id = ? AND user_id = ?", convID, userID).First(&c).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrNotFound
	}
	return &c, err
}

func listMessages(convID string) ([]Message, error) {
	var rows []Message
	err := database.DB.Where("conversation_id = ?", convID).Order("created_at ASC").Find(&rows).Error
	return rows, err
}

func addMessage(convID uuid.UUID, role, content string) (*Message, error) {
	m := &Message{ConversationID: convID, Role: role, Content: content}
	if err := database.DB.Create(m).Error; err != nil {
		return nil, err
	}
	return m, nil
}

func touchConversation(convID uuid.UUID, title string) error {
	updates := map[string]any{"updated_at": gorm.Expr("NOW()")}
	if title != "" {
		updates["title"] = title
	}
	return database.DB.Model(&Conversation{}).Where("id = ?", convID).Updates(updates).Error
}

func orgIDForUser(userID string) string {
	var orgID string
	database.DB.Raw(`SELECT org_id::text FROM org_members WHERE user_id = ?::uuid LIMIT 1`, userID).Scan(&orgID)
	return orgID
}

// orgFeatureEnabled reads organizations.feature_flags JSONB; a feature is on
// unless explicitly set to false (default-on when unset).
func orgFeatureEnabled(orgID, flag string) bool {
	var val *bool
	database.DB.Raw(`SELECT (feature_flags ->> ?)::boolean FROM organizations WHERE id = ?::uuid`, flag, orgID).Scan(&val)
	if val == nil {
		return true
	}
	return *val
}

// ── Context builder ─────────────────────────────────────────────────
// Assembles a compact, factual snapshot of the participant's own program,
// progress, goals, sessions, and available resources for the system prompt.

type enrollmentCtx struct {
	ProgramID         string
	ProgramTitle      string
	CohortID          string
	CohortName        string
	OrgName           string
	StartDate         string
	EndDate           string
	CompletionPercent int
	RiskLevel         string
}

func buildParticipantContext(userID, name string) string {
	var b strings.Builder
	b.WriteString(fmt.Sprintf("PARTICIPANT: %s\n", name))

	// Primary active enrollment.
	var e enrollmentCtx
	database.DB.Raw(`
		SELECT p.id::text AS program_id, p.title AS program_title,
		       c.id::text AS cohort_id, c.name AS cohort_name,
		       COALESCE(o.name, '') AS org_name,
		       COALESCE(to_char(c.start_date, 'Mon DD, YYYY'), '') AS start_date,
		       COALESCE(to_char(c.end_date, 'Mon DD, YYYY'), '') AS end_date,
		       e.completion_percent, e.risk_level
		FROM enrollments e
		JOIN cohorts c  ON c.id = e.cohort_id
		JOIN programs p ON p.id = c.program_id
		LEFT JOIN organizations o ON o.id = p.org_id
		WHERE e.user_id = ?::uuid AND e.status != 'withdrawn'
		ORDER BY e.enrolled_at DESC
		LIMIT 1
	`, userID).Scan(&e)

	if e.ProgramID == "" {
		b.WriteString("PROGRAM: (not currently enrolled in an active program)\n")
		return b.String()
	}

	if e.OrgName != "" {
		b.WriteString(fmt.Sprintf("ORGANIZATION: %s\n", e.OrgName))
	}
	b.WriteString(fmt.Sprintf("PROGRAM: %s (cohort: %s)\n", e.ProgramTitle, e.CohortName))
	if e.StartDate != "" {
		b.WriteString(fmt.Sprintf("COHORT DATES: %s – %s\n", e.StartDate, e.EndDate))
	}
	b.WriteString(fmt.Sprintf("OVERALL PROGRESS: %d%% complete. Risk level: %s.\n", e.CompletionPercent, e.RiskLevel))

	// Activity counts.
	var counts struct{ Total, Done int }
	database.DB.Raw(`
		SELECT
			(SELECT COUNT(*) FROM activities a JOIN program_phases ph ON ph.id = a.phase_id WHERE ph.program_id = ?::uuid) AS total,
			(SELECT COUNT(*) FROM activity_progress ap
			   JOIN activities a ON a.id = ap.activity_id
			   JOIN program_phases ph ON ph.id = a.phase_id
			   WHERE ph.program_id = ?::uuid AND ap.user_id = ?::uuid AND ap.status = 'completed') AS done
	`, e.ProgramID, e.ProgramID, userID).Scan(&counts)
	b.WriteString(fmt.Sprintf("ACTIVITIES: %d of %d completed.\n", counts.Done, counts.Total))

	// Goals.
	type goalRow struct {
		Title    string
		Progress int
		Status   string
	}
	var goals []goalRow
	database.DB.Raw(`SELECT title, progress, status FROM participant_goals WHERE participant_id = ?::uuid ORDER BY created_at DESC LIMIT 5`, userID).Scan(&goals)
	if len(goals) > 0 {
		b.WriteString("GOALS:\n")
		for _, g := range goals {
			b.WriteString(fmt.Sprintf("  - %s (%d%%, %s)\n", g.Title, g.Progress, g.Status))
		}
	}

	// Upcoming sessions in the cohort.
	type sessRow struct {
		Title       string
		ScheduledAt string
	}
	var sessions []sessRow
	database.DB.Raw(`
		SELECT title, to_char(scheduled_at, 'Mon DD, HH24:MI') AS scheduled_at
		FROM class_sessions
		WHERE cohort_id = ?::uuid AND status IN ('scheduled','live') AND scheduled_at >= NOW()
		ORDER BY scheduled_at ASC LIMIT 3
	`, e.CohortID).Scan(&sessions)
	if len(sessions) > 0 {
		b.WriteString("UPCOMING SESSIONS:\n")
		for _, s := range sessions {
			b.WriteString(fmt.Sprintf("  - %s (%s)\n", s.Title, s.ScheduledAt))
		}
	}

	// Suggestable resources for this program.
	type resRow struct {
		Title     string
		AssetType string
	}
	var res []resRow
	database.DB.Raw(`
		SELECT ca.title, ca.asset_type::text AS asset_type
		FROM content_assets ca
		JOIN content_asset_programs cap ON cap.asset_id = ca.id
		WHERE cap.program_id = ?::uuid AND ca.status = 'active'
		ORDER BY ca.created_at DESC LIMIT 8
	`, e.ProgramID).Scan(&res)
	if len(res) > 0 {
		b.WriteString("AVAILABLE RESOURCES (only suggest from this list):\n")
		for _, r := range res {
			b.WriteString(fmt.Sprintf("  - %s [%s]\n", r.Title, r.AssetType))
		}
	}

	// Program outline: phases with their activities and computed due dates
	// (cohort start + phase start_day + activity due_day_offset).
	type outlineRow struct {
		PhaseNumber   int
		PhaseTitle    string
		WeekLabel     string
		ActivityTitle string
		ActivityType  string
		Due           string
	}
	var outline []outlineRow
	database.DB.Raw(`
		SELECT ph.phase_number, ph.title AS phase_title, COALESCE(ph.week_label, '') AS week_label,
		       a.title AS activity_title, a.type AS activity_type,
		       COALESCE(to_char(c.start_date + ((COALESCE(ph.start_day,0) + COALESCE(a.due_day_offset,0)) || ' days')::interval, 'Mon DD'), 'TBD') AS due
		FROM activities a
		JOIN program_phases ph ON ph.id = a.phase_id
		JOIN cohorts c ON c.id = ?::uuid
		WHERE ph.program_id = ?::uuid
		ORDER BY ph.phase_number, a.sort_order
		LIMIT 60
	`, e.CohortID, e.ProgramID).Scan(&outline)
	if len(outline) > 0 {
		b.WriteString("PROGRAM OUTLINE (phases and activity due dates):\n")
		lastPhase := -1
		for _, o := range outline {
			if o.PhaseNumber != lastPhase {
				wk := ""
				if o.WeekLabel != "" {
					wk = " (" + o.WeekLabel + ")"
				}
				b.WriteString(fmt.Sprintf("  Phase %d: %s%s\n", o.PhaseNumber, o.PhaseTitle, wk))
				lastPhase = o.PhaseNumber
			}
			b.WriteString(fmt.Sprintf("    - %s [%s] — due %s\n", o.ActivityTitle, o.ActivityType, o.Due))
		}
	}

	return b.String()
}
