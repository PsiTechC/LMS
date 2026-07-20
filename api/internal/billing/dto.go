package billing

// ParticipantEnrollmentDTO is one row of the Billing page's Participants
// table - a user enrolled in an open (marketplace, self-enroll) program,
// paid or free (see repository.go for the exact join/scope).
type ParticipantEnrollmentDTO struct {
	UserID       string `json:"user_id"`
	Name         string `json:"name"`
	Email        string `json:"email"`
	ProgramTitle string `json:"program_title"`
	// StartDate/EndDate are this participant's OWN enrollment dates
	// (enrollments.enrolled_at / completed_at), not the program's shared
	// schedule - two participants in the same program can show different
	// dates here.
	StartDate string `json:"start_date"`         // YYYY-MM-DD
	EndDate   string `json:"end_date,omitempty"` // YYYY-MM-DD, empty while still active
}
