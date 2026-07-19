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

func programOverviewService(orgID string) (*ProgramOverviewResponse, error) {
	return getProgramOverview(orgID)
}

func cohortProgressService(cohortID string) (*CohortProgressResponse, error) {
	return getCohortProgress(cohortID)
}

func activityCompletionService(cohortID string) (*ActivityCompletionResponse, error) {
	return getActivityCompletion(cohortID)
}

func attendanceHeatmapService(cohortID string) (*AttendanceHeatmapResponse, error) {
	return getAttendanceHeatmap(cohortID)
}

func submissionGradesService(cohortID string) (*SubmissionGradesResponse, error) {
	return getSubmissionGrades(cohortID)
}

func sessionSummaryService(cohortID string) (*SessionSummaryResponse, error) {
	return getSessionSummary(cohortID)
}

func completionRollupService(cohortID string) (*CompletionRollupResponse, error) {
	return getCompletionRollup(cohortID)
}

func engagementSummaryService(cohortID string) (*EngagementSummaryResponse, error) {
	return getEngagementSummary(cohortID)
}

func assessmentPerformanceService(cohortID string) (*AssessmentPerformanceResponse, error) {
	return getAssessmentPerformance(cohortID)
}

func atRiskService(cohortID string) (*AtRiskResponse, error) {
	return getAtRisk(cohortID)
}

func roiService(cohortID string) (*ROIResponse, error) {
	return getROI(cohortID)
}

func programSummaryService(programID string) (*ProgramSummaryResponse, error) {
	return getProgramSummary(programID)
}

func programAnalyticsExtraService(programID string) (*ProgramAnalyticsExtraResponse, error) {
	return getProgramAnalyticsExtra(programID)
}

func orgSummaryService(orgID string) (*ProgramSummaryResponse, error) {
	return getOrgSummary(orgID)
}

func orgAnalyticsExtraService(orgID string) (*ProgramAnalyticsExtraResponse, error) {
	return getOrgAnalyticsExtra(orgID)
}

func organizationAnalyticsRollupService() ([]OrganizationAnalyticsRow, error) {
	return getOrganizationAnalyticsRollup()
}
