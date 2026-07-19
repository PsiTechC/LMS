package leaderboard

import (
	"errors"
	"math"
	"time"

	"github.com/google/uuid"
	"github.com/xa-lms/api/pkg/database"
)

const (
	TierFullEarly     = "full_early"
	TierHalfEarly     = "half_early"
	TierQuarterOnTime = "quarter_on_time"
	TierLateZero      = "late_zero"
	TierLegacyFull    = "legacy_full"
)

// AwardResult is the immutable decision stored with each successful source event.
type AwardResult struct {
	AwardedPoints, ElapsedCalendarDays int
	Multiplier                         float64
	Tier                               string
}

// CalculateAward uses calendar dates (not rolling 24-hour windows). Missing
// legacy timing deliberately preserves the old full-score behaviour.
func CalculateAward(base int, availableAt, dueAt *time.Time, completedAt time.Time, timezone string) (AwardResult, error) {
	if base < 0 {
		return AwardResult{}, errors.New("base points cannot be negative")
	}
	if availableAt == nil || dueAt == nil {
		return AwardResult{base, 0, 1, TierLegacyFull}, nil
	}
	loc, err := time.LoadLocation(timezone)
	if err != nil {
		return AwardResult{}, err
	}
	if dueAt.Before(*availableAt) {
		return AwardResult{}, errors.New("due time is before availability")
	}
	completion := completedAt.In(loc)
	available := availableAt.In(loc)
	due := dueAt.In(loc)
	if completion.After(due) {
		return AwardResult{0, 0, 0, TierLateZero}, nil
	}
	cday := time.Date(completion.Year(), completion.Month(), completion.Day(), 0, 0, 0, 0, loc)
	aday := time.Date(available.Year(), available.Month(), available.Day(), 0, 0, 0, 0, loc)
	// Compare date labels in UTC. Subtracting local midnights is wrong around
	// daylight-saving transitions, where a local calendar day can be 23 or 25h.
	days := int(time.Date(cday.Year(), cday.Month(), cday.Day(), 0, 0, 0, 0, time.UTC).Sub(time.Date(aday.Year(), aday.Month(), aday.Day(), 0, 0, 0, 0, time.UTC)).Hours() / 24)
	if days < 0 {
		return AwardResult{}, errors.New("completion is before availability")
	}
	multiplier, tier := 0.25, TierQuarterOnTime
	if days <= 1 {
		multiplier, tier = 1, TierFullEarly
	} else if days <= 3 {
		multiplier, tier = .5, TierHalfEarly
	}
	return AwardResult{int(math.Floor(float64(base)*multiplier + .5)), days, multiplier, tier}, nil
}

type awardContext struct {
	OrganizationID, EnrollmentID, ProgramID, CohortID string
	ActivityType                                      string
	Timezone                                          string
	AvailableAt, DueAt                                *time.Time
}

// AwardActivity is safe to call after a source row has been committed: the DB
// unique key makes retries and concurrent requests idempotent.
func AwardActivity(participantID, activityID, sourceID uuid.UUID, activityType string, base int, completedAt time.Time) error {
	var c awardContext
	err := database.DB.Raw(`SELECT p.org_id::text organization_id, e.id::text enrollment_id, p.id::text program_id, c.id::text cohort_id, a.type activity_type,
      COALESCE(o.timezone,'UTC') timezone,
      (c.start_date + (a.start_day - 1) * INTERVAL '1 day')::timestamptz available_at,
      (c.start_date + (a.start_day + a.due_day_offset) * INTERVAL '1 day' + INTERVAL '1 day' - INTERVAL '1 microsecond') due_at
      FROM activities a JOIN program_phases pp ON pp.id=a.phase_id JOIN programs p ON p.id=pp.program_id JOIN organizations o ON o.id=p.org_id
      JOIN enrollments e ON e.user_id=? AND e.role='participant' JOIN cohorts c ON c.id=e.cohort_id AND c.program_id=p.id
      WHERE a.id=? AND e.status <> 'withdrawn' ORDER BY e.enrolled_at DESC LIMIT 1`, participantID, activityID).Scan(&c).Error
	if err != nil {
		return err
	}
	if c.OrganizationID == "" {
		return errors.New("participant is not enrolled for activity")
	}
	if activityType == "" {
		activityType = c.ActivityType
	}
	if base == 0 {
		switch activityType {
		case "video", "pdf", "case_study":
			base = PointsPerModule
		case "assessment":
			base = PointsPerAssessment
		case "reflection", "journal":
			base = PointsPerReflection
		default:
			return nil // not a scoreable activity
		}
	}
	// Null cohort dates become legacy-full rather than an invented timestamp.
	r, err := CalculateAward(base, c.AvailableAt, c.DueAt, completedAt, c.Timezone)
	if err != nil {
		return err
	}
	return database.DB.Exec(`INSERT INTO leaderboard_awards (organization_id,participant_id,enrollment_id,program_id,cohort_id,activity_id,activity_type,source_record_id,base_points,multiplier,scoring_tier,awarded_points,available_at,due_at,completed_at,elapsed_calendar_days,timezone)
      VALUES (?::uuid,?::uuid,?::uuid,?::uuid,?::uuid,?::uuid,?,?::uuid,?,?,?,?,?,?,?,?,?) ON CONFLICT (organization_id,participant_id,activity_type,source_record_id) DO NOTHING`,
		c.OrganizationID, participantID, c.EnrollmentID, c.ProgramID, c.CohortID, activityID, activityType, sourceID, base, r.Multiplier, r.Tier, r.AwardedPoints, c.AvailableAt, c.DueAt, completedAt, r.ElapsedCalendarDays, c.Timezone).Error
}

// AwardSubmission preserves assessment's once-per-activity leaderboard
// semantics while using the individual submission row for journal/reflection.
func AwardSubmission(participantID, activityID, submissionID uuid.UUID, completedAt time.Time) error {
	var kind string
	if err := database.DB.Raw(`SELECT type FROM activities WHERE id=?`, activityID).Scan(&kind).Error; err != nil {
		return err
	}
	sourceID := submissionID
	if kind == "assessment" {
		sourceID = activityID
	}
	return AwardActivity(participantID, activityID, sourceID, kind, 0, completedAt)
}

// AwardedBreakdown aggregates immutable awards without enrollment joins, so a
// participant's multiple cohort enrollments cannot multiply their points.
func AwardedBreakdown(participantID, programID uuid.UUID) (modules, assessments, discussions, reflections, coaching int, err error) {
	var row struct{ Modules, Assessments, Discussions, Reflections, Coaching int }
	err = database.DB.Raw(`SELECT
      COALESCE(SUM(awarded_points) FILTER (WHERE activity_type IN ('video','pdf','case_study')),0) AS modules,
      COALESCE(SUM(awarded_points) FILTER (WHERE activity_type = 'assessment'),0) AS assessments,
      COALESCE(SUM(awarded_points) FILTER (WHERE activity_type IN ('discussion_post','discussion_reply')),0) AS discussions,
      COALESCE(SUM(awarded_points) FILTER (WHERE activity_type IN ('reflection','journal')),0) AS reflections,
      COALESCE(SUM(awarded_points) FILTER (WHERE activity_type = 'coaching'),0) AS coaching
      FROM leaderboard_awards WHERE participant_id = ? AND program_id = ?`, participantID, programID).Scan(&row).Error
	return row.Modules, row.Assessments, row.Discussions, row.Reflections, row.Coaching, err
}

// AwardDiscussion records a post or reply against its program context. The
// discussion domain has no faculty timing window, so nil timing intentionally
// creates the documented legacy_full award rather than fabricated dates.
func AwardDiscussion(participantID, programID, cohortID, sourceID uuid.UUID, activityType string, completedAt time.Time) error {
	if activityType != "discussion_post" && activityType != "discussion_reply" {
		return errors.New("invalid discussion award type")
	}
	var c struct {
		OrganizationID, EnrollmentID string
		Timezone                     string
	}
	err := database.DB.Raw(`SELECT p.org_id::text organization_id, e.id::text enrollment_id, COALESCE(o.timezone, 'UTC') timezone
		FROM programs p JOIN organizations o ON o.id=p.org_id
		JOIN enrollments e ON e.user_id=? AND e.cohort_id=? AND e.role='participant' AND e.status <> 'withdrawn'
		WHERE p.id=? LIMIT 1`, participantID, cohortID, programID).Scan(&c).Error
	if err != nil {
		return err
	}
	if c.OrganizationID == "" {
		return errors.New("participant is not enrolled for discussion")
	}
	r, err := CalculateAward(PointsPerDiscussion, nil, nil, completedAt, c.Timezone)
	if err != nil {
		return err
	}
	return database.DB.Exec(`INSERT INTO leaderboard_awards (organization_id,participant_id,enrollment_id,program_id,cohort_id,activity_type,source_record_id,base_points,multiplier,scoring_tier,awarded_points,completed_at,elapsed_calendar_days,timezone)
		VALUES (?::uuid,?::uuid,?::uuid,?::uuid,?::uuid,?,?::uuid,?,?,?,?,?,?,?) ON CONFLICT (organization_id,participant_id,activity_type,source_record_id) DO NOTHING`,
		c.OrganizationID, participantID, c.EnrollmentID, programID, cohortID, activityType, sourceID, PointsPerDiscussion, r.Multiplier, r.Tier, r.AwardedPoints, completedAt, r.ElapsedCalendarDays, c.Timezone).Error
}

// AwardCompletedCoachingSession uses the existing durable class_sessions record
// as the source of truth. Coaching has no deadline field, so its established
// score remains a documented legacy_full compatibility award.
func AwardCompletedCoachingSession(sessionID uuid.UUID, completedAt time.Time) error {
	var rows []struct {
		OrganizationID, ParticipantID, ProgramID, CohortID, EnrollmentID, Timezone string
	}
	if err := database.DB.Raw(`SELECT ce.org_id::text organization_id, cep.participant_id::text participant_id,
		ce.program_id::text program_id, COALESCE(ce.cohort_id::text, '') cohort_id,
		e.id::text enrollment_id, COALESCE(o.timezone, 'UTC') timezone
		FROM class_sessions cs
		JOIN coaching_engagements ce ON ce.id=cs.engagement_id
		JOIN coaching_engagement_participants cep ON cep.engagement_id=ce.id
		JOIN organizations o ON o.id=ce.org_id
		LEFT JOIN enrollments e ON e.user_id=cep.participant_id AND e.cohort_id=ce.cohort_id AND e.role='participant' AND e.status <> 'withdrawn'
		WHERE cs.id=? AND cs.status='completed'`, sessionID).Scan(&rows).Error; err != nil {
		return err
	}
	for _, row := range rows {
		pid, err := uuid.Parse(row.ParticipantID)
		if err != nil {
			return err
		}
		r, err := CalculateAward(PointsPerCoaching, nil, nil, completedAt, row.Timezone)
		if err != nil {
			return err
		}
		var cohort any
		if row.CohortID != "" {
			cohort = row.CohortID
		}
		var enrollment any
		if row.EnrollmentID != "" {
			enrollment = row.EnrollmentID
		}
		if err := database.DB.Exec(`INSERT INTO leaderboard_awards (organization_id,participant_id,enrollment_id,program_id,cohort_id,activity_type,source_record_id,base_points,multiplier,scoring_tier,awarded_points,completed_at,elapsed_calendar_days,timezone)
			VALUES (?::uuid,?::uuid,?::uuid,?::uuid,?::uuid,'coaching',?::uuid,?,?,?,?,?,?,?) ON CONFLICT (organization_id,participant_id,activity_type,source_record_id) DO NOTHING`,
			row.OrganizationID, pid, enrollment, row.ProgramID, cohort, sessionID, PointsPerCoaching, r.Multiplier, r.Tier, r.AwardedPoints, completedAt, r.ElapsedCalendarDays, row.Timezone).Error; err != nil {
			return err
		}
	}
	return nil
}
