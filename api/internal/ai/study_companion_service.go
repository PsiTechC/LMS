package ai

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/xa-lms/api/internal/ai/provider"
	"github.com/xa-lms/api/internal/ai/rag"
	"github.com/xa-lms/api/internal/ai/scope"
)

// excludedActivityTypes are activity types with no text-bearing document to
// generate from, regardless of what file (if any) happens to be attached —
// video is the explicit exclusion; the others simply never carry a
// text-generatable asset_id today.
var excludedActivityTypes = map[string]bool{
	"video":        true,
	"live_session": true,
}

func buildStudyCompanionScope(userID, role string) (scope.Scope, error) {
	uid, err := uuid.Parse(userID)
	if err != nil {
		return scope.Scope{}, errors.New("invalid user id")
	}
	return scope.Build(uid, role, uuid.Nil), nil
}

// checkStudyCompanionAvailability reports whether the companion has usable
// content for an activity, without indexing or generating anything (cheap
// check for the frontend to decide whether to show the button). Available
// for any content type EXCEPT video — gated by the attached file's own
// extension (pdf/docx/pptx/md/txt), not by the activity or asset_type
// category, since a PM can attach any file format under any category.
func checkStudyCompanionAvailability(userID, activityID string) (*StudyCompanionAvailabilityResponse, error) {
	row, err := resolveActivityAssetForParticipant(userID, activityID)
	if err != nil {
		if errors.Is(err, ErrActivityNotAccessible) {
			return &StudyCompanionAvailabilityResponse{ActivityID: activityID, Available: false, Reason: "not found"}, nil
		}
		return nil, err
	}
	if excludedActivityTypes[row.ActivityType] {
		return &StudyCompanionAvailabilityResponse{ActivityID: activityID, Available: false, Reason: "not available for video"}, nil
	}
	if row.AssetID == "" {
		return &StudyCompanionAvailabilityResponse{ActivityID: activityID, Available: false, Reason: "no content asset on this activity"}, nil
	}
	if !rag.HasExtractableFile(row.AssetFileName) {
		return &StudyCompanionAvailabilityResponse{ActivityID: activityID, Available: false, Reason: "no extractable text for this file"}, nil
	}
	return &StudyCompanionAvailabilityResponse{ActivityID: activityID, Available: true}, nil
}

// generateStudyCompanionService resolves the activity's asset (scoped to
// the caller's own enrollment), lazily indexes it into pgvector on first
// use if needed, and generates study material grounded in that content.
func generateStudyCompanionService(ctx context.Context, userID, role string, req StudyCompanionRequest) (*StudyCompanionResponse, error) {
	if req.ActivityID == "" {
		return nil, errors.New("activity_id is required")
	}
	mode := rag.Mode(req.Mode)

	row, err := resolveActivityAssetForParticipant(userID, req.ActivityID)
	if err != nil {
		return nil, err
	}
	if excludedActivityTypes[row.ActivityType] {
		return nil, fmt.Errorf("the AI Study Companion isn't available for video content")
	}
	if row.AssetID == "" {
		return nil, fmt.Errorf("this activity has no content asset attached")
	}
	if !rag.HasExtractableFile(row.AssetFileName) {
		return nil, fmt.Errorf("this content has no extractable text to generate from")
	}
	assetID, err := uuid.Parse(row.AssetID)
	if err != nil {
		return nil, errors.New("invalid content asset id")
	}

	programID, err := uuid.Parse(row.ProgramID)
	if err != nil {
		return nil, errors.New("invalid program id")
	}
	s, err := buildStudyCompanionScope(userID, role)
	if err != nil {
		return nil, err
	}
	s.ProgramID = &programID

	indexed, err := rag.EnsureContentAssetIndexed(ctx, s, assetID)
	if err != nil {
		return nil, err
	}
	if !indexed {
		return nil, fmt.Errorf("this content has no extractable text to generate from")
	}

	result, err := rag.GenerateStudyMaterial(ctx, s, assetID, mode, req.Count, provider.TierReason)
	if err != nil {
		return nil, err
	}

	resp := &StudyCompanionResponse{ActivityID: req.ActivityID, Mode: req.Mode}
	for _, q := range result.Questions {
		resp.Questions = append(resp.Questions, StudyCompanionQuestionDTO{Question: q.Question, ModelAnswer: q.ModelAnswer, Difficulty: q.Difficulty})
	}
	for _, sc := range result.Scenarios {
		resp.Scenarios = append(resp.Scenarios, StudyCompanionScenarioDTO{Scenario: sc.Scenario, Guidance: sc.Guidance, Difficulty: sc.Difficulty})
	}
	for _, c := range result.Concepts {
		resp.Concepts = append(resp.Concepts, StudyCompanionConceptDTO{Term: c.Term, Explanation: c.Explanation})
	}
	for _, sec := range result.Summary {
		resp.Summary = append(resp.Summary, StudyCompanionSummarySectionDTO{Heading: sec.Heading, Body: sec.Body})
	}
	return resp, nil
}
