package content

import (
	"encoding/json"
	"fmt"
	"io"
	"strings"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/xa-lms/api/internal/ai/extract"
	"github.com/xa-lms/api/internal/ai/provider"
	"github.com/xa-lms/api/internal/ai/scope"
	"github.com/xa-lms/api/internal/shared"
)

// AIHandler serves the stateless AI draft-generation endpoints. It never
// touches the database — the frontend saves the reviewed draft via the
// normal asset create/update endpoints.
type AIHandler struct{}

func NewAIHandler() *AIHandler { return &AIHandler{} }

func (h *AIHandler) Register(v1 *echo.Group) {
	g := v1.Group("/content/ai", shared.RequireAuth())
	g.POST("/quiz-generate", h.quizGenerate, shared.HybridPermission("content", "create", shared.RoleSuperAdmin, shared.RoleProgramManager, shared.RoleFaculty))
}

var allowedQuestionTypesByAssetType = map[string][]QuestionType{
	"quiz": {QTypeMCQ, QTypeTrueFalse, QTypeMatching, QTypeOpen},
	// Assessments are graded knowledge checks — identical shape to quiz (and
	// scored the same way by assessments/service.go via correct_index).
	"assessment": {QTypeMCQ, QTypeTrueFalse, QTypeMatching, QTypeOpen},
	// Surveys gauge opinion/sentiment (agree/disagree, satisfaction) rather
	// than right/wrong or knowledge-check answers — mcq, true_false, and
	// matching are all assessment-style formats and don't belong here. This
	// list feeds directly into the AI generation prompt's allowed-types
	// instruction, so restricting it here is what stops the model from
	// producing them for a survey asset. QTypeScale is the Likert
	// agree/disagree question — the type surveys should mostly use.
	"survey":       {QTypeScale, QTypeOpen},
	"l1_reaction":  {QTypeScale, QTypeMCQ, QTypeOpen},
	"l2_learning":  {QTypeScale, QTypeMCQ, QTypeOpen},
	"l3_behaviour": {QTypeScale, QTypeMCQ, QTypeOpen},
	"l4_impact":    {QTypeScale, QTypeMCQ, QTypeOpen},
}

func (h *AIHandler) quizGenerate(c echo.Context) error {
	if !provider.Configured() {
		return shared.BadRequest(c, "AI_NOT_CONFIGURED", "AI provider is not configured (missing AI_API_KEY)", "")
	}

	var req AIQuizGenerateRequest
	var extractedText string

	ct := c.Request().Header.Get("Content-Type")
	if strings.Contains(ct, "multipart/form-data") {
		req.Prompt = c.FormValue("prompt")
		req.AssetType = c.FormValue("asset_type")
		if existingTitle := c.FormValue("existing_title"); existingTitle != "" {
			req.ExistingTitle = &existingTitle
		}
		if draftJSON := c.FormValue("existing_draft"); draftJSON != "" {
			var qs QuestionSet
			if json.Unmarshal([]byte(draftJSON), &qs) == nil {
				req.ExistingDraft = &qs
			}
		}
		if historyJSON := c.FormValue("chat_history"); historyJSON != "" {
			_ = json.Unmarshal([]byte(historyJSON), &req.ChatHistory)
		}
		if file, err := c.FormFile("file"); err == nil && file != nil {
			src, err := file.Open()
			if err != nil {
				return shared.BadRequest(c, "VALIDATION_ERROR", "failed to read uploaded file", "file")
			}
			defer src.Close()
			data, err := io.ReadAll(src)
			if err != nil {
				return shared.BadRequest(c, "VALIDATION_ERROR", "failed to read uploaded file", "file")
			}
			mimeType := file.Header.Get("Content-Type")
			text, err := extract.Text(data, mimeType)
			if err != nil {
				return shared.BadRequest(c, "VALIDATION_ERROR", "could not extract text from file: "+err.Error(), "file")
			}
			extractedText = text
		}
	} else {
		if err := c.Bind(&req); err != nil {
			return shared.BadRequest(c, "VALIDATION_ERROR", "invalid request body", "")
		}
	}

	if strings.TrimSpace(req.AssetType) == "" {
		return shared.BadRequest(c, "VALIDATION_ERROR", "asset_type is required", "asset_type")
	}
	allowedTypes, ok := allowedQuestionTypesByAssetType[req.AssetType]
	if !ok {
		return shared.BadRequest(c, "VALIDATION_ERROR", "asset_type does not support AI question generation", "asset_type")
	}
	if strings.TrimSpace(req.Prompt) == "" && extractedText == "" && req.ExistingDraft == nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "provide a prompt or a file to generate from", "prompt")
	}

	messages := buildQuizGenerationMessages(req, allowedTypes, extractedText)
	claims := shared.ClaimsFrom(c)
	var s scope.Scope
	if claims != nil {
		if uid, err := uuid.Parse(claims.UserID); err == nil {
			s = scope.Build(uid, claims.Role, uuid.Nil)
		}
	}
	cfg := provider.Resolve(s, provider.TierReason)
	completion, err := provider.Complete(c.Request().Context(), cfg, messages, provider.WithJSONMode())
	if err != nil {
		return shared.InternalError(c, "AI generation failed: "+err.Error())
	}

	var result AIQuizGenerateResponse
	if err := json.Unmarshal([]byte(completion.Content), &result); err != nil {
		return shared.InternalError(c, "AI returned an unexpected response format")
	}
	for i := range result.QuestionSet.Questions {
		result.QuestionSet.Questions[i].SortOrder = i
	}
	return shared.OK(c, result)
}

func buildQuizGenerationMessages(req AIQuizGenerateRequest, allowedTypes []QuestionType, extractedText string) []provider.ChatMessage {
	typeNames := make([]string, len(allowedTypes))
	for i, t := range allowedTypes {
		typeNames[i] = string(t)
	}

	scaleGuidance := "scale_labels: string[] (for \"scale\", one label per point on the scale)"
	if req.AssetType == "survey" {
		scaleGuidance = `scale_labels: string[] (for "scale", one label per point on the scale —
        surveys are opinion instruments, not knowledge checks, so "scale"
        questions must be agree/disagree Likert items: phrase "text" as a
        statement the respondent reacts to, not a question, and use
        scale_min=1, scale_max=5, scale_labels=["Strongly Disagree",
        "Disagree", "Neutral", "Agree", "Strongly Agree"] unless the user's
        prompt explicitly asks for a different scale)`
	}

	systemPrompt := fmt.Sprintf(`You are an instructional design assistant that authors quizzes and feedback
instruments for a leadership development LMS. You must respond with a single
JSON object matching exactly this schema:

{
  "title": string,
  "description": string,
  "question_set": {
    "questions": [
      {
        "id": string (short unique id, e.g. "q1"),
        "type": one of [%s],
        "text": string (the question prompt),
        "options": string[] (required for "mcq" — 2-6 answer choices),
        "correct_index": number (required for "mcq"/"true_false" — zero-based index into options; for true_false use options ["True","False"]),
        "match_pairs": [{"left": string, "right": string}] (required for "matching"),
        "scale_min": number (for "scale", default 1),
        "scale_max": number (for "scale", default 5),
        %s
      }
    ]
  },
  "assistant_message": string (a brief, friendly note to the user describing what you generated or changed)
}

Only use question types from the allowed list for this asset type: [%s].
Do not include fields that don't apply to a question's type. Keep questions
clear, unambiguous, and relevant to the requested topic. Return ONLY the JSON
object — no markdown, no commentary outside the JSON.`, strings.Join(typeNames, ", "), scaleGuidance, strings.Join(typeNames, ", "))

	messages := []provider.ChatMessage{{Role: "system", Content: systemPrompt}}

	for _, turn := range req.ChatHistory {
		role := turn.Role
		if role != "user" && role != "assistant" {
			role = "user"
		}
		messages = append(messages, provider.ChatMessage{Role: role, Content: turn.Content})
	}

	var userParts []string
	if req.ExistingDraft != nil {
		draftJSON, _ := json.Marshal(req.ExistingDraft)
		title := ""
		if req.ExistingTitle != nil {
			title = *req.ExistingTitle
		}
		userParts = append(userParts, fmt.Sprintf("Here is the current draft to revise (title: %q):\n%s", title, string(draftJSON)))
	}
	if extractedText != "" {
		trimmed := extractedText
		const maxChars = 12000
		if len(trimmed) > maxChars {
			trimmed = trimmed[:maxChars]
		}
		userParts = append(userParts, "Source material extracted from an uploaded file:\n"+trimmed)
	}
	if strings.TrimSpace(req.Prompt) != "" {
		userParts = append(userParts, "Instructions: "+req.Prompt)
	} else if req.ExistingDraft == nil {
		userParts = append(userParts, "Generate a quiz based on the source material above.")
	}

	messages = append(messages, provider.ChatMessage{Role: "user", Content: strings.Join(userParts, "\n\n")})
	return messages
}
