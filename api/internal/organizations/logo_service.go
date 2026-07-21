package organizations

import (
	"encoding/json"
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

// allowedLogoMimeTypes restricts uploads to raster/vector image formats a
// browser can render directly in an <img> tag.
var allowedLogoMimeTypes = map[string]bool{
	"image/png":     true,
	"image/jpeg":    true,
	"image/svg+xml": true,
	"image/webp":    true,
}

const maxLogoSizeBytes = 2 * 1024 * 1024 // 2MB

// readLogoBytes mirrors content.readFileBytes - reads the uploaded file into
// memory for bytea storage, same convention as content_assets.
func readLogoBytes(file *multipart.FileHeader) (data []byte, fileName, mimeType string, size int64, err error) {
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

// uploadOrgLogoService stores the uploaded logo bytes, points
// Organization.LogoURL at the new row, and keeps the JSONB brand_kit.logo_url
// mirror in sync (brandKitFromOrg is the one read path everything else uses).
func uploadOrgLogoService(orgID string, file *multipart.FileHeader) (*LogoUploadResponseDTO, error) {
	if file.Size > maxLogoSizeBytes {
		return nil, errors.New("logo file exceeds 2MB limit")
	}
	data, fileName, mimeType, size, err := readLogoBytes(file)
	if err != nil {
		return nil, fmt.Errorf("file read failed: %w", err)
	}
	if !allowedLogoMimeTypes[mimeType] {
		return nil, errors.New("logo must be PNG, JPEG, SVG, or WEBP")
	}

	org, err := getOrgByID(orgID)
	if err != nil {
		return nil, err
	}

	logo := &OrganizationLogo{
		ID:        uuid.New(),
		OrgID:     org.ID,
		FileName:  &fileName,
		MimeType:  &mimeType,
		FileSize:  &size,
		FileData:  data,
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}
	// An org has at most one logo - clear any previous row(s) before inserting
	// the new one so re-uploading doesn't leak bytea storage indefinitely.
	if err := database.DB.Where("org_id = ?", org.ID).Delete(&OrganizationLogo{}).Error; err != nil {
		return nil, err
	}
	if err := database.DB.Create(logo).Error; err != nil {
		return nil, err
	}

	logoURL := fmt.Sprintf("/api/v1/organizations/%s/logo/%s/file", orgID, logo.ID)
	if err := updateOrg(orgID, map[string]any{"logo_url": logoURL}); err != nil {
		return nil, err
	}
	if err := syncBrandKitLogoURL(orgID, logoURL); err != nil {
		return nil, err
	}

	return &LogoUploadResponseDTO{LogoURL: logoURL}, nil
}

// getOrgLogoFileService fetches the raw bytes for the serve endpoint.
func getOrgLogoFileService(orgID, logoID string) (data []byte, fileName, mimeType string, err error) {
	var logo OrganizationLogo
	err = database.DB.Where("id = ? AND org_id = ?", logoID, orgID).First(&logo).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, "", "", gorm.ErrRecordNotFound
		}
		return nil, "", "", err
	}
	fn := ""
	if logo.FileName != nil {
		fn = *logo.FileName
	}
	mt := "application/octet-stream"
	if logo.MimeType != nil {
		mt = *logo.MimeType
	}
	return logo.FileData, fn, mt, nil
}

// deleteOrgLogoService clears the org's logo - both the LogoURL column and
// the JSONB mirror - and removes the stored bytes. Not an error if the org
// simply has no logo set.
func deleteOrgLogoService(orgID string) error {
	if err := database.DB.Where("org_id = ?", orgID).Delete(&OrganizationLogo{}).Error; err != nil {
		return err
	}
	if err := updateOrg(orgID, map[string]any{"logo_url": nil}); err != nil {
		return err
	}
	return syncBrandKitLogoURL(orgID, "")
}

// syncBrandKitLogoURL keeps the JSONB brand_kit.logo_url mirror consistent
// with Organization.LogoURL (the canonical source), using the same
// read-merge-write pattern as updateBrandKitService.
func syncBrandKitLogoURL(orgID, logoURL string) error {
	org, err := getOrgByID(orgID)
	if err != nil {
		return err
	}
	brand := brandKitFromOrg(*org)
	brand.LogoURL = logoURL
	settings := map[string]any{}
	if len(org.Settings) > 0 {
		_ = json.Unmarshal(org.Settings, &settings)
	}
	settings["brand_kit"] = brand
	settingsJSON, err := json.Marshal(settings)
	if err != nil {
		return err
	}
	return updateOrgSettings(orgID, settingsJSON)
}
