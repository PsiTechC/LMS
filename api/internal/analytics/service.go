package analytics

func engagementService(cohortID string) ([]EngagementPoint, error) {
	return getEngagement(cohortID)
}

func competencyScoresService(cohortID string) ([]CompetencyScoreResponse, error) {
	return getCompetencyScores(cohortID)
}

func upsertCompetencyScoreService(req UpsertCompetencyScoreRequest) error {
	_, err := upsertCompetencyScore(req)
	return err
}

func deleteCompetencyScoreService(id string) error {
	return deleteCompetencyScore(id)
}
