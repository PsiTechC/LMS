package users

import (
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"path/filepath"
	"time"

	"github.com/google/uuid"
	"github.com/xa-lms/api/pkg/database"
	"gorm.io/gorm"
)

// allowedAvatarMimeTypes mirrors organizations.allowedLogoMimeTypes - raster
// image formats a browser can render directly in an <img> tag.
var allowedAvatarMimeTypes = map[string]bool{
	"image/png":  true,
	"image/jpeg": true,
	"image/webp": true,
}

const maxAvatarSizeBytes = 2 * 1024 * 1024 // 2MB - same limit as org logos

// readAvatarBytes mirrors organizations.readLogoBytes / content.readFileBytes
// - reads the uploaded file into memory for bytea storage.
func readAvatarBytes(file *multipart.FileHeader) (data []byte, fileName, mimeType string, size int64, err error) {
	fileName = filepath.Base(file.Filename)
	mimeType = file.Header.Get("Content-Type")

	src, err := file.Open()
	if err != nil {
		return
	}
	defer src.Close()

	data, err = io.ReadAll(src)
	if err != nil {
		return
	}
	size = int64(len(data))
	return
}

// uploadAvatarService stores the uploaded avatar bytes and points
// User.AvatarURL at the new row - same pattern as
// organizations.uploadOrgLogoService.
func uploadAvatarService(userID string, file *multipart.FileHeader) (*AvatarUploadResponseDTO, error) {
	if file.Size > maxAvatarSizeBytes {
		return nil, errors.New("avatar file exceeds 2MB limit")
	}
	data, fileName, mimeType, size, err := readAvatarBytes(file)
	if err != nil {
		return nil, fmt.Errorf("file read failed: %w", err)
	}
	if !allowedAvatarMimeTypes[mimeType] {
		return nil, errors.New("avatar must be PNG, JPEG, or WEBP")
	}

	uid, err := uuid.Parse(userID)
	if err != nil {
		return nil, errors.New("invalid user id")
	}

	avatar := &UserAvatar{
		ID:        uuid.New(),
		UserID:    uid,
		FileName:  &fileName,
		MimeType:  &mimeType,
		FileSize:  &size,
		FileData:  data,
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}
	// A user has at most one avatar - clear any previous row(s) before
	// inserting the new one so re-uploading doesn't leak bytea storage
	// indefinitely.
	if err := database.DB.Where("user_id = ?", uid).Delete(&UserAvatar{}).Error; err != nil {
		return nil, err
	}
	if err := database.DB.Create(avatar).Error; err != nil {
		return nil, err
	}

	avatarURL := fmt.Sprintf("/api/v1/users/me/avatar/%s/file", avatar.ID)
	if err := updateMe(userID, map[string]any{"avatar_url": avatarURL}); err != nil {
		return nil, err
	}

	return &AvatarUploadResponseDTO{AvatarURL: avatarURL}, nil
}

// getAvatarFileService fetches the raw bytes for the serve endpoint. Scoped
// to userID so the URL alone can't be used to fetch someone else's bytes.
func getAvatarFileService(userID, avatarID string) (data []byte, fileName, mimeType string, err error) {
	var avatar UserAvatar
	err = database.DB.Where("id = ? AND user_id = ?", avatarID, userID).First(&avatar).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, "", "", gorm.ErrRecordNotFound
		}
		return nil, "", "", err
	}
	fn := ""
	if avatar.FileName != nil {
		fn = *avatar.FileName
	}
	mt := "application/octet-stream"
	if avatar.MimeType != nil {
		mt = *avatar.MimeType
	}
	return avatar.FileData, fn, mt, nil
}

// deleteAvatarService clears the user's avatar - both the AvatarURL column
// and the stored bytes. Not an error if the user simply has no avatar set.
func deleteAvatarService(userID string) error {
	if err := database.DB.Where("user_id = ?", userID).Delete(&UserAvatar{}).Error; err != nil {
		return err
	}
	return updateMe(userID, map[string]any{"avatar_url": nil})
}
