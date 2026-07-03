package competencies

import (
	"encoding/json"
	"time"
)

// ── Competency ──────────────────────────────────────────────────────

type CreateCompetencyRequest struct {
	Title       string  `json:"title"       validate:"required"`
	Description *string `json:"description"`
	Category    string  `json:"category"    validate:"required"`
}

type UpdateCompetencyRequest struct {
	Title       *string `json:"title"`
	Description *string `json:"description"`
	Category    *string `json:"category"`
}

type CompetencyResponse struct {
	ID          string    `json:"id"`
	OrgID       string    `json:"org_id"`
	Title       string    `json:"title"`
	Description *string   `json:"description"`
	Category    string    `json:"category"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

func toCompetencyResponse(c *Competency) CompetencyResponse {
	return CompetencyResponse{
		ID:          c.ID.String(),
		OrgID:       c.OrgID.String(),
		Title:       c.Title,
		Description: c.Description,
		Category:    c.Category,
		CreatedAt:   c.CreatedAt,
		UpdatedAt:   c.UpdatedAt,
	}
}

// ── Activity ↔ Competency mapping ───────────────────────────────────

type MapCompetencyRequest struct {
	CompetencyID string `json:"competency_id" validate:"required"`
	Level        string `json:"level"`
}

type ActivityCompetencyResponse struct {
	ActivityID   string    `json:"activity_id"`
	CompetencyID string    `json:"competency_id"`
	Title        string    `json:"title"`
	Category     string    `json:"category"`
	Level        string    `json:"level"`
	CreatedAt    time.Time `json:"created_at"`
}

// ── Program Template ─────────────────────────────────────────────────

type TemplateResponse struct {
	ID            string          `json:"id"`
	OrgID         *string         `json:"org_id"`
	Title         string          `json:"title"`
	Description   *string         `json:"description"`
	Category      string          `json:"category"`
	DurationWeeks int             `json:"duration_weeks"`
	Structure     json.RawMessage `json:"structure"`
	IsSystem      bool            `json:"is_system"`
	CreatedAt     time.Time       `json:"created_at"`
}

func toTemplateResponse(t *ProgramTemplate) TemplateResponse {
	var orgID *string
	if t.OrgID != nil {
		s := t.OrgID.String()
		orgID = &s
	}
	return TemplateResponse{
		ID:            t.ID.String(),
		OrgID:         orgID,
		Title:         t.Title,
		Description:   t.Description,
		Category:      t.Category,
		DurationWeeks: t.DurationWeeks,
		Structure:     json.RawMessage(t.StructureJSON),
		IsSystem:      t.IsSystem,
		CreatedAt:     t.CreatedAt,
	}
}
