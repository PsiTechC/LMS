package surveys

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/xa-lms/api/internal/ai/aggregate"
	"github.com/xa-lms/api/internal/ai/classify"
	"github.com/xa-lms/api/internal/ai/provider"
	"github.com/xa-lms/api/internal/ai/scope"
)

// generateSurveyInsightService produces the "AI Survey Insights" one-line
// card on the participant's Surveys tab: how many surveys are awaiting a
// response, synthesized into a short motivating nudge.
func generateSurveyInsightService(ctx context.Context, userID, role string) (string, error) {
	uid, err := uuid.Parse(userID)
	if err != nil {
		return "", errors.New("invalid user id")
	}
	s := scope.Scope{UserID: uid, Role: role}
	return aggregate.GenerateBrief(ctx, s, aggregate.KindSurveyInsight, provider.TierReason)
}

var (
	sentimentTaxonomy = []string{"positive", "neutral", "negative"}
	urgencyTaxonomy   = []string{"low", "medium", "high"}
	themeTaxonomy     = []string{"content", "pacing", "facilitator", "logistics", "platform", "other"}
)

// analyzeOpenAnswersService classifies each open-text answer to one survey
// question by sentiment, urgency, and theme via internal/ai/classify.
// On-demand (PM/superadmin opens it from the results view), same as
// generateSurveyInsightService above - not run automatically on every results
// load, since that would fire one LLM call per open answer on every page
// view regardless of whether anyone looks at it.
func analyzeOpenAnswersService(ctx context.Context, userID, role, activityID, questionID string) ([]OpenAnswerSentimentDTO, error) {
	uid, err := uuid.Parse(userID)
	if err != nil {
		return nil, errors.New("invalid user id")
	}
	actID, err := uuid.Parse(activityID)
	if err != nil {
		return nil, ErrValidation
	}
	qID, err := uuid.Parse(questionID)
	if err != nil {
		return nil, ErrValidation
	}

	responses, err := listResponsesForActivity(actID)
	if err != nil {
		return nil, err
	}

	s := scope.Scope{UserID: uid, Role: role}
	out := make([]OpenAnswerSentimentDTO, 0, len(responses))
	for _, r := range responses {
		if r.QuestionID != qID || r.AnswerText == nil {
			continue
		}
		text := *r.AnswerText
		if text == "" {
			continue
		}

		row := OpenAnswerSentimentDTO{Text: text}
		if sentiment, cerr := classify.Classify(ctx, s, text, sentimentTaxonomy, provider.TierClassify); cerr == nil {
			row.Sentiment = sentiment.Label
		}
		if urgency, cerr := classify.Classify(ctx, s, text, urgencyTaxonomy, provider.TierClassify); cerr == nil {
			row.Urgency = urgency.Label
		}
		if theme, cerr := classify.Classify(ctx, s, text, themeTaxonomy, provider.TierClassify); cerr == nil {
			row.Theme = theme.Label
		}
		out = append(out, row)
	}
	return out, nil
}
