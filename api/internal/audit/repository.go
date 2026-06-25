package audit

import "github.com/xa-lms/api/pkg/database"

func listLogs(userID, resource, action string, offset, limit int) ([]AuditLog, int64, error) {
	db := database.DB.Model(&AuditLog{})
	if userID != "" {
		db = db.Where("user_id = ?", userID)
	}
	if resource != "" {
		db = db.Where("resource = ?", resource)
	}
	if action != "" {
		db = db.Where("action = ?", action)
	}
	var total int64
	db.Count(&total)
	var logs []AuditLog
	err := db.Order("created_at desc").Offset(offset).Limit(limit).Find(&logs).Error
	return logs, total, err
}

func writeLog(entry *AuditLog) error {
	return database.DB.Create(entry).Error
}
