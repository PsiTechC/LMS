package scope

import (
	"github.com/google/uuid"
	"github.com/xa-lms/api/pkg/database"
)

// Build resolves a Scope for a user, looking up their org via org_members.
// programID is optional narrowing (e.g. the program a conversation/asset
// belongs to); pass uuid.Nil when not scoping to a program.
func Build(userID uuid.UUID, role string, programID uuid.UUID) Scope {
	s := Scope{UserID: userID, Role: role}
	if orgID, ok := orgIDForUser(userID); ok {
		s.OrgID = &orgID
	}
	if programID != uuid.Nil {
		s.ProgramID = &programID
	}
	return s
}

func orgIDForUser(userID uuid.UUID) (uuid.UUID, bool) {
	var orgID uuid.UUID
	err := database.DB.Raw(`SELECT org_id FROM org_members WHERE user_id = ? LIMIT 1`, userID).Scan(&orgID).Error
	if err != nil || orgID == uuid.Nil {
		return uuid.Nil, false
	}
	return orgID, true
}
