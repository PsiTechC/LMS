package audit

import (
	"encoding/json"
	"errors"
	"log"
	"time"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/xa-lms/api/internal/shared"
)

// Severity levels for audit events.
const (
	SeverityInfo    = "info"
	SeverityWarning = "warning"
	SeverityError   = "error"
	SeveritySuccess = "success"
)

// Event is the payload passed to Log / LogActor. Category, Action and Severity
// are the required core; the rest are optional context.
type Event struct {
	Category   string
	Action     string
	Severity   string // info | warning | error | success (defaults to info)
	TargetType string
	TargetID   string
	OrgID      string
	Detail     any
}

// Log emits a central audit event, deriving the actor (user id + role) from the
// JWT claims on the request context. It never returns an error — a failed audit
// write must never break the primary flow. Writes are scoped to the
// JWT-authenticated actor.
func Log(c echo.Context, e Event) {
	var actorID, actorRole string
	if claims := shared.ClaimsFrom(c); claims != nil {
		actorID = claims.UserID
		actorRole = claims.Role
	}
	LogActor(actorID, actorRole, e.OrgID, e)
}

// LogActor emits a central audit event with an explicit actor. Use this for
// flows without an established JWT context (e.g. login success/failure) or
// system-initiated actions. An empty actorID records an anonymous event.
func LogActor(actorUserID, actorRole, orgID string, e Event) {
	if e.Category == "" || e.Action == "" {
		log.Printf("audit.LogActor: category and action are required (got %q/%q)", e.Category, e.Action)
		return
	}

	severity := e.Severity
	switch severity {
	case SeverityInfo, SeverityWarning, SeverityError, SeveritySuccess:
	default:
		severity = SeverityInfo
	}

	ev := &AuditEvent{
		Category: e.Category,
		Action:   e.Action,
		Severity: severity,
		Detail:   []byte("{}"),
	}
	if actorUserID != "" {
		if uid, err := uuid.Parse(actorUserID); err == nil {
			ev.ActorUserID = &uid
		}
	}
	if actorRole != "" {
		ev.ActorRole = &actorRole
	}
	if orgID != "" {
		if oid, err := uuid.Parse(orgID); err == nil {
			ev.OrgID = &oid
		}
	}
	if e.TargetType != "" {
		ev.TargetType = &e.TargetType
	}
	if e.TargetID != "" {
		ev.TargetID = &e.TargetID
	}
	if e.Detail != nil {
		if b, err := json.Marshal(e.Detail); err == nil {
			ev.Detail = b
		}
	}

	if err := insertEvent(ev); err != nil {
		log.Printf("audit.LogActor: failed to write event %s/%s: %v", e.Category, e.Action, err)
	}
}

// maxExportRows caps CSV export to protect the server from unbounded queries.
const maxExportRows = 50000

func listEventsService(q ListEventsQuery) ([]AuditEventResponse, int64, error) {
	if q.Page < 1 {
		q.Page = 1
	}
	if q.Limit < 1 || q.Limit > 100 {
		q.Limit = 20
	}
	offset := (q.Page - 1) * q.Limit

	filter, err := buildEventFilter(q)
	if err != nil {
		return nil, 0, err
	}

	rows, total, err := queryEvents(filter, offset, q.Limit)
	if err != nil {
		return nil, 0, err
	}

	result := make([]AuditEventResponse, 0, len(rows))
	for _, r := range rows {
		result = append(result, eventRowToDTO(r))
	}
	return result, total, nil
}

// categoriesService returns every distinct category value in audit_events —
// used to build the category pills/filter from real, complete data.
func categoriesService() ([]string, error) {
	return distinctCategories()
}

// exportEventsService returns all matching events (up to maxExportRows) for CSV,
// ignoring pagination but honouring every filter.
func exportEventsService(q ListEventsQuery) ([]AuditEventResponse, error) {
	filter, err := buildEventFilter(q)
	if err != nil {
		return nil, err
	}
	rows, _, err := queryEvents(filter, 0, maxExportRows)
	if err != nil {
		return nil, err
	}
	result := make([]AuditEventResponse, 0, len(rows))
	for _, r := range rows {
		result = append(result, eventRowToDTO(r))
	}
	return result, nil
}

func summaryService(orgID string) (AuditSummaryResponse, error) {
	return eventSummary(orgID)
}

// buildEventFilter normalizes query params into a repository filter, parsing the
// date range (accepts RFC3339 or YYYY-MM-DD; date_to date-only is inclusive of
// the whole day).
func buildEventFilter(q ListEventsQuery) (eventFilter, error) {
	f := eventFilter{
		ActorUserID: q.ActorUserID,
		OrgID:       q.OrgID,
		Category:    q.Category,
		Action:      q.Action,
		Severity:    q.Severity,
		UserSearch:  q.UserSearch,
	}
	if q.DateFrom != "" {
		t, err := parseBound(q.DateFrom, false)
		if err != nil {
			return f, errors.New("date_from must be RFC3339 or YYYY-MM-DD")
		}
		f.DateFrom = t.UTC().Format(time.RFC3339)
	}
	if q.DateTo != "" {
		t, err := parseBound(q.DateTo, true)
		if err != nil {
			return f, errors.New("date_to must be RFC3339 or YYYY-MM-DD")
		}
		f.DateTo = t.UTC().Format(time.RFC3339)
	}
	return f, nil
}

// parseBound parses a date/time bound. Date-only values snap to start of day,
// or end of day when endOfDay is true (inclusive upper bound).
func parseBound(s string, endOfDay bool) (time.Time, error) {
	if t, err := time.Parse(time.RFC3339, s); err == nil {
		return t, nil
	}
	d, err := time.Parse("2006-01-02", s)
	if err != nil {
		return time.Time{}, err
	}
	if endOfDay {
		return d.Add(24*time.Hour - time.Nanosecond), nil
	}
	return d, nil
}

func eventRowToDTO(r eventRow) AuditEventResponse {
	dto := eventToDTO(r.AuditEvent)
	if r.ActorName != nil {
		dto.ActorName = *r.ActorName
	}
	if r.ActorEmail != nil {
		dto.ActorEmail = *r.ActorEmail
	}
	return dto
}

func eventToDTO(e AuditEvent) AuditEventResponse {
	var detail any
	if len(e.Detail) > 0 {
		_ = json.Unmarshal(e.Detail, &detail)
	}
	r := AuditEventResponse{
		ID:        e.ID.String(),
		Category:  e.Category,
		Action:    e.Action,
		Severity:  e.Severity,
		Detail:    detail,
		CreatedAt: e.CreatedAt.UTC().Format(time.RFC3339),
	}
	if e.ActorUserID != nil {
		r.ActorUserID = e.ActorUserID.String()
	}
	if e.ActorRole != nil {
		r.ActorRole = *e.ActorRole
	}
	if e.OrgID != nil {
		r.OrgID = e.OrgID.String()
	}
	if e.TargetType != nil {
		r.TargetType = *e.TargetType
	}
	if e.TargetID != nil {
		r.TargetID = *e.TargetID
	}
	return r
}

func listLogsService(q ListAuditQuery) ([]AuditLogResponse, int64, error) {
	if q.Page < 1 {
		q.Page = 1
	}
	if q.Limit < 1 || q.Limit > 100 {
		q.Limit = 20
	}
	offset := (q.Page - 1) * q.Limit

	logs, total, err := listLogs(q.UserID, q.Resource, q.Action, offset, q.Limit)
	if err != nil {
		return nil, 0, err
	}

	result := make([]AuditLogResponse, 0, len(logs))
	for _, l := range logs {
		result = append(result, logToDTO(l))
	}
	return result, total, nil
}

// Write records an audit event. Called by other handlers after a mutating operation.
// Failures are logged but never returned — audit must not break the primary flow.
func Write(userID, action, resource, resourceID, ip string, changes any) {
	uid, err := uuid.Parse(userID)
	if err != nil {
		log.Printf("audit.Write: invalid userID %q: %v", userID, err)
		return
	}

	var changesJSON []byte
	if changes != nil {
		changesJSON, _ = json.Marshal(changes)
	}

	var ipPtr *string
	if ip != "" {
		ipPtr = &ip
	}

	if err := writeLog(&AuditLog{
		UserID:     uid,
		Action:     action,
		Resource:   resource,
		ResourceID: resourceID,
		Changes:    changesJSON,
		IPAddress:  ipPtr,
	}); err != nil {
		log.Printf("audit.Write: failed to write log: %v", err)
	}
}

func logToDTO(l AuditLog) AuditLogResponse {
	var changes any
	if len(l.Changes) > 0 {
		_ = json.Unmarshal(l.Changes, &changes)
	}
	return AuditLogResponse{
		ID:         l.ID.String(),
		UserID:     l.UserID.String(),
		Action:     l.Action,
		Resource:   l.Resource,
		ResourceID: l.ResourceID,
		Changes:    changes,
		IPAddress:  l.IPAddress,
		CreatedAt:  l.CreatedAt.UTC().Format(time.RFC3339),
	}
}
