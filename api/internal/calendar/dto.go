package calendar

// CalendarEventDTO is the unified event type returned by the shared calendar
// endpoint, used by Superadmin, Secondary SA, Program Admin, and Faculty.
type CalendarEventDTO struct {
	ID               string  `json:"id"`
	Title            string  `json:"title"`
	Type             string  `json:"type"`              // "session" | "coaching"
	ScheduledAt      string  `json:"scheduled_at"`      // RFC3339 UTC
	DurationMins     int     `json:"duration_mins"`
	Status           string  `json:"status"`            // "upcoming" | "live_now" | "done"
	ProgramID        string  `json:"program_id"`
	ProgramTitle     string  `json:"program_title"`
	ProgramColor     string  `json:"program_color"`
	OrgID            string  `json:"org_id"`
	OrgName          string  `json:"org_name"`
	CohortID         *string `json:"cohort_id,omitempty"`
	CohortName       *string `json:"cohort_name,omitempty"`
	FacultyName      *string `json:"faculty_name,omitempty"`
	CoachName        *string `json:"coach_name,omitempty"`
	ParticipantCount int     `json:"participant_count"`
	VirtualLink      *string `json:"virtual_link,omitempty"`
	JoinURL          *string `json:"join_url,omitempty"`
	MeetingType      *string `json:"meeting_type,omitempty"`
	Location         *string `json:"location,omitempty"`
	SessionType      string  `json:"session_type,omitempty"` // classroom | coaching_group | coaching_individual
}
