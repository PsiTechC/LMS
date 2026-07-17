package programs

import (
	"encoding/json"
	"errors"
)

// Activity.ConfigJSON holds a type-specific payload. Every activity type below
// has a corresponding Validate() that runs on create/update so bad config never
// reaches the DB. Content-backed types (video/pdf/case_study/assessment/survey/
// journal/assignment/peer_review) reference a content_assets row by AssetID —
// the asset itself (file, questions, etc.) lives in the content module.

// KnowledgeCheck is an OPTIONAL quiz attached to a content-style activity
// (video/pdf/case_study/eLearning). It points at a normal quiz-type
// content_assets row (AssetID) — authored the same way a standalone quiz is
// (manually or via /content/ai/quiz-generate against the parent asset's file)
// — and is scored by the same assessments engine. When AssetID is empty the
// activity has no knowledge check and behaves exactly as before. The timer /
// attempts / passing-score fields mirror AssessmentConfig so an attached check
// behaves identically to a standalone assessment for the participant.
type KnowledgeCheck struct {
	AssetID         string `json:"asset_id,omitempty"`
	TimeLimitMins   int    `json:"time_limit_mins,omitempty"`   // 0 = untimed
	AttemptsAllowed int    `json:"attempts_allowed,omitempty"`  // 0 -> defaulted to 1 at scoring
	PassingScorePct int    `json:"passing_score_pct,omitempty"` // 0 = no pass threshold
}

func (k KnowledgeCheck) Validate() error {
	if k.TimeLimitMins < 0 {
		return errors.New("knowledge_check.time_limit_mins cannot be negative")
	}
	if k.AttemptsAllowed < 0 {
		return errors.New("knowledge_check.attempts_allowed cannot be negative")
	}
	if k.PassingScorePct < 0 || k.PassingScorePct > 100 {
		return errors.New("knowledge_check.passing_score_pct must be between 0 and 100")
	}
	return nil
}

type VideoConfig struct {
	AssetID        string          `json:"asset_id,omitempty"`
	KnowledgeCheck *KnowledgeCheck `json:"knowledge_check,omitempty"`
}

func (c VideoConfig) Validate() error { return validateKnowledgeCheck(c.KnowledgeCheck) }

type PDFConfig struct {
	AssetID        string          `json:"asset_id,omitempty"`
	KnowledgeCheck *KnowledgeCheck `json:"knowledge_check,omitempty"`
}

func (c PDFConfig) Validate() error { return validateKnowledgeCheck(c.KnowledgeCheck) }

type CaseStudyConfig struct {
	AssetID        string          `json:"asset_id,omitempty"`
	KnowledgeCheck *KnowledgeCheck `json:"knowledge_check,omitempty"`
}

func (c CaseStudyConfig) Validate() error { return validateKnowledgeCheck(c.KnowledgeCheck) }

// ContentConfig backs eLearning/SCORM modules (activity type "content").
// Config-wise it's identical to Video/PDF — a pointer at a content_assets
// row — but kept as its own type/enum value so eLearning can be told apart
// structurally from a raw video file (see 000042_activity_type_content).
type ContentConfig struct {
	AssetID        string          `json:"asset_id,omitempty"`
	KnowledgeCheck *KnowledgeCheck `json:"knowledge_check,omitempty"`
}

func (c ContentConfig) Validate() error { return validateKnowledgeCheck(c.KnowledgeCheck) }

// validateKnowledgeCheck runs the sub-config's own Validate when present. A nil
// KnowledgeCheck (the common case — no attached quiz) is always valid.
func validateKnowledgeCheck(k *KnowledgeCheck) error {
	if k == nil {
		return nil
	}
	return k.Validate()
}

type AssessmentConfig struct {
	AssetID         string `json:"asset_id,omitempty"`
	AttemptsAllowed int    `json:"attempts_allowed,omitempty"`
	TimeLimitMins   int    `json:"time_limit_mins,omitempty"`
	CoolingOffHours int    `json:"cooling_off_hours,omitempty"`
	ScoringMethod   string `json:"scoring_method,omitempty"` // highest | latest | average
	PassingScorePct int    `json:"passing_score_pct,omitempty"`
}

func (c AssessmentConfig) Validate() error {
	if c.AttemptsAllowed < 0 {
		return errors.New("attempts_allowed cannot be negative")
	}
	if c.TimeLimitMins < 0 {
		return errors.New("time_limit_mins cannot be negative")
	}
	if c.ScoringMethod != "" && c.ScoringMethod != "highest" && c.ScoringMethod != "latest" && c.ScoringMethod != "average" {
		return errors.New("scoring_method must be one of: highest, latest, average")
	}
	if c.PassingScorePct < 0 || c.PassingScorePct > 100 {
		return errors.New("passing_score_pct must be between 0 and 100")
	}
	return nil
}

type SurveyConfig struct {
	AssetID     string `json:"asset_id,omitempty"`
	IsAnonymous bool   `json:"is_anonymous,omitempty"`
	// SurveyType categorises the survey card: pre | mid | post | pulse | session.
	SurveyType string `json:"survey_type,omitempty"`
	// TimeEstimateMins is the "~N min" shown on the card.
	TimeEstimateMins int `json:"time_estimate_mins,omitempty"`
}

func (c SurveyConfig) Validate() error {
	switch c.SurveyType {
	case "", "pre", "mid", "post", "pulse", "session":
		return nil
	default:
		return errors.New("survey_type must be one of: pre, mid, post, pulse, session")
	}
}

type LiveSessionConfig struct {
	SessionType string `json:"session_type,omitempty"` // in_person | virtual
}

// Validate requires SessionType to be a real value. Note: validateActivityConfig
// treats an empty/{}/nil config payload as always-valid BEFORE this ever runs
// (config is optional at activity-creation time for every type) — so this only
// actually rejects a live_session activity once someone submits a non-trivial
// config payload for it. That's deliberate: existing activities with no
// config yet, or a brand-new activity before its first real edit, are
// unaffected; only an explicit missing/bad value on an actual write is
// rejected going forward. LiveSessionConfig has no other field, so any
// non-trivial payload for this type is, in practice, exactly the new format
// editor's write — this can't false-positive-reject some unrelated field.
func (c LiveSessionConfig) Validate() error {
	switch c.SessionType {
	case "in_person", "virtual":
		return nil
	default:
		return errors.New("session_type must be one of: in_person, virtual")
	}
}

type CoachingConfig struct {
	SessionType string `json:"session_type,omitempty"` // coaching_group | coaching_individual
}

func (c CoachingConfig) Validate() error { return nil }

type JournalConfig struct {
	Prompt string `json:"prompt,omitempty"`
}

func (c JournalConfig) Validate() error { return nil }

type AssignmentConfig struct {
	Instructions    string `json:"instructions,omitempty"`
	AllowLateSubmit bool   `json:"allow_late_submit,omitempty"`
}

func (c AssignmentConfig) Validate() error { return nil }

type PeerReviewConfig struct {
	Instructions           string `json:"instructions,omitempty"`
	ReviewersPerSubmission int    `json:"reviewers_per_submission,omitempty"`
}

func (c PeerReviewConfig) Validate() error {
	if c.ReviewersPerSubmission < 0 {
		return errors.New("reviewers_per_submission cannot be negative")
	}
	return nil
}

// validateActivityConfig checks a raw JSON config payload against the schema
// for the given activity type. An empty/nil payload is always valid (config
// is optional — activities can be scheduled before content is attached).
func validateActivityConfig(activityType string, raw json.RawMessage) error {
	if len(raw) == 0 || string(raw) == "null" || string(raw) == "{}" {
		return nil
	}

	switch activityType {
	case "video":
		var c VideoConfig
		if err := json.Unmarshal(raw, &c); err != nil {
			return err
		}
		return c.Validate()
	case "pdf":
		var c PDFConfig
		if err := json.Unmarshal(raw, &c); err != nil {
			return err
		}
		return c.Validate()
	case "case_study":
		var c CaseStudyConfig
		if err := json.Unmarshal(raw, &c); err != nil {
			return err
		}
		return c.Validate()
	case "content":
		var c ContentConfig
		if err := json.Unmarshal(raw, &c); err != nil {
			return err
		}
		return c.Validate()
	case "assessment":
		var c AssessmentConfig
		if err := json.Unmarshal(raw, &c); err != nil {
			return err
		}
		return c.Validate()
	case "survey":
		var c SurveyConfig
		if err := json.Unmarshal(raw, &c); err != nil {
			return err
		}
		return c.Validate()
	case "live_session":
		var c LiveSessionConfig
		if err := json.Unmarshal(raw, &c); err != nil {
			return err
		}
		return c.Validate()
	case "coaching":
		var c CoachingConfig
		if err := json.Unmarshal(raw, &c); err != nil {
			return err
		}
		return c.Validate()
	case "journal":
		var c JournalConfig
		if err := json.Unmarshal(raw, &c); err != nil {
			return err
		}
		return c.Validate()
	case "assignment":
		var c AssignmentConfig
		if err := json.Unmarshal(raw, &c); err != nil {
			return err
		}
		return c.Validate()
	case "peer_review":
		var c PeerReviewConfig
		if err := json.Unmarshal(raw, &c); err != nil {
			return err
		}
		return c.Validate()
	case "admin_task":
		var c WorkflowConfig
		if err := json.Unmarshal(raw, &c); err != nil {
			return err
		}
		return c.Validate()
	default:
		return errors.New("unknown activity type: " + activityType)
	}
}

// ── Phase types ───────────────────────────────────────────────────
// Drives which UI the Design Studio renders for a phase: module-virtual and
// module-in-person get a PRE-WORK/POST-WORK module grid; pre-enrolment and
// post-program get flat activity cards (workflow-driven); everything else
// (orientation, coaching, capstone, custom) gets a generic module list.

var validPhaseTypes = map[string]bool{
	"pre-enrolment":    true,
	"orientation":      true,
	"module-virtual":   true,
	"module-in-person": true,
	"coaching":         true,
	"capstone":         true,
	"post-program":     true,
	"custom":           true,
}

func isValidPhaseType(t string) bool { return validPhaseTypes[t] }

// activityPhaseTypes render flat DSActivityCard-style cards (no modules).
var activityPhaseTypes = map[string]bool{"pre-enrolment": true, "post-program": true}

// modulePhaseTypes render the PRE-WORK/POST-WORK module grid.
var modulePhaseTypes = map[string]bool{"module-virtual": true, "module-in-person": true}

func isActivityPhaseType(t string) bool { return activityPhaseTypes[t] }
func isModulePhaseType(t string) bool   { return modulePhaseTypes[t] }

// ── Activity workflow configs ────────────────────────────────────
// Activity-phase cards (Nomination, Welcome Email, Manager Briefing, etc.)
// carry an arbitrary item list + optional AI-draftable email body, stored in
// the same activities.config_json column as any other activity config.

type WorkflowConfig struct {
	Fields    map[string]string   `json:"fields,omitempty"`     // configFields values (subject, sendDate, link, etc.)
	Items     []map[string]string `json:"items,omitempty"`      // itemLabel rows (nominees, briefing sessions, etc.)
	EmailBody string              `json:"email_body,omitempty"` // for Welcome Email activities
}

func (c WorkflowConfig) Validate() error { return nil }
