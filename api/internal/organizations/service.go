package organizations

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/mail"
	"regexp"
	"strings"
	"time"

	"github.com/xa-lms/api/internal/auth"
	"github.com/xa-lms/api/internal/rbac"
	"github.com/xa-lms/api/internal/shared"
	"github.com/xa-lms/api/pkg/database"
	"gorm.io/gorm"
)

func listOrgsService() ([]OrgResponse, error) {
	orgs, err := listOrgs()
	if err != nil {
		return nil, err
	}
	orgIDs := make([]string, 0, len(orgs))
	for _, o := range orgs {
		orgIDs = append(orgIDs, o.ID.String())
	}
	pmNames, err := listPrimaryPMNames(orgIDs)
	if err != nil {
		// Non-fatal: the org list itself is still useful without PM names -
		// degrade to blank names rather than failing the whole page.
		pmNames = map[string]string{}
	}
	result := make([]OrgResponse, 0, len(orgs))
	for _, o := range orgs {
		result = append(result, orgToDTO(o, pmNames[o.ID.String()]))
	}
	return result, nil
}

func deleteOrganizationService(id string) error {
	return deleteOrganization(id)
}

// getOrgService fetches a single org plus its Primary PM name - the service-
// layer counterpart to listOrgsService, used by the GET /organizations/:id
// handler so it doesn't need direct repository access.
func getOrgService(id string) (*OrgResponse, error) {
	org, err := getOrgByID(id)
	if err != nil {
		return nil, err
	}
	pmName, err := getPrimaryPMName(id)
	if err != nil {
		pmName = ""
	}
	dto := orgToDTO(*org, pmName)
	return &dto, nil
}

func createOrgService(req CreateOrgRequest) (*CreateOrgResponse, error) {
	if strings.TrimSpace(req.Name) == "" {
		return nil, NewValidationError("organization name is required")
	}
	if strings.TrimSpace(req.AdminName) == "" {
		return nil, NewValidationError("admin name is required")
	}
	if strings.TrimSpace(req.AdminEmail) == "" {
		return nil, NewValidationError("admin email is required")
	}
	if !shared.IsValidEmail(strings.TrimSpace(req.AdminEmail)) {
		return nil, NewValidationError("admin email is not a valid email address")
	}
	if strings.TrimSpace(req.AdminPhone) != "" && !shared.IsValidPhone(strings.TrimSpace(req.AdminPhone)) {
		return nil, NewValidationError("admin mobile number is not valid")
	}
	if strings.TrimSpace(req.AdminPassword) == "" {
		return nil, NewValidationError("admin password is required")
	}
	if len(strings.TrimSpace(req.AdminPassword)) < 8 {
		return nil, NewValidationError("admin password must be at least 8 characters")
	}

	baseSlug := req.Slug
	if strings.TrimSpace(baseSlug) == "" {
		baseSlug = req.Name
	}
	slug, err := generateUniqueSlug(baseSlug)
	if err != nil {
		return nil, err
	}

	nameTaken, err := orgNameExists(strings.TrimSpace(req.Name))
	if err != nil {
		return nil, err
	}
	if nameTaken {
		return nil, ErrOrgNameTaken
	}

	adminEmail := strings.TrimSpace(req.AdminEmail)
	emailTaken, err := adminEmailExists(adminEmail)
	if err != nil {
		return nil, err
	}
	if emailTaken {
		return nil, ErrEmailTaken
	}

	plan := req.Plan
	if plan == "" {
		plan = "starter"
	}
	seats := req.Seats
	if seats <= 0 {
		seats = 50
	}

	var industry, size *string
	if req.Industry != "" {
		v := req.Industry
		industry = &v
	}
	if req.Size != "" {
		v := req.Size
		size = &v
	}

	org := &Organization{
		Name:     req.Name,
		Slug:     slug,
		Plan:     plan,
		Status:   "active",
		Seats:    seats,
		Industry: industry,
		Size:     size,
	}

	hash, err := auth.HashPassword(req.AdminPassword)
	if err != nil {
		return nil, err
	}

	adminUser := &auth.User{
		Email:        adminEmail,
		Name:         req.AdminName,
		PasswordHash: hash,
		Role:         "program_manager",
		IsActive:     true,
		// Created by a Super Admin as part of org setup - this is a trusted admin
		// action, so the account is pre-verified and can log in with the password
		// (or OTP) immediately, no email-verification step required.
		IsVerified: true,
	}

	if err := database.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(org).Error; err != nil {
			return err
		}
		if err := tx.Create(adminUser).Error; err != nil {
			if strings.Contains(err.Error(), "users_email_key") {
				return ErrEmailTaken
			}
			return err
		}
		member := &OrgMember{
			OrgID:  org.ID,
			UserID: adminUser.ID,
			Role:   "admin",
		}
		if err := tx.Create(member).Error; err != nil {
			return err
		}
		// The org admin is a program_manager (cut over to the resolver), so it must
		// have a role_assignments row. Created atomically with the org + admin user.
		if err := rbac.EnsureBaseRoleAssignment(tx, adminUser.ID.String(), "program_manager", org.ID.String()); err != nil {
			return err
		}
		// This admin is, by construction, the very first (and right now only)
		// account in a brand-new org - always safe to mark them Primary PM
		// unconditionally, no uniqueness check needed (there is nothing yet
		// for them to collide with). is_primary_pm is the single source of
		// truth read everywhere else (uniqueness checks in
		// createAssignmentService/assignOrgMemberRoleService, the future
		// PM-scoped Role Management tab's guard, and the UI's Primary/
		// Secondary tag) - see api/migrations/000041.
		return tx.Exec(`
			UPDATE role_assignments SET is_primary_pm = TRUE
			WHERE user_id = ? AND org_id = ?`,
			adminUser.ID.String(), org.ID.String(),
		).Error
	}); err != nil {
		return nil, err
	}

	pmName, err := getPrimaryPMName(org.ID.String())
	if err != nil {
		pmName = ""
	}
	return &CreateOrgResponse{
		Organization: orgToDTO(*org, pmName),
		AdminUserID:  adminUser.ID.String(),
	}, nil
}

var slugRegex = regexp.MustCompile(`[^a-z0-9]+`)

func generateUniqueSlug(name string) (string, error) {
	base := strings.ToLower(strings.TrimSpace(name))
	base = slugRegex.ReplaceAllString(base, "-")
	base = strings.Trim(base, "-")

	if base == "" {
		base = "org"
	}

	slug := base
	counter := 1

	for {
		taken, err := slugExists(slug)
		if err != nil {
			return "", err
		}
		if !taken {
			return slug, nil
		}
		slug = fmt.Sprintf("%s-%d", base, counter)
		counter++
	}
}

func updateOrgService(id string, req UpdateOrgRequest) (*OrgResponse, error) {
	fields := map[string]any{}
	if req.Name != "" {
		fields["name"] = req.Name
	}
	if req.Plan != "" {
		fields["plan"] = req.Plan
	}
	if req.Status != "" {
		fields["status"] = req.Status
	}
	if req.Seats > 0 {
		fields["seats"] = req.Seats
	}
	if req.Industry != "" {
		fields["industry"] = req.Industry
	}
	if req.Size != "" {
		fields["size"] = req.Size
	}
	var planStart, planEnd *time.Time
	if req.PlanStartDate != nil {
		if strings.TrimSpace(*req.PlanStartDate) == "" {
			fields["plan_start_date"] = nil
		} else {
			t, err := time.Parse("2006-01-02", *req.PlanStartDate)
			if err != nil {
				return nil, errors.New("plan_start_date must be YYYY-MM-DD")
			}
			planStart = &t
			fields["plan_start_date"] = t
		}
	}
	if req.PlanEndDate != nil {
		if strings.TrimSpace(*req.PlanEndDate) == "" {
			fields["plan_end_date"] = nil
		} else {
			t, err := time.Parse("2006-01-02", *req.PlanEndDate)
			if err != nil {
				return nil, errors.New("plan_end_date must be YYYY-MM-DD")
			}
			planEnd = &t
			fields["plan_end_date"] = t
		}
	}
	if planStart != nil && planEnd != nil && planEnd.Before(*planStart) {
		return nil, errors.New("plan_end_date must be on or after plan_start_date")
	}
	if req.BillingNote != nil {
		note := strings.TrimSpace(*req.BillingNote)
		if note == "" {
			fields["billing_note"] = nil
		} else {
			fields["billing_note"] = note
		}
	}
	if len(fields) == 0 {
		return nil, errors.New("no fields to update")
	}
	if err := updateOrg(id, fields); err != nil {
		return nil, err
	}
	org, err := getOrgByID(id)
	if err != nil {
		return nil, err
	}
	pmName, err := getPrimaryPMName(id)
	if err != nil {
		pmName = ""
	}
	dto := orgToDTO(*org, pmName)
	return &dto, nil
}

// deleteOrgService is a soft delete: it sets the org's status to "suspended"
// rather than removing any rows. Real deletion would need to cascade across
// users, programs, cohorts, enrollments, content, billing history, etc. -
// suspending is reversible (PATCH status back to "active") and keeps every
// historical record (audit log, analytics, billing) intact.
func deleteOrgService(id string) error {
	if _, err := getOrgByID(id); err != nil {
		return err
	}
	return updateOrg(id, map[string]any{"status": "suspended"})
}

func orgToDTO(o Organization, pmName string) OrgResponse {
	r := OrgResponse{
		ID:                 o.ID.String(),
		Name:               o.Name,
		Slug:               o.Slug,
		Plan:               o.Plan,
		Status:             o.Status,
		Seats:              o.Seats,
		ProgramManagerName: pmName,
	}
	if o.Industry != nil {
		r.Industry = *o.Industry
	}
	if o.Size != nil {
		r.Size = *o.Size
	}
	if o.PlanStartDate != nil {
		r.PlanStartDate = o.PlanStartDate.Format("2006-01-02")
	}
	if o.PlanEndDate != nil {
		r.PlanEndDate = o.PlanEndDate.Format("2006-01-02")
	}
	if o.LogoURL != nil {
		r.LogoURL = *o.LogoURL
	}
	if o.BillingNote != nil {
		r.BillingNote = *o.BillingNote
	}
	return r
}

func getCurrentBrandKitService(userID string) (*BrandKitDTO, error) {
	orgID, err := getOrgIDForUser(userID)
	if err != nil {
		return defaultBrandKit("Intellique"), nil
	}
	return getBrandKitService(orgID)
}

func getBrandKitService(orgID string) (*BrandKitDTO, error) {
	org, err := getOrgByID(orgID)
	if err != nil {
		return nil, err
	}
	brand := brandKitFromOrg(*org)
	return &brand, nil
}

func updateBrandKitService(orgID string, req UpdateBrandKitRequest) (*BrandKitDTO, error) {
	org, err := getOrgByID(orgID)
	if err != nil {
		return nil, err
	}
	brand := brandKitFromOrg(*org)
	if req.Primary != nil {
		brand.Primary = strings.TrimSpace(*req.Primary)
	}
	if req.Sidebar != nil {
		brand.Sidebar = strings.TrimSpace(*req.Sidebar)
	}
	if req.Accent != nil {
		brand.Accent = strings.TrimSpace(*req.Accent)
	}
	if req.Surface != nil {
		brand.Surface = strings.TrimSpace(*req.Surface)
	}
	if req.Text != nil {
		brand.Text = strings.TrimSpace(*req.Text)
	}
	if req.Font != nil {
		brand.Font = normalizeBrandFont(*req.Font)
	}
	if req.LogoText != nil {
		brand.LogoText = strings.TrimSpace(*req.LogoText)
	}
	if req.LogoURL != nil {
		brand.LogoURL = strings.TrimSpace(*req.LogoURL)
	}
	if err := validateBrandKit(brand); err != nil {
		return nil, err
	}
	settings := map[string]any{}
	if len(org.Settings) > 0 {
		_ = json.Unmarshal(org.Settings, &settings)
	}
	settings["brand_kit"] = brand
	settingsJSON, err := json.Marshal(settings)
	if err != nil {
		return nil, err
	}
	if err := updateOrgSettings(orgID, settingsJSON); err != nil {
		return nil, err
	}
	return &brand, nil
}

func brandKitFromOrg(org Organization) BrandKitDTO {
	brand := *defaultBrandKit(org.Name)
	settings := map[string]json.RawMessage{}
	if len(org.Settings) > 0 && json.Unmarshal(org.Settings, &settings) == nil {
		if raw, ok := settings["brand_kit"]; ok {
			_ = json.Unmarshal(raw, &brand)
		}
	}
	if strings.TrimSpace(brand.LogoText) == "" {
		brand.LogoText = org.Name
	}
	brand.Font = normalizeBrandFont(brand.Font)
	return brand
}

func defaultBrandKit(name string) *BrandKitDTO {
	if strings.TrimSpace(name) == "" {
		name = "Intellique"
	}
	return &BrandKitDTO{
		Primary:  "#C8A860",
		Sidebar:  "#182848",
		Accent:   "#C8A860",
		Surface:  "#F7F5F0",
		Text:     "#182848",
		Font:     "Poppins",
		LogoText: name,
		LogoURL:  "/intellique-app-icon.png",
	}
}

func validateBrandKit(b BrandKitDTO) error {
	colors := map[string]string{
		"primary": b.Primary,
		"sidebar": b.Sidebar,
		"accent":  b.Accent,
		"surface": b.Surface,
		"text":    b.Text,
	}
	for field, value := range colors {
		if !isHexColor(value) {
			return errors.New(field + " must be a hex color")
		}
	}
	if strings.TrimSpace(b.LogoText) == "" {
		return errors.New("logo_text is required")
	}
	return nil
}

func isHexColor(s string) bool {
	if len(s) != 7 || s[0] != '#' {
		return false
	}
	for _, ch := range s[1:] {
		if !((ch >= '0' && ch <= '9') || (ch >= 'a' && ch <= 'f') || (ch >= 'A' && ch <= 'F')) {
			return false
		}
	}
	return true
}

// ── Org-level Zoom credentials ────────────────────────────────────────────
// Follows the exact same org.Settings JSONB pattern as brand_kit above:
// read-unmarshal-into-map, set one key, marshal-write-back. Storage only -
// nothing in the zoom module reads this key yet (wired in a later phase).

// zoomCredentialsSettings is the JSON shape stored at settings["zoom_credentials"].
// EncryptedClientSecret is ALWAYS shared.EncryptSecret's output - the raw
// client_secret is never marshaled or persisted anywhere.
type zoomCredentialsSettings struct {
	AccountID             string `json:"account_id"`
	ClientID              string `json:"client_id"`
	EncryptedClientSecret string `json:"encrypted_client_secret"`
	// HostUserIDOrEmail - see SaveZoomCredentialsRequest for why this exists.
	// Not encrypted: it's a Zoom user identifier/email, not a secret.
	HostUserIDOrEmail string `json:"host_user_id_or_email"`
	ConnectedAt       string `json:"connected_at"`
	ConnectedBy       string `json:"connected_by"`
}

func saveOrgZoomCredentialsService(orgID, callerUserID string, req SaveZoomCredentialsRequest) error {
	accountID := strings.TrimSpace(req.AccountID)
	clientID := strings.TrimSpace(req.ClientID)
	clientSecret := strings.TrimSpace(req.ClientSecret)
	hostUserIDOrEmail := strings.TrimSpace(req.HostUserIDOrEmail)
	if accountID == "" || clientID == "" || clientSecret == "" || hostUserIDOrEmail == "" {
		return errors.New("account_id, client_id, client_secret, and host_user_id_or_email are required")
	}

	org, err := getOrgByID(orgID)
	if err != nil {
		return err
	}

	encryptedSecret, err := shared.EncryptSecret(clientSecret)
	if err != nil {
		return err
	}

	settings := map[string]any{}
	if len(org.Settings) > 0 {
		_ = json.Unmarshal(org.Settings, &settings)
	}
	settings["zoom_credentials"] = zoomCredentialsSettings{
		AccountID:             accountID,
		ClientID:              clientID,
		EncryptedClientSecret: encryptedSecret,
		HostUserIDOrEmail:     hostUserIDOrEmail,
		ConnectedAt:           time.Now().UTC().Format(time.RFC3339),
		ConnectedBy:           callerUserID,
	}
	settingsJSON, err := json.Marshal(settings)
	if err != nil {
		return err
	}
	return updateOrgSettings(orgID, settingsJSON)
}

func deleteOrgZoomCredentialsService(orgID string) error {
	org, err := getOrgByID(orgID)
	if err != nil {
		return err
	}
	settings := map[string]any{}
	if len(org.Settings) > 0 {
		_ = json.Unmarshal(org.Settings, &settings)
	}
	if _, exists := settings["zoom_credentials"]; !exists {
		return nil
	}
	delete(settings, "zoom_credentials")
	settingsJSON, err := json.Marshal(settings)
	if err != nil {
		return err
	}
	return updateOrgSettings(orgID, settingsJSON)
}

func getOrgZoomCredentialsStatusService(orgID string) (*ZoomCredentialsStatusDTO, error) {
	org, err := getOrgByID(orgID)
	if err != nil {
		return nil, err
	}
	creds := zoomCredentialsFromOrg(*org)
	if creds == nil {
		return &ZoomCredentialsStatusDTO{Connected: false}, nil
	}
	return &ZoomCredentialsStatusDTO{
		Connected:       true,
		AccountIDMasked: maskAccountID(creds.AccountID),
		ConnectedAt:     creds.ConnectedAt,
	}, nil
}

// zoomCredentialsFromOrg mirrors brandKitFromOrg's read pattern exactly.
func zoomCredentialsFromOrg(org Organization) *zoomCredentialsSettings {
	settings := map[string]json.RawMessage{}
	if len(org.Settings) == 0 || json.Unmarshal(org.Settings, &settings) != nil {
		return nil
	}
	raw, ok := settings["zoom_credentials"]
	if !ok {
		return nil
	}
	var creds zoomCredentialsSettings
	if json.Unmarshal(raw, &creds) != nil || creds.AccountID == "" {
		return nil
	}
	return &creds
}

// saveOrgZoomHostEmailService sets (or, with an empty host_email, clears)
// orgID's default Zoom host identity — the email CreateMeeting falls back to
// for any faculty/coach whose own users.zoom_host_email is unset. Stored
// alongside zoom_credentials in org.Settings under its own key, since it
// carries no secret and has a different lifecycle from the (unused) S2S
// credentials block above.
func saveOrgZoomHostEmailService(orgID string, req SaveOrgZoomHostEmailRequest) error {
	hostEmail := strings.ToLower(strings.TrimSpace(req.HostEmail))
	if hostEmail != "" {
		parsed, err := mail.ParseAddress(hostEmail)
		if err != nil || !strings.EqualFold(parsed.Address, hostEmail) {
			return errors.New("host_email must be a valid email address")
		}
	}

	org, err := getOrgByID(orgID)
	if err != nil {
		return err
	}
	settings := map[string]any{}
	if len(org.Settings) > 0 {
		_ = json.Unmarshal(org.Settings, &settings)
	}
	if hostEmail == "" {
		delete(settings, "zoom_host_email")
	} else {
		settings["zoom_host_email"] = hostEmail
	}
	settingsJSON, err := json.Marshal(settings)
	if err != nil {
		return err
	}
	return updateOrgSettings(orgID, settingsJSON)
}

func getOrgZoomHostEmailService(orgID string) (*OrgZoomHostEmailDTO, error) {
	org, err := getOrgByID(orgID)
	if err != nil {
		return nil, err
	}
	settings := map[string]json.RawMessage{}
	if len(org.Settings) == 0 || json.Unmarshal(org.Settings, &settings) != nil {
		return &OrgZoomHostEmailDTO{}, nil
	}
	raw, ok := settings["zoom_host_email"]
	if !ok {
		return &OrgZoomHostEmailDTO{}, nil
	}
	var hostEmail string
	if json.Unmarshal(raw, &hostEmail) != nil {
		return &OrgZoomHostEmailDTO{}, nil
	}
	return &OrgZoomHostEmailDTO{HostEmail: hostEmail}, nil
}

// maskAccountID shows only the last 4 characters, e.g. "••••7abc" — enough
// for a PM to recognize which account is connected without exposing the
// full account_id (not secret, but no reason to show it in full either).
func maskAccountID(id string) string {
	if len(id) <= 4 {
		return "••••"
	}
	return "••••" + id[len(id)-4:]
}

func normalizeBrandFont(font string) string {
	switch strings.TrimSpace(font) {
	case "Inter", "Roboto", "Open Sans", "Montserrat", "Lato":
		return strings.TrimSpace(font)
	default:
		return "Poppins"
	}
}
