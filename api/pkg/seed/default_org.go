package seed

import (
	"log"
	"sync"

	"github.com/xa-lms/api/pkg/database"
)

// DefaultOrgName / DefaultOrgSlug identify the platform-wide "XA-LMS" organization.
// This org is the home for org-wide coaches (no specific program) and for
// marketplace ("Open Program") self-enrollments that don't belong to any
// customer org.
const (
	DefaultOrgName = "XA-LMS"
	DefaultOrgSlug = "xa-lms"
)

var (
	defaultOrgID   string
	defaultOrgOnce sync.Once
)

// DefaultOrg ensures the platform-wide "XA-LMS" organization exists and returns
// its id. Idempotent — safe to run on every boot against the shared DB.
func DefaultOrg() (string, error) {
	var id string
	err := database.DB.Raw(`
		SELECT id::text FROM organizations WHERE slug = ? LIMIT 1
	`, DefaultOrgSlug).Scan(&id).Error
	if err != nil {
		return "", err
	}
	if id != "" {
		defaultOrgID = id
		log.Printf("✅ Default org already exists: %s (%s)", DefaultOrgName, id)
		return id, nil
	}

	err = database.DB.Raw(`
		INSERT INTO organizations (name, slug, plan, status, seats)
		VALUES (?, ?, 'enterprise', 'active', 10000)
		RETURNING id::text
	`, DefaultOrgName, DefaultOrgSlug).Scan(&id).Error
	if err != nil {
		return "", err
	}
	defaultOrgID = id
	log.Printf("✅ Default org created → %s (%s)", DefaultOrgName, id)
	return id, nil
}

// DefaultOrgID returns the cached id of the default "XA-LMS" org, resolving it
// from the DB (and caching) on first use. Returns "" only if the org cannot be
// found/created — callers should treat that as a hard error.
func DefaultOrgID() string {
	if defaultOrgID != "" {
		return defaultOrgID
	}
	defaultOrgOnce.Do(func() {
		if _, err := DefaultOrg(); err != nil {
			log.Printf("⚠️  DefaultOrgID lookup failed: %v", err)
		}
	})
	return defaultOrgID
}
