package zoom

import (
	"encoding/json"

	"github.com/xa-lms/api/internal/shared"
	"github.com/xa-lms/api/pkg/database"
)

// This file resolves an org's S2S Zoom credentials (Phase 2, stored on
// organizations.settings["zoom_credentials"]) for use by CreateMeeting
// (Phase 3). The zoom module never imports the organizations Go package
// (modules never import each other's packages — CLAUDE.md); it reads the
// organizations table directly via raw SQL instead, mirroring the JSON shape
// organizations/service.go's zoomCredentialsSettings defines. This is the
// same pattern zoom/repository.go already uses to read class_sessions
// without importing the sessions package.

// orgZoomCredentials is the decrypted, ready-to-use form of an org's stored
// Zoom credentials: an s2sConfig (for the token exchange) plus the specific
// Zoom user every meeting for this org is hosted under.
type orgZoomCredentials struct {
	s2sConfig
	hostUserIDOrEmail string
}

// orgZoomSettingsRow mirrors organizations/service.go's zoomCredentialsSettings
// JSON shape. Kept in sync manually — see the module-isolation note above.
type orgZoomSettingsRow struct {
	AccountID             string `json:"account_id"`
	ClientID              string `json:"client_id"`
	EncryptedClientSecret string `json:"encrypted_client_secret"`
	HostUserIDOrEmail     string `json:"host_user_id_or_email"`
}

// getOrgIDForSession resolves the organization that owns sessionID, via
// class_sessions.program_id -> programs.org_id.
func getOrgIDForSession(sessionID string) (string, error) {
	var orgID string
	err := database.DB.Raw(`
		SELECT p.org_id::text
		FROM class_sessions cs
		JOIN programs p ON p.id = cs.program_id
		WHERE cs.id = ?::uuid
	`, sessionID).Scan(&orgID).Error
	if err != nil {
		return "", err
	}
	if orgID == "" {
		return "", ErrNotFound
	}
	return orgID, nil
}

// orgZoomCredentialsFor reads and decrypts orgID's stored Zoom credentials.
// Returns ErrOrgZoomNotConfigured if the org has never saved any (or the
// stored value is incomplete) — the caller-facing signal that this org needs
// Superadmin to set up Zoom before scheduling embedded meetings.
func orgZoomCredentialsFor(orgID string) (*orgZoomCredentials, error) {
	row, err := orgZoomSettingsFor(orgID)
	if err != nil {
		return nil, err
	}
	secret, err := shared.DecryptSecret(row.EncryptedClientSecret)
	if err != nil {
		return nil, err
	}
	return &orgZoomCredentials{s2sConfig: s2sConfig{accountID: row.AccountID, clientID: row.ClientID, clientSecret: secret}, hostUserIDOrEmail: row.HostUserIDOrEmail}, nil
}

func orgZoomCredentialFingerprintFor(orgID string) (string, error) {
	row, err := orgZoomSettingsFor(orgID)
	if err != nil {
		return "", err
	}
	return row.AccountID + "\x00" + row.ClientID + "\x00" + row.EncryptedClientSecret + "\x00" + row.HostUserIDOrEmail, nil
}

func orgZoomSettingsFor(orgID string) (*orgZoomSettingsRow, error) {
	// GORM's Scan into a *[]byte destination mis-scans (tries to convert the
	// driver value into the slice's element type, uint8, instead of the
	// slice itself) — scan into a string instead, which it handles correctly
	// (see the working examples elsewhere in this codebase, e.g. ai/repository.go).
	var settingsJSON string
	err := database.DB.Raw(`SELECT settings FROM organizations WHERE id = ?::uuid`, orgID).Scan(&settingsJSON).Error
	if err != nil {
		return nil, err
	}
	if len(settingsJSON) == 0 {
		return nil, ErrOrgZoomNotConfigured
	}

	var wrapper struct {
		ZoomCredentials *orgZoomSettingsRow `json:"zoom_credentials"`
	}
	if err := json.Unmarshal([]byte(settingsJSON), &wrapper); err != nil {
		return nil, err
	}
	row := wrapper.ZoomCredentials
	if row == nil || row.AccountID == "" || row.ClientID == "" || row.EncryptedClientSecret == "" || row.HostUserIDOrEmail == "" {
		return nil, ErrOrgZoomNotConfigured
	}

	return row, nil
}

// s2sConfigForOrg is the narrower accessor fetchAccessTokenForOrg needs —
// just the token-exchange credentials, not the host user id.
func s2sConfigForOrg(orgID string) (s2sConfig, error) {
	creds, err := orgZoomCredentialsFor(orgID)
	if err != nil {
		return s2sConfig{}, err
	}
	return creds.s2sConfig, nil
}
