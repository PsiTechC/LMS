package organizations

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/xa-lms/api/internal/ai/onboarding"
	"github.com/xa-lms/api/internal/ai/scope"
)

// suggestOrgSetupService is a pure read/reason call — it never creates or
// touches an organization. callerUserID/Role are used only to build the
// AI Scope (for consistency with every other engine call), not to check
// permission here; permission is already enforced by the same
// "organizations:create" gate the handler.Register wires this route behind,
// identical to the gate on the real create() endpoint.
//
// Deliberately no per-org feature flag here: this feature runs BEFORE any
// org exists (it's suggesting defaults for one that's about to be created),
// so there's no org to scope a flag to. Superadmins are also platform-wide
// and typically have no org_members row, so an org-scoped flag could never
// be satisfied for them. Any caller who already cleared the
// organizations:create RBAC gate (Primary Super Admin only) may use this.
func suggestOrgSetupService(ctx context.Context, callerUserID, callerRole string, req SuggestOrgSetupRequest) (*OrgSetupSuggestionDTO, error) {
	if req.OrgName == "" {
		return nil, errors.New("org_name is required")
	}

	uid, err := uuid.Parse(callerUserID)
	if err != nil {
		return nil, errors.New("invalid caller id")
	}
	s := scope.Scope{UserID: uid, Role: callerRole}

	result, err := onboarding.SuggestOrgSetup(ctx, s, onboarding.Input{
		OrgName:     req.OrgName,
		Description: req.Description,
	})
	if err != nil {
		return nil, err
	}

	dto := &OrgSetupSuggestionDTO{
		Industry:  result.Industry,
		Size:      result.Size,
		Plan:      result.Plan,
		Seats:     result.Seats,
		Rationale: result.Rationale,
	}
	if result.BrandKit != nil {
		dto.BrandKit = &BrandKitSuggestionDTO{Primary: result.BrandKit.Primary, Accent: result.BrandKit.Accent}
	}
	return dto, nil
}
