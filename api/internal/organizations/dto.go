package organizations

type CreateOrgRequest struct {
	Name          string `json:"name"`
	Slug          string `json:"slug"`
	Industry      string `json:"industry"`
	Size          string `json:"size"`
	Plan          string `json:"plan"`
	Seats         int    `json:"seats"`
	AdminName     string `json:"admin_name"`
	AdminEmail    string `json:"admin_email"`
	AdminPhone    string `json:"admin_phone"`
	AdminPassword string `json:"admin_password"`
}

type OrgResponse struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Slug     string `json:"slug"`
	Plan     string `json:"plan"`
	Status   string `json:"status"`
	Seats    int    `json:"seats"`
	Industry string `json:"industry,omitempty"`
	Size     string `json:"size,omitempty"`
	// Billing/contract fields — see Organization model comment. Consumed by
	// the superadmin Billing page's Organizations table; other existing
	// consumers of this same DTO (the Organizations page) simply don't
	// render these extra fields.
	ProgramManagerName string `json:"program_manager_name,omitempty"` // "" when no Primary PM assigned yet
	PlanStartDate      string `json:"plan_start_date,omitempty"`      // YYYY-MM-DD
	PlanEndDate        string `json:"plan_end_date,omitempty"`        // YYYY-MM-DD
	BillingNote        string `json:"billing_note,omitempty"`
}

type CreateOrgResponse struct {
	Organization OrgResponse `json:"organization"`
	AdminUserID  string      `json:"admin_user_id"`
}

type UpdateOrgRequest struct {
	Name     string `json:"name"`
	Plan     string `json:"plan"`
	Status   string `json:"status"`
	Seats    int    `json:"seats"`
	Industry string `json:"industry"`
	Size     string `json:"size"`
	// Billing/contract fields — pointers so "not sent" (leave unchanged) is
	// distinguishable from "sent as empty string" (clear it), unlike the
	// plain-string fields above which use the zero-value-means-omit
	// convention. PlanStartDate/PlanEndDate are YYYY-MM-DD.
	PlanStartDate *string `json:"plan_start_date,omitempty"`
	PlanEndDate   *string `json:"plan_end_date,omitempty"`
	BillingNote   *string `json:"billing_note,omitempty"`
}

type BrandKitDTO struct {
	Primary  string `json:"primary"`
	Sidebar  string `json:"sidebar"`
	Accent   string `json:"accent"`
	Surface  string `json:"surface"`
	Text     string `json:"text"`
	Font     string `json:"font"`
	LogoText string `json:"logo_text"`
	LogoURL  string `json:"logo_url"`
}

type UpdateBrandKitRequest struct {
	Primary  *string `json:"primary,omitempty"`
	Sidebar  *string `json:"sidebar,omitempty"`
	Accent   *string `json:"accent,omitempty"`
	Surface  *string `json:"surface,omitempty"`
	Text     *string `json:"text,omitempty"`
	Font     *string `json:"font,omitempty"`
	LogoText *string `json:"logo_text,omitempty"`
	LogoURL  *string `json:"logo_url,omitempty"`
}

// ── Onboarding Automation (AI-suggested setup defaults) ──────────────────────
// SuggestOrgSetup is read-only — it never creates or modifies an organization.
// The Super Admin still submits CreateOrgRequest through the existing,
// unchanged create() handler above.

type SuggestOrgSetupRequest struct {
	OrgName     string `json:"org_name"`
	Description string `json:"description"`
}

type BrandKitSuggestionDTO struct {
	Primary string `json:"primary"`
	Accent  string `json:"accent"`
}

type OrgSetupSuggestionDTO struct {
	Industry  string                 `json:"industry"`
	Size      string                 `json:"size"`
	Plan      string                 `json:"plan"`
	Seats     int                    `json:"seats"`
	BrandKit  *BrandKitSuggestionDTO `json:"brand_kit"`
	Rationale string                 `json:"rationale"`
}

// ── Org-level Zoom credentials (Superadmin-managed S2S app per org) ─────────
// Storage-only in this phase — not yet read by anything in the zoom module.

// SaveZoomCredentialsRequest is the plaintext input from the Superadmin's
// onboarding/config form. client_secret is encrypted before it ever touches
// the DB — see saveOrgZoomCredentialsService.
type SaveZoomCredentialsRequest struct {
	AccountID    string `json:"account_id"`
	ClientID     string `json:"client_id"`
	ClientSecret string `json:"client_secret"`
	// HostUserIDOrEmail is the specific Zoom user (account owner's Zoom login
	// email, typically) that CreateMeeting hosts every session under —
	// Zoom's S2S (account_credentials) token has no reliable "me" identity,
	// so meeting creation always targets POST /users/{this value}/meetings,
	// never /users/me/meetings. Not secret, but not shown to PMs either
	// (no operational reason to — PMs only need connected/not-connected).
	HostUserIDOrEmail string `json:"host_user_id_or_email"`
}

// ZoomCredentialsStatusDTO is the ONLY shape ever returned to a Program
// Manager — it deliberately has no field capable of carrying client_secret
// or its ciphertext, so there is no accidental-exposure path through this DTO.
type ZoomCredentialsStatusDTO struct {
	Connected       bool   `json:"connected"`
	AccountIDMasked string `json:"account_id_masked,omitempty"`
	ConnectedAt     string `json:"connected_at,omitempty"`
}
