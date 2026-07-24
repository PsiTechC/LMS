package calendar

import (
	"time"

	"github.com/xa-lms/api/pkg/database"
)

// calendarSessionRow is the raw DB row for class_sessions joined to org/program/faculty.
type calendarSessionRow struct {
	ID               string     `gorm:"column:id"`
	Title            string     `gorm:"column:title"`
	ScheduledAt      time.Time  `gorm:"column:scheduled_at"`
	DurationMins     int        `gorm:"column:duration_mins"`
	ProgramID        string     `gorm:"column:program_id"`
	ProgramTitle     string     `gorm:"column:program_title"`
	ProgramColor     string     `gorm:"column:program_color"`
	OrgID            string     `gorm:"column:org_id"`
	OrgName          string     `gorm:"column:org_name"`
	CohortID         *string    `gorm:"column:cohort_id"`
	CohortName       *string    `gorm:"column:cohort_name"`
	FacultyName      *string    `gorm:"column:faculty_name"`
	ParticipantCount int        `gorm:"column:participant_count"`
	VirtualLink      *string    `gorm:"column:virtual_link"`
	JoinURL          *string    `gorm:"column:join_url"`
	MeetingType      *string    `gorm:"column:meeting_type"`
	Location         *string    `gorm:"column:location"`
	StartedAt        *time.Time `gorm:"column:started_at"`
	EndedAt          *time.Time `gorm:"column:ended_at"`
	StoredStatus     string     `gorm:"column:stored_status"`
}

// calendarCoachingRow is the raw DB row for coaching sessions joined to org/program/coach.
type calendarCoachingRow struct {
	ID               string     `gorm:"column:id"`
	Title            string     `gorm:"column:title"`
	ScheduledAt      time.Time  `gorm:"column:scheduled_at"`
	DurationMins     int        `gorm:"column:duration_mins"`
	ProgramID        string     `gorm:"column:program_id"`
	ProgramTitle     string     `gorm:"column:program_title"`
	ProgramColor     string     `gorm:"column:program_color"`
	OrgID            string     `gorm:"column:org_id"`
	OrgName          string     `gorm:"column:org_name"`
	CohortID         *string    `gorm:"column:cohort_id"`
	CohortName       *string    `gorm:"column:cohort_name"`
	CoachName        string     `gorm:"column:coach_name"`
	ParticipantCount int        `gorm:"column:participant_count"`
	VirtualLink      *string    `gorm:"column:virtual_link"`
	JoinURL          *string    `gorm:"column:join_url"`
	MeetingType      *string    `gorm:"column:meeting_type"`
	SessionType      string     `gorm:"column:session_type"`
	StoredStatus     string     `gorm:"column:stored_status"`
	StartedAt        *time.Time `gorm:"column:started_at"`
	EndedAt          *time.Time `gorm:"column:ended_at"`
}

// listClassSessions returns class sessions visible to the given role.
// orgID="" = all orgs; programID="" = all programs; facultyUserID="" = all faculty.
func listClassSessions(orgID, programID, facultyUserID, from, to string) ([]calendarSessionRow, error) {
	var rows []calendarSessionRow

	q := database.DB.Raw(`
		SELECT
			s.id::text                         AS id,
			s.title                            AS title,
			s.scheduled_at                     AS scheduled_at,
			s.duration_mins                    AS duration_mins,
			p.id::text                         AS program_id,
			p.title                            AS program_title,
			COALESCE(p.color, '#4A5573')       AS program_color,
			o.id::text                         AS org_id,
			o.name                             AS org_name,
			s.cohort_id::text                  AS cohort_id,
			co.name                            AS cohort_name,
			u.name                             AS faculty_name,
			COALESCE(ec.cnt, 0)               AS participant_count,
			s.virtual_link                     AS virtual_link,
			s.zoom_join_url                    AS join_url,
			s.meeting_type                     AS meeting_type,
			NULL::text                         AS location,
			s.started_at                       AS started_at,
			s.ended_at                         AS ended_at,
			s.status                           AS stored_status
		FROM class_sessions s
		JOIN programs p         ON p.id = s.program_id
		JOIN organizations o    ON o.id = p.org_id
		LEFT JOIN cohorts co    ON co.id = s.cohort_id
		LEFT JOIN users u       ON u.id = s.faculty_id
		LEFT JOIN (
			SELECT cohort_id, COUNT(*) AS cnt
			FROM cohort_enrollments
			WHERE status = 'active'
			GROUP BY cohort_id
		) ec ON ec.cohort_id = s.cohort_id
		WHERE 1=1
		  AND (? = '' OR o.id::text = ?)
		  AND (? = '' OR p.id::text = ?)
		  AND (? = '' OR u.id::text = ?)
		  AND (? = '' OR DATE(s.scheduled_at AT TIME ZONE 'UTC') >= ?::date)
		  AND (? = '' OR DATE(s.scheduled_at AT TIME ZONE 'UTC') <= ?::date)
		ORDER BY s.scheduled_at ASC
	`, orgID, orgID,
		programID, programID,
		facultyUserID, facultyUserID,
		from, from,
		to, to)

	err := q.Scan(&rows).Error
	return rows, err
}

// listCoachingSessions returns coaching sessions (class_sessions with engagement_id set).
func listCoachingSessions(orgID, programID, coachUserID, from, to string) ([]calendarCoachingRow, error) {
	var rows []calendarCoachingRow

	err := database.DB.Raw(`
		SELECT
			s.id::text                         AS id,
			s.title                            AS title,
			s.scheduled_at                     AS scheduled_at,
			s.duration_mins                    AS duration_mins,
			p.id::text                         AS program_id,
			p.title                            AS program_title,
			COALESCE(p.color, '#0891B2')       AS program_color,
			o.id::text                         AS org_id,
			o.name                             AS org_name,
			ce.cohort_id::text                 AS cohort_id,
			co.name                            AS cohort_name,
			coach.name                         AS coach_name,
			(SELECT COUNT(*) FROM coaching_engagement_participants WHERE engagement_id = ce.id) AS participant_count,
			s.virtual_link                     AS virtual_link,
			s.zoom_join_url                    AS join_url,
			s.meeting_type                     AS meeting_type,
			ce.assignment_type                 AS session_type,
			s.status                           AS stored_status,
			s.started_at                       AS started_at,
			s.ended_at                         AS ended_at
		FROM class_sessions s
		JOIN coaching_engagements ce ON ce.id = s.engagement_id
		JOIN programs p              ON p.id = ce.program_id
		JOIN organizations o         ON o.id = ce.org_id
		LEFT JOIN cohorts co         ON co.id = ce.cohort_id
		JOIN users coach             ON coach.id = ce.coach_id
		WHERE s.engagement_id IS NOT NULL
		  AND (? = '' OR o.id::text = ?)
		  AND (? = '' OR p.id::text = ?)
		  AND (? = '' OR coach.id::text = ?)
		  AND (? = '' OR DATE(s.scheduled_at AT TIME ZONE 'UTC') >= ?::date)
		  AND (? = '' OR DATE(s.scheduled_at AT TIME ZONE 'UTC') <= ?::date)
		ORDER BY s.scheduled_at ASC
	`, orgID, orgID,
		programID, programID,
		coachUserID, coachUserID,
		from, from,
		to, to).Scan(&rows).Error
	return rows, err
}
