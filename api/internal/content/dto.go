package content

import "time"

// ── Request DTOs ──────────────────────────────────────────────────

type CreateAssetRequest struct {
	Title       string   `json:"title"`
	Description string   `json:"description"`
	AssetType   string   `json:"asset_type"`
	Tags        []string `json:"tags"`
	// Type-specific metadata
	QuestionCount *int    `json:"question_count,omitempty"`
	DurationMins  *int    `json:"duration_mins,omitempty"`
	ScormEntry    *string `json:"scorm_entry,omitempty"`
	VideoURL      *string `json:"video_url,omitempty"`
}

type UpdateAssetRequest struct {
	Title       *string  `json:"title"`
	Description *string  `json:"description"`
	Status      *string  `json:"status"`
	Tags        []string `json:"tags"`
	QuestionCount *int    `json:"question_count,omitempty"`
	DurationMins  *int    `json:"duration_mins,omitempty"`
	ScormEntry    *string `json:"scorm_entry,omitempty"`
	VideoURL      *string `json:"video_url,omitempty"`
}

// ── Response DTOs ─────────────────────────────────────────────────

type AssetDTO struct {
	ID            string    `json:"id"`
	OrgID         string    `json:"org_id"`
	CreatedBy     string    `json:"created_by"`
	CreatorName   string    `json:"creator_name"`
	Title         string    `json:"title"`
	Description   string    `json:"description,omitempty"`
	AssetType     string    `json:"asset_type"`
	Status        string    `json:"status"`
	HasFile       bool      `json:"has_file"`
	FileName      string    `json:"file_name,omitempty"`
	FileSizeBytes *int64    `json:"file_size_bytes,omitempty"`
	MimeType      string    `json:"mime_type,omitempty"`
	FileURL       string    `json:"file_url,omitempty"` // served path for rendering
	Tags          []string  `json:"tags"`
	UsedInCount   int       `json:"used_in_count"`
	ProgramIDs    []string  `json:"program_ids"`
	ProgramTitles []string  `json:"program_titles"`
	// Type-specific metadata
	QuestionCount *int    `json:"question_count,omitempty"`
	DurationMins  *int    `json:"duration_mins,omitempty"`
	ScormEntry    *string `json:"scorm_entry,omitempty"`
	VideoURL      *string `json:"video_url,omitempty"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}

type LibraryStatsDTO struct {
	TotalAssets  int `json:"total_assets"`
	ActiveAssets int `json:"active_assets"`
	DraftAssets  int `json:"draft_assets"`
	TypeCount    int `json:"type_count"` // distinct types in use
}
