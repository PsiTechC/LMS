package aggregate

import (
	"context"
	_ "embed"
	"encoding/json"
	"fmt"

	"github.com/xa-lms/api/internal/ai/provider"
	"github.com/xa-lms/api/internal/ai/scope"
	"github.com/xa-lms/api/pkg/database"
)

//go:embed prompts/brief.tmpl
var briefSystemPrompt string

//go:embed prompts/feedback360.tmpl
var feedback360SystemPrompt string

//go:embed prompts/faculty_cohort_brief.tmpl
var facultyCohortBriefSystemPrompt string

//go:embed prompts/cohort_health.tmpl
var cohortHealthSystemPrompt string

//go:embed prompts/platform_optimization.tmpl
var platformOptimizationSystemPrompt string

//go:embed prompts/cohort_pulse.tmpl
var cohortPulseSystemPrompt string

//go:embed prompts/analytics_insight.tmpl
var analyticsInsightSystemPrompt string

//go:embed prompts/daily_focus.tmpl
var dailyFocusSystemPrompt string

//go:embed prompts/survey_insight.tmpl
var surveyInsightSystemPrompt string

//go:embed prompts/coaching_pulse.tmpl
var coachingPulseSystemPrompt string

// Kind selects which structured metrics get pulled for the brief, and which
// system prompt frames the synthesis. Faculty's Cohort Intelligence Brief,
// PM's ROI Narrative / Cohort Health Score, Super Admin's Platform
// Optimization Advisor / Cross-Org Benchmarks, the participant's 360
// Narrative Summary, and Faculty's pre-session Cohort Brief all route
// through GenerateBrief with a different Kind - same synthesis step,
// different metric query and prompt. The "*Pulse"/"*Insight"/"*Focus" kinds
// below are the short one-line "AI Pulse" cards shown on-page-load across
// Cohort Management, Analytics, My Journey, Surveys, and Coaching - same
// GenerateBrief mechanism, just a one-sentence prompt instead of a
// multi-sentence brief.
type Kind string

const (
	KindCohortIntelligence   Kind = "cohort_intelligence"
	KindFeedback360Narrative Kind = "feedback_360_narrative"
	KindFacultyCohortBrief   Kind = "faculty_cohort_brief"
	KindCohortHealth         Kind = "cohort_health"
	KindPlatformOptimization Kind = "platform_optimization"
	KindCohortPulse          Kind = "cohort_pulse"
	KindAnalyticsInsight     Kind = "analytics_insight"
	KindDailyFocus           Kind = "daily_focus"
	KindSurveyInsight        Kind = "survey_insight"
	KindCoachingPulse        Kind = "coaching_pulse"
)

func (k Kind) systemPrompt() string {
	switch k {
	case KindFeedback360Narrative:
		return feedback360SystemPrompt
	case KindFacultyCohortBrief:
		return facultyCohortBriefSystemPrompt
	case KindCohortHealth:
		return cohortHealthSystemPrompt
	case KindPlatformOptimization:
		return platformOptimizationSystemPrompt
	case KindCohortPulse:
		return cohortPulseSystemPrompt
	case KindAnalyticsInsight:
		return analyticsInsightSystemPrompt
	case KindDailyFocus:
		return dailyFocusSystemPrompt
	case KindSurveyInsight:
		return surveyInsightSystemPrompt
	case KindCoachingPulse:
		return coachingPulseSystemPrompt
	default:
		return briefSystemPrompt
	}
}

// GenerateBrief pulls structured metrics for kind (scoped to s), then asks
// the model to synthesize a narrative brief using that kind's prompt.
// Unsupported kinds return an error rather than silently generating an
// ungrounded brief.
func GenerateBrief(ctx context.Context, s scope.Scope, kind Kind, tier provider.Tier) (string, error) {
	metrics, err := loadMetrics(kind, s)
	if err != nil {
		return "", err
	}

	msgs := []provider.ChatMessage{
		{Role: "system", Content: kind.systemPrompt()},
		{Role: "user", Content: "METRICS:\n" + metrics},
	}
	cfg := provider.Resolve(s, tier)
	result, err := provider.Complete(ctx, cfg, msgs)
	if err != nil {
		return "", err
	}
	return result.Content, nil
}

func loadMetrics(kind Kind, s scope.Scope) (string, error) {
	switch kind {
	case KindCohortIntelligence:
		return cohortIntelligenceMetrics(s)
	case KindFeedback360Narrative:
		return feedback360NarrativeMetrics(s)
	case KindFacultyCohortBrief:
		return facultyCohortBriefMetrics(s)
	case KindCohortHealth:
		return cohortHealthMetrics(s)
	case KindPlatformOptimization:
		return platformOptimizationMetrics(s)
	case KindCohortPulse:
		return cohortPulseMetrics(s)
	case KindAnalyticsInsight:
		return analyticsInsightMetrics(s)
	case KindDailyFocus:
		return dailyFocusMetrics(s)
	case KindSurveyInsight:
		return surveyInsightMetrics(s)
	case KindCoachingPulse:
		return coachingPulseMetrics(s)
	default:
		return "", fmt.Errorf("aggregate: unsupported brief kind %q", kind)
	}
}

// CohortHealthScore is the executive-facing composite score + narrative for
// a single cohort, shown to a Program Manager with drill-down.
type CohortHealthScore struct {
	Score     int    `json:"score"`
	Label     string `json:"label"`
	Narrative string `json:"narrative"`
}

// GenerateCohortHealthScore pulls the same class of metrics as the Cohort
// Intelligence Brief (engagement, at-risk mix, completion) scoped to a
// single cohort, and asks the model to return a structured 0-100 score plus
// a short narrative - JSON mode, like rubric.Grade, since the caller needs
// a number to render alongside every cohort card, not just prose.
func GenerateCohortHealthScore(ctx context.Context, s scope.Scope, tier provider.Tier) (*CohortHealthScore, error) {
	metrics, err := cohortHealthMetrics(s)
	if err != nil {
		return nil, err
	}

	msgs := []provider.ChatMessage{
		{Role: "system", Content: cohortHealthSystemPrompt},
		{Role: "user", Content: "METRICS:\n" + metrics},
	}
	cfg := provider.Resolve(s, tier)
	result, err := provider.Complete(ctx, cfg, msgs, provider.WithJSONMode())
	if err != nil {
		return nil, err
	}

	var score CohortHealthScore
	if err := json.Unmarshal([]byte(result.Content), &score); err != nil {
		return nil, fmt.Errorf("aggregate: AI returned an unexpected response format: %w", err)
	}
	return &score, nil
}

// cohortHealthMetrics scopes the same engagement/at-risk/completion signals
// used by cohortIntelligenceMetrics down to a single cohort rather than a
// whole program.
func cohortHealthMetrics(s scope.Scope) (string, error) {
	if s.CohortID == nil {
		return "", fmt.Errorf("aggregate: cohort_health requires a cohort-scoped Scope")
	}

	type row struct {
		TotalEnrolled  int
		AvgCompletion  float64
		HighRisk       int
		MediumRisk     int
		LowRisk        int
		WithdrawnCount int
	}
	var r row
	err := database.DB.Raw(`
		SELECT
			COUNT(*) FILTER (WHERE e.status <> 'withdrawn') AS total_enrolled,
			COALESCE(AVG(e.completion_percent) FILTER (WHERE e.status <> 'withdrawn'), 0) AS avg_completion,
			COUNT(*) FILTER (WHERE e.risk_level = 'high' AND e.status <> 'withdrawn') AS high_risk,
			COUNT(*) FILTER (WHERE e.risk_level = 'medium' AND e.status <> 'withdrawn') AS medium_risk,
			COUNT(*) FILTER (WHERE e.risk_level = 'low' AND e.status <> 'withdrawn') AS low_risk,
			COUNT(*) FILTER (WHERE e.status = 'withdrawn') AS withdrawn_count
		FROM enrollments e
		WHERE e.cohort_id = ?
	`, s.CohortID.String()).Scan(&r).Error
	if err != nil {
		return "", err
	}

	var attendancePct float64
	err = database.DB.Raw(`
		SELECT COALESCE(
			(SELECT COUNT(*) FILTER (WHERE sa.status = 'present')::float / NULLIF(COUNT(*), 0) * 100
			 FROM session_attendance sa
			 JOIN class_sessions cs ON cs.id = sa.session_id
			 WHERE cs.cohort_id = ?), 0
		)
	`, s.CohortID.String()).Scan(&attendancePct).Error
	if err != nil {
		return "", err
	}

	return fmt.Sprintf(
		"Total enrolled: %d\nAverage completion: %.1f%%\nAttendance-based engagement: %.0f%%\nRisk distribution: %d high, %d medium, %d low\nWithdrawn: %d",
		r.TotalEnrolled, r.AvgCompletion, attendancePct, r.HighRisk, r.MediumRisk, r.LowRisk, r.WithdrawnCount,
	), nil
}

// platformOptimizationMetrics reads the same system_metrics /
// system_health_trend tables systemhealth owns (raw SQL against shared
// tables, the established internal/ai/* convention - see CLAUDE.md) and
// compares the last 24h window against the prior 24h window, plus live DB
// connection pool stats. This platform has no CPU/memory/disk/storage
// telemetry (files are stored as Postgres BYTEA, S3 isn't wired up), so
// those are deliberately not queried - the prompt is told not to reason
// about capacity dimensions it can't see.
func platformOptimizationMetrics(_ scope.Scope) (string, error) {
	type windowRow struct {
		TotalReq   int64
		TotalErr   int64
		SumLatency float64
		MaxLatency float64
	}
	loadWindow := func(since, until string) (windowRow, error) {
		var r windowRow
		err := database.DB.Raw(`
			SELECT
				COALESCE(SUM(request_count), 0) AS total_req,
				COALESCE(SUM(error_count), 0) AS total_err,
				COALESCE(SUM(sum_latency_ms), 0) AS sum_latency,
				COALESCE(MAX(max_latency_ms), 0) AS max_latency
			FROM system_metrics
			WHERE bucket_start >= NOW() - (?)::interval AND bucket_start < NOW() - (?)::interval
		`, since, until).Scan(&r).Error
		return r, err
	}

	current, err := loadWindow("24 hours", "0 hours")
	if err != nil {
		return "", err
	}
	previous, err := loadWindow("48 hours", "24 hours")
	if err != nil {
		return "", err
	}

	var pool struct {
		OpenConnections int
		InUse           int
		Idle            int
		MaxOpen         int
		WaitCount       int64
	}
	sqlDB, err := database.DB.DB()
	if err != nil {
		return "", err
	}
	stats := sqlDB.Stats()
	pool.OpenConnections, pool.InUse, pool.Idle, pool.MaxOpen, pool.WaitCount =
		stats.OpenConnections, stats.InUse, stats.Idle, stats.MaxOpenConnections, stats.WaitCount

	avgLatency := func(r windowRow) float64 {
		if r.TotalReq == 0 {
			return 0
		}
		return r.SumLatency / float64(r.TotalReq)
	}
	errorRate := func(r windowRow) float64 {
		if r.TotalReq == 0 {
			return 0
		}
		return float64(r.TotalErr) / float64(r.TotalReq) * 100
	}

	return fmt.Sprintf(
		"Last 24h: %d requests, %.2f%% error rate, %.0fms avg latency, %.0fms max latency\n"+
			"Prior 24h (for comparison): %d requests, %.2f%% error rate, %.0fms avg latency\n"+
			"Database connection pool (live): %d open / %d max, %d in use, %d idle, %d waits so far this process\n"+
			"No CPU, memory, disk, or object-storage metrics are collected by this platform.",
		current.TotalReq, errorRate(current), avgLatency(current), current.MaxLatency,
		previous.TotalReq, errorRate(previous), avgLatency(previous),
		pool.OpenConnections, pool.MaxOpen, pool.InUse, pool.Idle, pool.WaitCount,
	), nil
}

func cohortIntelligenceMetrics(s scope.Scope) (string, error) {
	if s.ProgramID == nil {
		return "", fmt.Errorf("aggregate: cohort_intelligence requires a program-scoped Scope")
	}

	type row struct {
		TotalEnrolled  int
		AvgCompletion  float64
		HighRisk       int
		MediumRisk     int
		LowRisk        int
		WithdrawnCount int
	}
	var r row
	err := database.DB.Raw(`
		SELECT
			COUNT(*) FILTER (WHERE e.status <> 'withdrawn') AS total_enrolled,
			COALESCE(AVG(e.completion_percent) FILTER (WHERE e.status <> 'withdrawn'), 0) AS avg_completion,
			COUNT(*) FILTER (WHERE e.risk_level = 'high' AND e.status <> 'withdrawn') AS high_risk,
			COUNT(*) FILTER (WHERE e.risk_level = 'medium' AND e.status <> 'withdrawn') AS medium_risk,
			COUNT(*) FILTER (WHERE e.risk_level = 'low' AND e.status <> 'withdrawn') AS low_risk,
			COUNT(*) FILTER (WHERE e.status = 'withdrawn') AS withdrawn_count
		FROM enrollments e
		JOIN cohorts c ON c.id = e.cohort_id
		WHERE c.program_id = ?
	`, *s.ProgramID).Scan(&r).Error
	if err != nil {
		return "", err
	}

	return fmt.Sprintf(
		"Total enrolled: %d\nAverage completion: %.1f%%\nRisk distribution: %d high, %d medium, %d low\nWithdrawn: %d",
		r.TotalEnrolled, r.AvgCompletion, r.HighRisk, r.MediumRisk, r.LowRisk, r.WithdrawnCount,
	), nil
}
