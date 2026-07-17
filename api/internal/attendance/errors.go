package attendance

import "errors"

var (
	ErrSessionNotFound      = errors.New("attendance session not found")
	ErrClassSessionNotFound = errors.New("class session not found")
	ErrForbidden            = errors.New("forbidden")
	ErrInvalidMode          = errors.New("mode must be 'virtual' or 'in_person'")
	ErrSessionEnded         = errors.New("attendance session has ended")
	ErrNotEnrolled          = errors.New("participant is not enrolled in this session's cohort")
	ErrNoCohort             = errors.New("this class session has no cohort to check enrollment against")
	// ErrZoomAccountNotLinked is a distinct, actionable case within the
	// broader Zoom-linking failure space (see ZoomLinkError below) — the
	// faculty starting a virtual session simply hasn't connected their Zoom
	// account yet, not an upstream Zoom API failure. Surfaced as its own
	// error code (ZOOM_NOT_CONNECTED) so the frontend can prompt them to
	// connect, rather than a generic "something went wrong".
	ErrZoomAccountNotLinked = errors.New("faculty has no linked zoom account")
)

// ZoomLinkError wraps a failure from the Zoom-linking bridge call (see
// zoom_bridge.go) so the handler can surface a specific error code without
// this package importing zoom's own error types (modules never import each
// other's Go packages — CLAUDE.md).
type ZoomLinkError struct{ Err error }

func (e *ZoomLinkError) Error() string { return "zoom meeting creation failed: " + e.Err.Error() }
func (e *ZoomLinkError) Unwrap() error { return e.Err }
