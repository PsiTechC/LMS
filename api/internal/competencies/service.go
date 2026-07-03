package competencies

import "github.com/google/uuid"

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
