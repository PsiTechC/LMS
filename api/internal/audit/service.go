package audit

import (
	"encoding/json"
	"log"

	"github.com/google/uuid"
)

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
		CreatedAt:  l.CreatedAt.Format("2006-01-02T15:04:05Z"),
	}
}
