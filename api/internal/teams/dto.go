package teams

import "time"

type CreateMeetingRequest struct {
	Subject   string `json:"subject"`
	StartTime string `json:"start_time"`
	EndTime   string `json:"end_time"`
}

type MeetingDTO struct {
	ID        string `json:"id"`
	Subject   string `json:"subject"`
	JoinURL   string `json:"join_url"`
	Organizer string `json:"organizer"`
}

type CreateCalendarEventRequest struct {
	Subject       string
	Description   string
	StartTime     time.Time
	EndTime       time.Time
	TransactionID string
	Attendees     []Attendee
}

type Attendee struct {
	Name  string
	Email string
}

type CalendarEventDTO struct {
	ID        string `json:"provider_event_id"`
	JoinURL   string `json:"virtual_link"`
	WebLink   string `json:"provider_web_link,omitempty"`
	Organizer string `json:"meeting_organizer_email"`
}

type HealthDTO struct {
	Connected   bool   `json:"connected"`
	Organizer   string `json:"organizer"`
	OrganizerID string `json:"organizer_id,omitempty"`
	DisplayName string `json:"display_name,omitempty"`
}

type UpdateCalendarEventRequest struct {
	EventID     string
	Subject     string
	Description string
	StartTime   time.Time
	EndTime     time.Time
	Attendees   []Attendee
}
