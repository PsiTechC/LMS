package zoom

import (
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/xa-lms/api/pkg/database"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

var ErrNotFound = errors.New("not found")
var ErrForbidden = errors.New("forbidden")

func getZoomAccountByUserID(userID string) (*ZoomAccount, error) {
	var a ZoomAccount
	if err := database.DB.Where("user_id = ?", userID).First(&a).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &a, nil
}

// upsertZoomOAuthAccount stores/refreshes the OAuth-connected account for
// userID (one row per user, matching the existing uniqueIndex on user_id).
func upsertZoomOAuthAccount(userID, zoomUserID string, zoomEmail *string, encAccessToken, encRefreshToken string, expiresAt time.Time) error {
	uid, err := uuid.Parse(userID)
	if err != nil {
		return err
	}
	now := time.Now()
	a := ZoomAccount{
		UserID:                uid,
		ZoomUserID:            zoomUserID,
		ZoomEmail:             zoomEmail,
		EncryptedAccessToken:  &encAccessToken,
		EncryptedRefreshToken: &encRefreshToken,
		TokenExpiresAt:        &expiresAt,
		Status:                ZoomAccountStatusActive,
		ConnectedAt:           &now,
	}
	return database.DB.Clauses(clause.OnConflict{
		Columns: []clause.Column{{Name: "user_id"}},
		DoUpdates: clause.AssignmentColumns([]string{
			"zoom_user_id", "zoom_email", "encrypted_access_token", "encrypted_refresh_token",
			"token_expires_at", "status", "connected_at", "updated_at",
		}),
	}).Create(&a).Error
}

// updateZoomAccountTokens persists a refreshed access/refresh token pair for
// an already-connected account, without touching zoom_user_id/zoom_email.
func updateZoomAccountTokens(userID, encAccessToken, encRefreshToken string, expiresAt time.Time) error {
	res := database.DB.Model(&ZoomAccount{}).Where("user_id = ?", userID).Updates(map[string]any{
		"encrypted_access_token":  encAccessToken,
		"encrypted_refresh_token": encRefreshToken,
		"token_expires_at":        expiresAt,
		"status":                  ZoomAccountStatusActive,
	})
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return ErrNotFound
	}
	return nil
}

// setZoomAccountStatus updates only the status column (e.g. marking a refresh
// failure as "expired", or a disconnect as "disconnected").
func setZoomAccountStatus(userID, status string) error {
	res := database.DB.Model(&ZoomAccount{}).Where("user_id = ?", userID).Update("status", status)
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return ErrNotFound
	}
	return nil
}

// disconnectZoomAccount clears stored tokens and marks the account disconnected.
func disconnectZoomAccount(userID string) error {
	res := database.DB.Model(&ZoomAccount{}).Where("user_id = ?", userID).Updates(map[string]any{
		"encrypted_access_token":  nil,
		"encrypted_refresh_token": nil,
		"token_expires_at":        nil,
		"status":                  ZoomAccountStatusDisconnected,
	})
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return ErrNotFound
	}
	return nil
}

// sessionZoomRow is the subset of class_sessions needed by the zoom module,
// read/written via raw SQL so this module never imports the sessions package
// (modules never import each other's packages - CLAUDE.md).
type sessionZoomRow struct {
	ID              string
	FacultyID       string
	Title           string
	ScheduledAt     time.Time
	DurationMins    int
	ZoomMeetingID   *string
	ZoomJoinURL     *string
	ZoomStartURL    *string
	ZoomPassword    *string
	ZoomMeetingUUID *string
	ZoomPasscode    *string
	ZoomHostUserID  *string
	ZoomProvider    *string
	MeetingType     string
}

func getSessionZoomRow(sessionID string) (*sessionZoomRow, error) {
	var row sessionZoomRow
	err := database.DB.Raw(`
		SELECT id::text AS id, faculty_id::text AS faculty_id, title, scheduled_at, duration_mins,
		       zoom_meeting_id, zoom_join_url, zoom_start_url, zoom_password,
		       zoom_meeting_uuid, zoom_passcode, zoom_host_user_id, zoom_provider, meeting_type
		FROM class_sessions WHERE id = ?::uuid
	`, sessionID).Scan(&row).Error
	if err != nil {
		return nil, err
	}
	if row.ID == "" {
		return nil, ErrNotFound
	}
	return &row, nil
}

func saveSessionZoomMeeting(sessionID, meetingID, joinURL, startURL, password, meetingUUID, hostUserID string) error {
	res := database.DB.Exec(`
		UPDATE class_sessions
		SET zoom_meeting_id = ?, zoom_join_url = ?, zoom_start_url = ?, zoom_password = ?,
		    zoom_meeting_uuid = ?, zoom_passcode = ?, zoom_host_user_id = ?, zoom_provider = 'zoom'
		WHERE id = ?::uuid
	`, meetingID, joinURL, startURL, password, meetingUUID, password, hostUserID, sessionID)
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return ErrNotFound
	}
	return nil
}

// updateSessionStatusByMeetingID is used by webhook handlers, which only know
// the Zoom meeting id, not the session id.
func updateSessionStatusByMeetingID(zoomMeetingID string, fields map[string]any) error {
	res := database.DB.Table("class_sessions").Where("zoom_meeting_id = ?", zoomMeetingID).Updates(fields)
	return res.Error
}
