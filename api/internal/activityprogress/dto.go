package activityprogress

// ── Request DTOs ──────────────────────────────────────────────────

// UpsertProgressRequest is sent by a participant as they consume content.
// All fields are optional so the client can send partial updates (e.g. only
// bump progress_pct on a video timeupdate, or only save notes).
type UpsertProgressRequest struct {
	ActivityID   string  `json:"activity_id"`
	ProgressPct  *int    `json:"progress_pct,omitempty"`
	LastPosition *int    `json:"last_position,omitempty"`
	Notes        *string `json:"notes,omitempty"`
	// Completed, when true, forces status=completed and progress_pct=100.
	Completed *bool `json:"completed,omitempty"`
}

// ── Response DTOs ─────────────────────────────────────────────────

type ProgressDTO struct {
	ID            string  `json:"id"`
	ActivityID    string  `json:"activity_id"`
	ParticipantID string  `json:"participant_id"`
	Status        string  `json:"status"`
	ProgressPct   int     `json:"progress_pct"`
	LastPosition  int     `json:"last_position"`
	Notes         *string `json:"notes,omitempty"`
	CompletedAt   *string `json:"completed_at,omitempty"`
	UpdatedAt     string  `json:"updated_at"`
}
