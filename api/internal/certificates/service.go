package certificates

import (
	"bytes"
	"errors"
	"image"
	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/xa-lms/api/internal/shared"
)

// ErrNoTemplate is returned when the program has no attached certificate
// template - not an error condition for the automatic completion hook
// (most programs simply won't have one), but a real 422 for the manual
// issue endpoint, which the caller should surface clearly.
var ErrNoTemplate = errors.New("program has no certificate template attached")

// ErrAlreadyIssued is returned by ManualIssue when the enrollment already has
// a certificate - the auto-issue path treats this as a no-op success instead
// (see IssueForEnrollment), but a manual action should tell the caller so
// they don't think nothing happened.
var ErrAlreadyIssued = errors.New("a certificate has already been issued for this enrollment")

// IssueForEnrollment is the automatic-completion entry point: called after
// any recompute of enrollment.completion_percent that might have just
// reached 100 (see hook.go and the loopback bridge in sessions/activityprogress/
// assessments/surveys). Idempotent via the enrollment_id unique index -
// mirrors capstone/manage_service.go's issueCertificateIfNeeded, which uses
// the exact same "check exists, no-op if so" shape for the same reason
// (recompute call sites fire on every progress write, not just the one that
// crosses 100%).
// callerID/callerRole are enforced here, not just at the route-permission
// layer: certificates:read is granted to every role including Participant,
// so without this check any authenticated participant could call this
// endpoint directly (not just via the loopback bridge) with an arbitrary
// enrollment_id belonging to a different user/org and force issuance,
// bypassing the intended "only the completion-recompute call sites trigger
// this, for the enrollment that just changed" flow. A participant may only
// trigger issuance for their own enrollment; admin-tier roles may trigger
// any (matches GetFile's ownership rule below).
func IssueForEnrollment(enrollmentID, callerID, callerRole string) (*IssuedCertificate, error) {
	eid, err := uuid.Parse(enrollmentID)
	if err != nil {
		return nil, errors.New("invalid enrollment_id")
	}

	if existing, err := getIssuedCertificateByEnrollment(eid); err == nil {
		return existing, nil // already issued - not an error, matches capstone's idiom
	} else if !errors.Is(err, ErrNotFound) {
		return nil, err
	}

	ctx, err := getEnrollmentContext(enrollmentID)
	if err != nil {
		return nil, err
	}
	if ctx.ParticipantID != callerID && !isAdminRole(callerRole) {
		return nil, ErrForbidden
	}

	pct, err := getEnrollmentCompletionPercent(enrollmentID)
	if err != nil {
		return nil, err
	}
	if pct < 100 {
		return nil, nil // not actually complete yet - silently skip, not an error
	}

	template, err := getActiveCertificateTemplateForProgram(ctx.ProgramID)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return nil, nil // no template attached - not an error, most programs won't have one
		}
		return nil, err
	}

	return issue(ctx, template, nil)
}

// ManualIssue is the PM/SA override path: issues a certificate regardless of
// completion_percent, for exceptions (e.g. non-quiz-gated programs, manual
// backfills). Fails loudly (ErrAlreadyIssued/ErrNoTemplate) rather than
// silently no-op'ing like the automatic path, since a human explicitly
// asked for this action.
func ManualIssue(enrollmentID string, issuedBy uuid.UUID) (*IssuedCertificate, error) {
	eid, err := uuid.Parse(enrollmentID)
	if err != nil {
		return nil, errors.New("invalid enrollment_id")
	}
	if _, err := getIssuedCertificateByEnrollment(eid); err == nil {
		return nil, ErrAlreadyIssued
	} else if !errors.Is(err, ErrNotFound) {
		return nil, err
	}

	ctx, err := getEnrollmentContext(enrollmentID)
	if err != nil {
		return nil, err
	}
	template, err := getActiveCertificateTemplateForProgram(ctx.ProgramID)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return nil, ErrNoTemplate
		}
		return nil, err
	}

	return issue(ctx, template, &issuedBy)
}

// issue renders and persists the certificate, generating a unique serial
// code in the same style as capstone's "CAP-XXXXXXXX" (capstone/manage_service.go:534)
// - "XA-" prefix distinguishes this module's certificates in shared contexts
// like audit logs.
func issue(ctx *enrollmentContextRow, template *templateAssetRow, issuedBy *uuid.UUID) (*IssuedCertificate, error) {
	orgID, err := uuid.Parse(ctx.OrgID)
	if err != nil {
		return nil, err
	}
	programID, err := uuid.Parse(ctx.ProgramID)
	if err != nil {
		return nil, err
	}
	enrollmentID, err := uuid.Parse(ctx.EnrollmentID)
	if err != nil {
		return nil, err
	}
	participantID, err := uuid.Parse(ctx.ParticipantID)
	if err != nil {
		return nil, err
	}
	templateID, err := uuid.Parse(template.ID)
	if err != nil {
		return nil, err
	}

	serial := newSerialCode()

	completedOn := time.Now()
	if ctx.CompletedAt != nil {
		completedOn = *ctx.CompletedAt
	}

	var bg image.Image
	if len(template.FileData) > 0 {
		if img, _, decodeErr := image.Decode(bytes.NewReader(template.FileData)); decodeErr == nil {
			bg = img
		}
	}

	fileBytes, err := render(renderInput{
		Background:      bg,
		Placements:      parsePlacements(template.Meta),
		ParticipantName: ctx.ParticipantName,
		ProgramTitle:    ctx.ProgramTitle,
		CompletedOn:     completedOn.Format("2 January 2006"),
		Email:           ctx.ParticipantEmail,
		SerialCode:      serial,
	})
	if err != nil {
		return nil, err
	}

	cert := &IssuedCertificate{
		ID:              uuid.New(),
		OrgID:           orgID,
		ProgramID:       programID,
		EnrollmentID:    enrollmentID,
		ParticipantID:   participantID,
		TemplateAssetID: templateID,
		SerialCode:      serial,
		FileData:        fileBytes,
		MimeType:        "application/pdf",
		IssuedAt:        time.Now(),
		IssuedBy:        issuedBy,
	}
	if err := createIssuedCertificate(cert); err != nil {
		// A concurrent call (e.g. two of the three completion-recompute call
		// sites firing near-simultaneously for the same enrollment) can lose
		// the race on the enrollment_id unique constraint here - that's the
		// expected idempotent case, not a real failure, so fetch and return
		// whichever row actually won instead of surfacing a raw insert error.
		if existing, getErr := getIssuedCertificateByEnrollment(enrollmentID); getErr == nil {
			return existing, nil
		}
		return nil, err
	}
	return cert, nil
}

func newSerialCode() string {
	return "XA-" + strings.ToUpper(uuid.New().String()[:8])
}

// Revoke soft-revokes an issued certificate (kept, not deleted, so verify
// can still report "revoked" rather than "unknown code").
func Revoke(id string) error {
	uid, err := uuid.Parse(id)
	if err != nil {
		return errors.New("invalid id")
	}
	return revokeIssuedCertificate(uid)
}

// ListMine returns a participant's own active (non-revoked) certificates.
func ListMine(participantID string) ([]CertificateResponse, error) {
	pid, err := uuid.Parse(participantID)
	if err != nil {
		return nil, errors.New("invalid participant id")
	}
	rows, err := listIssuedCertificatesForParticipant(pid)
	if err != nil {
		return nil, err
	}
	out := make([]CertificateResponse, 0, len(rows))
	for _, r := range rows {
		out = append(out, toResponse(r))
	}
	return out, nil
}

// GetFile returns the stored PDF bytes for id, enforcing that callerID owns
// the certificate unless callerRole is an admin tier.
func GetFile(id, callerID, callerRole string) (*IssuedCertificate, error) {
	uid, err := uuid.Parse(id)
	if err != nil {
		return nil, errors.New("invalid id")
	}
	cert, err := getIssuedCertificateByID(uid)
	if err != nil {
		return nil, err
	}
	if cert.ParticipantID.String() != callerID && !isAdminRole(callerRole) {
		return nil, ErrForbidden
	}
	return cert, nil
}

// VerifyBySerial is the public, unauthenticated verify-by-code lookup -
// deliberately returns minimal data (see VerifyResponse) since anyone with
// the printed code can call this.
func VerifyBySerial(code string) (*VerifyResponse, error) {
	cert, err := getIssuedCertificateBySerial(code)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return &VerifyResponse{Valid: false}, nil
		}
		return nil, err
	}
	vctx, err := getVerifyContext(cert.ProgramID.String(), cert.ParticipantID.String())
	if err != nil {
		return nil, err
	}
	return &VerifyResponse{
		Valid:           cert.RevokedAt == nil,
		ParticipantName: vctx.ParticipantName,
		ProgramTitle:    vctx.ProgramTitle,
		IssuedAt:        cert.IssuedAt.Format(time.RFC3339),
		Revoked:         cert.RevokedAt != nil,
	}, nil
}

func toResponse(c IssuedCertificate) CertificateResponse {
	programTitle := ""
	if row, err := getVerifyContext(c.ProgramID.String(), c.ParticipantID.String()); err == nil {
		programTitle = row.ProgramTitle
	}
	return CertificateResponse{
		ID:             c.ID.String(),
		ProgramID:      c.ProgramID.String(),
		ProgramTitle:   programTitle,
		SerialCode:     c.SerialCode,
		IssuedAt:       c.IssuedAt.Format(time.RFC3339),
		Revoked:        c.RevokedAt != nil,
		ManuallyIssued: c.IssuedBy != nil,
	}
}

// isAdminRole covers every role granted certificates:read besides
// Participant (see rbac.go) - Faculty must be included, or a Faculty member
// (who passes the route's permission check) would still 403 on every
// download/auto-issue call for a participant who isn't themselves, which
// isn't the intent of granting Faculty certificates:read in the first place.
func isAdminRole(role string) bool {
	switch role {
	case shared.RoleSuperAdmin, shared.RoleSuperAdminSecondary, shared.RoleProgramManager, shared.RoleFaculty:
		return true
	default:
		return false
	}
}
