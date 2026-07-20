// Package scope defines the restriction context every AI engine call is
// bound to. A Scope is built once per request from the caller's JWT claims
// and org/program resolution, then threaded into every engine function -
// narrower personas (e.g. Participant Retailer, Superadmin Secondary) are
// implemented later as a narrower Scope, not a separate code path.
package scope

import "github.com/google/uuid"

// Scope restricts an AI engine call to a caller's org, program, cohort, and
// role. OrgID/ProgramID/CohortID are optional (nil when the caller isn't
// scoped to one) - narrower engine functions (e.g. a per-cohort brief)
// require CohortID be set and error if it's nil, same pattern as
// aggregate.GenerateBrief's existing ProgramID requirement.
type Scope struct {
	UserID    uuid.UUID
	OrgID     *uuid.UUID
	ProgramID *uuid.UUID
	CohortID  *uuid.UUID
	Role      string
}
