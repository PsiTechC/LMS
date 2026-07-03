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

type VideoConfig struct {
	AssetID string `json:"asset_id,omitempty"`
}

func (c VideoConfig) Validate() error { return nil }

type PDFConfig struct {
	AssetID string `json:"asset_id,omitempty"`
}

func (c PDFConfig) Validate() error { return nil }

type CaseStudyConfig struct {
	AssetID string `json:"asset_id,omitempty"`
}

func (c CaseStudyConfig) Validate() error { return nil }

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
	SessionType string `json:"session_type,omitempty"` // classroom | virtual
}

func (c LiveSessionConfig) Validate() error { return nil }

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
