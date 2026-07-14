package rag

import (
	"context"
	_ "embed"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"

	"github.com/google/uuid"
	"github.com/xa-lms/api/internal/ai/provider"
	"github.com/xa-lms/api/internal/ai/scope"
)

//go:embed prompts/study_practice_questions.tmpl
var practiceQuestionsPrompt string

//go:embed prompts/study_scenario_simulation.tmpl
var scenarioSimulationPrompt string

//go:embed prompts/study_concept_explanation.tmpl
var conceptExplanationPrompt string

//go:embed prompts/study_summary.tmpl
var summaryPrompt string

// Mode selects what kind of study material to generate. Each mode has its
// own prompt template AND its own result shape below — practice questions
// and scenarios are genuinely Q&A pairs, but concepts are reference entries
// and a summary is prose, not a list of questions. Forcing all four through
// one "prompt/answer" schema is what made every mode read like a quiz;
// giving each its own shape fixes that at the source.
type Mode string

const (
	ModePracticeQuestions  Mode = "practice_questions"
	ModeScenarioSimulation Mode = "scenario_simulation"
	ModeConceptExplanation Mode = "concept_explanation"
	ModeSummary            Mode = "summary"
)

func (m Mode) valid() bool {
	switch m {
	case ModePracticeQuestions, ModeScenarioSimulation, ModeConceptExplanation, ModeSummary:
		return true
	}
	return false
}

func (m Mode) promptTemplate() string {
	switch m {
	case ModePracticeQuestions:
		return practiceQuestionsPrompt
	case ModeScenarioSimulation:
		return scenarioSimulationPrompt
	case ModeConceptExplanation:
		return conceptExplanationPrompt
	case ModeSummary:
		return summaryPrompt
	default:
		return ""
	}
}

// QuestionItem is one practice question with its model answer.
type QuestionItem struct {
	Question    string `json:"question"`
	ModelAnswer string `json:"model_answer"`
	Difficulty  string `json:"difficulty"`
}

// ScenarioItem is one workplace scenario with suggested guidance.
type ScenarioItem struct {
	Scenario   string `json:"scenario"`
	Guidance   string `json:"guidance"`
	Difficulty string `json:"difficulty"`
}

// ConceptItem is one glossary-style reference entry — never a question.
type ConceptItem struct {
	Term        string `json:"term"`
	Explanation string `json:"explanation"`
}

// SummarySection is one section of a prose summary — never a question.
type SummarySection struct {
	Heading string `json:"heading"`
	Body    string `json:"body"`
}

// StudyCompanionResult is the generation output for one module. Exactly one
// of the four slices is populated, matching Mode.
type StudyCompanionResult struct {
	Mode      Mode             `json:"mode"`
	Questions []QuestionItem   `json:"questions,omitempty"`
	Scenarios []ScenarioItem   `json:"scenarios,omitempty"`
	Concepts  []ConceptItem    `json:"concepts,omitempty"`
	Summary   []SummarySection `json:"summary,omitempty"`
}

// GenerateStudyMaterial retrieves the indexed chunks for one content asset
// ("this module's content" — never the participant's whole program) and
// asks the model to generate practice questions, scenario simulations,
// concept explanations, or a summary, in the shape that actually fits that
// mode. The caller is responsible for having indexed the asset first (see
// EnsureContentAssetIndexed) — this function errors if no chunks exist.
func GenerateStudyMaterial(ctx context.Context, s scope.Scope, sourceID uuid.UUID, mode Mode, count int, tier provider.Tier) (*StudyCompanionResult, error) {
	if !mode.valid() {
		return nil, fmt.Errorf("rag: unsupported study companion mode %q", mode)
	}
	if count <= 0 {
		count = 5
	}
	if count > 10 {
		count = 10
	}

	chunks, err := AllChunksForSource("content_asset", sourceID)
	if err != nil {
		return nil, err
	}
	if len(chunks) == 0 {
		return nil, fmt.Errorf("rag: content asset %s has not been indexed or has no extractable text", sourceID)
	}

	var sourceText strings.Builder
	for _, c := range chunks {
		sourceText.WriteString(c.Content)
		sourceText.WriteString("\n\n")
	}
	// Bound the prompt: a study module's indexed text can be long, but the
	// model only needs enough to ground good output, not the entire
	// document verbatim.
	text := sourceText.String()
	const maxChars = 12000
	if len(text) > maxChars {
		text = text[:maxChars]
	}

	systemPrompt := strings.ReplaceAll(mode.promptTemplate(), "{{COUNT}}", strconv.Itoa(count))

	msgs := []provider.ChatMessage{
		{Role: "system", Content: systemPrompt},
		{Role: "user", Content: "SOURCE MATERIAL:\n" + text},
	}

	cfg := provider.Resolve(s, tier)
	completion, err := provider.Complete(ctx, cfg, msgs, provider.WithJSONMode())
	if err != nil {
		return nil, err
	}

	result := &StudyCompanionResult{Mode: mode}
	switch mode {
	case ModePracticeQuestions:
		var parsed struct {
			Items []QuestionItem `json:"items"`
		}
		if err := json.Unmarshal([]byte(completion.Content), &parsed); err != nil {
			return nil, fmt.Errorf("rag: AI returned an unexpected response format: %w", err)
		}
		result.Questions = parsed.Items
	case ModeScenarioSimulation:
		var parsed struct {
			Items []ScenarioItem `json:"items"`
		}
		if err := json.Unmarshal([]byte(completion.Content), &parsed); err != nil {
			return nil, fmt.Errorf("rag: AI returned an unexpected response format: %w", err)
		}
		result.Scenarios = parsed.Items
	case ModeConceptExplanation:
		var parsed struct {
			Items []ConceptItem `json:"items"`
		}
		if err := json.Unmarshal([]byte(completion.Content), &parsed); err != nil {
			return nil, fmt.Errorf("rag: AI returned an unexpected response format: %w", err)
		}
		result.Concepts = parsed.Items
	case ModeSummary:
		var parsed struct {
			Sections []SummarySection `json:"sections"`
		}
		if err := json.Unmarshal([]byte(completion.Content), &parsed); err != nil {
			return nil, fmt.Errorf("rag: AI returned an unexpected response format: %w", err)
		}
		result.Summary = parsed.Sections
	}
	return result, nil
}
