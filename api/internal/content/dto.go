package content

import "time"

// ── Request DTOs ──────────────────────────────────────────────────

type CreateAssetRequest struct {
	Title       string   `json:"title"`
	Description string   `json:"description"`
	AssetType   string   `json:"asset_type"`
	Tags        []string `json:"tags"`
	// Type-specific metadata
	QuestionCount *int               `json:"question_count,omitempty"`
	DurationMins  *int               `json:"duration_mins,omitempty"`
	ScormEntry    *string            `json:"scorm_entry,omitempty"`
	VideoURL      *string            `json:"video_url,omitempty"`
	QuestionSet   *QuestionSet       `json:"question_set,omitempty"`
	Certificate   *CertificateConfig `json:"certificate,omitempty"`
	CaseStudy     *CaseStudyBody     `json:"case_study,omitempty"`
	// Quiz/assessment-only DEFAULTS (quiz/assessment asset types). Not
	// enforced here — every activity that tags this asset in (Program Design
	// Studio's "Quiz Settings"/"Knowledge Check" panels) pre-fills from these
	// but can still override per placement, since the same quiz can be timed
	// in one program and untimed in another.
	DefaultTimeLimitMins   *int `json:"default_time_limit_mins,omitempty"`
	DefaultAttemptsAllowed *int `json:"default_attempts_allowed,omitempty"`
	DefaultPassingScorePct *int `json:"default_passing_score_pct,omitempty"`
}

type UpdateAssetRequest struct {
	Title       *string  `json:"title"`
	Description *string  `json:"description"`
	Status      *string  `json:"status"`
	Tags        []string `json:"tags"`
	QuestionCount *int               `json:"question_count,omitempty"`
	DurationMins  *int               `json:"duration_mins,omitempty"`
	ScormEntry    *string            `json:"scorm_entry,omitempty"`
	VideoURL      *string            `json:"video_url,omitempty"`
	QuestionSet   *QuestionSet       `json:"question_set,omitempty"`
	Certificate   *CertificateConfig `json:"certificate,omitempty"`
	CaseStudy     *CaseStudyBody     `json:"case_study,omitempty"`
	DefaultTimeLimitMins   *int `json:"default_time_limit_mins,omitempty"`
	DefaultAttemptsAllowed *int `json:"default_attempts_allowed,omitempty"`
	DefaultPassingScorePct *int `json:"default_passing_score_pct,omitempty"`
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
	QuestionCount *int               `json:"question_count,omitempty"`
	DurationMins  *int               `json:"duration_mins,omitempty"`
	ScormEntry    *string            `json:"scorm_entry,omitempty"`
	VideoURL      *string            `json:"video_url,omitempty"`
	QuestionSet   *QuestionSet       `json:"question_set,omitempty"`
	Certificate   *CertificateConfig `json:"certificate,omitempty"`
	CaseStudy     *CaseStudyBody     `json:"case_study,omitempty"`
	DefaultTimeLimitMins   *int `json:"default_time_limit_mins,omitempty"`
	DefaultAttemptsAllowed *int `json:"default_attempts_allowed,omitempty"`
	DefaultPassingScorePct *int `json:"default_passing_score_pct,omitempty"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}

type LibraryStatsDTO struct {
	TotalAssets  int `json:"total_assets"`
	ActiveAssets int `json:"active_assets"`
	DraftAssets  int `json:"draft_assets"`
	TypeCount    int `json:"type_count"` // distinct types in use
}
