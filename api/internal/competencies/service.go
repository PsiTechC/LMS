package competencies

import (
	"time"

	"github.com/google/uuid"
)

func listCompetenciesService(orgID string) ([]CompetencyResponse, error) {
	rows, err := listCompetencies(orgID)
	if err != nil {
		return nil, err
	}
	out := make([]CompetencyResponse, len(rows))
	for i, r := range rows {
		out[i] = toCompetencyResponse(&r)
	}
	return out, nil
}

func createCompetencyService(req CreateCompetencyRequest, orgID string) (*CompetencyResponse, error) {
	oid, err := uuid.Parse(orgID)
	if err != nil {
		return nil, err
	}
	c := &Competency{
		OrgID:       oid,
		Title:       req.Title,
		Description: req.Description,
		Category:    req.Category,
	}
	if c.Category == "" {
		c.Category = "leadership"
	}
	if err := createCompetency(c); err != nil {
		return nil, err
	}
	r := toCompetencyResponse(c)
	return &r, nil
}

func updateCompetencyService(id string, req UpdateCompetencyRequest) (*CompetencyResponse, error) {
	updates := map[string]any{}
	if req.Title != nil {
		updates["title"] = *req.Title
	}
	if req.Description != nil {
		updates["description"] = *req.Description
	}
	if req.Category != nil {
		updates["category"] = *req.Category
	}
	if err := updateCompetency(id, updates); err != nil {
		return nil, err
	}
	c, err := getCompetencyByID(id)
	if err != nil {
		return nil, err
	}
	r := toCompetencyResponse(c)
	return &r, nil
}

func deleteCompetencyService(id string) error {
	return deleteCompetency(id)
}

// ── Behavior statements ─────────────────────────────────────────────

func listBehaviorsService(competencyID string) ([]BehaviorResponse, error) {
	rows, err := listBehaviors(competencyID)
	if err != nil {
		return nil, err
	}
	out := make([]BehaviorResponse, len(rows))
	for i, r := range rows {
		out[i] = toBehaviorResponse(&r)
	}
	return out, nil
}

func createBehaviorService(competencyID string, req CreateBehaviorRequest) (*BehaviorResponse, error) {
	cid, err := uuid.Parse(competencyID)
	if err != nil {
		return nil, ErrNotFound
	}
	b := &CompetencyBehavior{
		CompetencyID: cid,
		Statement:    req.Statement,
		QuestionText: req.QuestionText,
		UseStatement: req.UseStatement != nil && *req.UseStatement,
		Mandatory:    req.Mandatory == nil || *req.Mandatory, // default true
		SortOrder:    req.SortOrder,
	}
	if err := createBehavior(b); err != nil {
		return nil, err
	}
	r := toBehaviorResponse(b)
	return &r, nil
}

func updateBehaviorService(id string, req UpdateBehaviorRequest) (*BehaviorResponse, error) {
	updates := map[string]any{}
	if req.Statement != nil {
		updates["statement"] = *req.Statement
	}
	if req.QuestionText != nil {
		updates["question_text"] = *req.QuestionText
	}
	if req.UseStatement != nil {
		updates["use_statement"] = *req.UseStatement
	}
	if req.Mandatory != nil {
		updates["mandatory"] = *req.Mandatory
	}
	if req.SortOrder != nil {
		updates["sort_order"] = *req.SortOrder
	}
	if len(updates) > 0 {
		updates["updated_at"] = time.Now()
		if err := updateBehavior(id, updates); err != nil {
			return nil, err
		}
	}
	b, err := getBehaviorByID(id)
	if err != nil {
		return nil, err
	}
	r := toBehaviorResponse(b)
	return &r, nil
}

func deleteBehaviorService(id string) error {
	return deleteBehavior(id)
}

func listActivityCompetenciesService(activityID string) ([]ActivityCompetencyResponse, error) {
	return listActivityCompetencies(activityID)
}

func mapCompetencyService(activityID string, req MapCompetencyRequest) error {
	return mapActivityCompetency(activityID, req.CompetencyID, req.Level)
}

func unmapCompetencyService(activityID, competencyID string) error {
	return unmapActivityCompetency(activityID, competencyID)
}

func listTemplatesService(orgID string) ([]TemplateResponse, error) {
	rows, err := listTemplates(orgID)
	if err != nil {
		return nil, err
	}
	out := make([]TemplateResponse, len(rows))
	for i, r := range rows {
		out[i] = toTemplateResponse(&r)
	}
	return out, nil
}
