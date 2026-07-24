package certificates

// CertificateResponse is one issued certificate as returned to the
// participant's Certificates tab and the PM/SA manage screen.
type CertificateResponse struct {
	ID             string `json:"id"`
	ProgramID      string `json:"program_id"`
	ProgramTitle   string `json:"program_title"`
	SerialCode     string `json:"serial_code"`
	IssuedAt       string `json:"issued_at"`
	Revoked        bool   `json:"revoked"`
	ManuallyIssued bool   `json:"manually_issued"`
}

// VerifyResponse is the public-facing verify-by-code payload - deliberately
// minimal (no email, no internal IDs) since this endpoint is unauthenticated.
type VerifyResponse struct {
	Valid           bool   `json:"valid"`
	ParticipantName string `json:"participant_name,omitempty"`
	ProgramTitle    string `json:"program_title,omitempty"`
	IssuedAt        string `json:"issued_at,omitempty"`
	Revoked         bool   `json:"revoked,omitempty"`
}

// ManualIssueRequest is the PM/SA override payload.
type ManualIssueRequest struct {
	EnrollmentID string `json:"enrollment_id"`
}
