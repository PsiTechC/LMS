package content

import (
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"path/filepath"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/xa-lms/api/internal/shared"
	"gorm.io/gorm"
)

var (
	ErrAssetForbidden = errors.New("asset access forbidden")
	ErrAssetInUse     = errors.New("asset is in use")
)

// readFileBytes reads the uploaded file into memory for DB storage.
func readFileBytes(file *multipart.FileHeader) (data []byte, fileName, mimeType string, size int64, err error) {
	fileName = filepath.Base(file.Filename)
	ext := strings.ToLower(filepath.Ext(fileName))
	mimeType = file.Header.Get("Content-Type")
	if mimeType == "" {
		mimeType = extToMime(ext)
	}

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

func listAssetsService(orgID *uuid.UUID, assetType, status, search string, page, limit int) ([]AssetDTO, LibraryStatsDTO, int64, error) {
	offset := (page - 1) * limit
	rows, total, err := listAssets(orgID, assetType, status, search, offset, limit)
	if err != nil {
		return nil, LibraryStatsDTO{}, 0, err
	}

	ids := make([]uuid.UUID, len(rows))
	for i, r := range rows {
		ids[i] = r.ID
	}
	progMap, err := getAssetPrograms(ids)
	if err != nil {
		return nil, LibraryStatsDTO{}, 0, err
	}

	dtos := make([]AssetDTO, 0, len(rows))
	for _, r := range rows {
		dtos = append(dtos, rowToDTO(r, progMap[r.ID]))
	}

	stats, err := getLibraryStats(orgID)
	return dtos, stats, total, err
}

func getAssetService(id, orgID uuid.UUID) (*AssetDTO, error) {
	row, err := getAsset(id, orgID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, gorm.ErrRecordNotFound
		}
		return nil, err
	}
	progMap, _ := getAssetPrograms([]uuid.UUID{id})
	dto := rowToDTO(*row, progMap[id])
	return &dto, nil
}

func createAssetService(orgID, userID uuid.UUID, req CreateAssetRequest, file *multipart.FileHeader) (*AssetDTO, error) {
	meta, err := buildMetaJSON(req)
	if err != nil {
		return nil, err
	}

	if req.Tags == nil {
		req.Tags = []string{}
	}

	desc := req.Description
	a := &ContentAsset{
		ID:          uuid.New(),
		OrgID:       orgID,
		CreatedBy:   userID,
		Title:       req.Title,
		Description: &desc,
		AssetType:   req.AssetType,
		Status:      "active",
		Meta:        meta,
		Tags:        req.Tags,
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
	}

	if file != nil {
		data, fn, mime, size, err := readFileBytes(file)
		if err != nil {
			return nil, fmt.Errorf("file read failed: %w", err)
		}
		a.FileData = data
		a.FileName = &fn
		a.MimeType = &mime
		a.FileSize = &size
	}

	if err := createAsset(a); err != nil {
		return nil, err
	}

	row, err := getAsset(a.ID, orgID)
	if err != nil {
		return nil, err
	}
	dto := rowToDTO(*row, nil)
	return &dto, nil
}

func updateAssetService(id, orgID uuid.UUID, req UpdateAssetRequest, file *multipart.FileHeader) (*AssetDTO, error) {
	existing, err := getAssetForFile(id, orgID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, gorm.ErrRecordNotFound
		}
		return nil, err
	}

	newMeta, err := updateMetaJSON(existing.Meta, req)
	if err != nil {
		return nil, err
	}

	fields := map[string]interface{}{
		"meta":       newMeta,
		"updated_at": time.Now(),
	}
	if req.Title != nil {
		fields["title"] = *req.Title
	}
	if req.Description != nil {
		fields["description"] = *req.Description
	}
	if req.Status != nil {
		fields["status"] = *req.Status
	}
	if req.Tags != nil {
		fields["tags"] = tagsToLiteral(req.Tags)
	}

	if file != nil {
		data, fn, mime, size, err := readFileBytes(file)
		if err != nil {
			return nil, fmt.Errorf("file read failed: %w", err)
		}
		fields["file_data"] = data
		fields["file_name"] = fn
		fields["mime_type"] = mime
		fields["file_size"] = size
	}

	if err := updateAsset(id, orgID, fields); err != nil {
		return nil, err
	}

	row, err := getAsset(id, orgID)
	if err != nil {
		return nil, err
	}
	progMap, _ := getAssetPrograms([]uuid.UUID{id})
	dto := rowToDTO(*row, progMap[id])
	return &dto, nil
}

func archiveAssetService(id, orgID uuid.UUID) error {
	_, err := getAssetForFile(id, orgID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return gorm.ErrRecordNotFound
		}
		return err
	}
	return archiveAsset(id, orgID)
}

func deleteAssetService(id, orgID uuid.UUID, callerID, callerRole string) error {
	existing, err := getAssetForFile(id, orgID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return gorm.ErrRecordNotFound
		}
		return err
	}
	if callerRole == shared.RoleFaculty && existing.CreatedBy.String() != callerID {
		return ErrAssetForbidden
	}
	usageCount, err := assetUsageCount(id)
	if err != nil {
		return err
	}
	if existing.UsedInCount > 0 || usageCount > 0 {
		return ErrAssetInUse
	}
	return deleteAsset(id, orgID)
}

// serveAssetFile returns the file bytes and metadata from DB for streaming.
func serveAssetFile(id, orgID uuid.UUID) (data []byte, fileName, mimeType string, modtime time.Time, err error) {
	a, err := getAssetWithFile(id, orgID)
	if err != nil {
		return nil, "", "", time.Time{}, err
	}
	if len(a.FileData) == 0 {
		return nil, "", "", time.Time{}, fmt.Errorf("%w: no file stored for this asset", gorm.ErrRecordNotFound)
	}
	fn := ""
	if a.FileName != nil {
		fn = *a.FileName
	}
	mt := "application/octet-stream"
	if a.MimeType != nil {
		mt = *a.MimeType
	}
	return a.FileData, fn, mt, a.UpdatedAt, nil
}

func rowToDTO(r assetRow, links []programLink) AssetDTO {
	desc := ""
	if r.Description != nil {
		desc = *r.Description
	}
	fn := ""
	if r.FileName != nil {
		fn = *r.FileName
	}
	mt := ""
	if r.MimeType != nil {
		mt = *r.MimeType
	}
	hasFile := r.HasFile
	fileURL := ""
	if hasFile {
		fileURL = "/api/v1/content/assets/" + r.ID.String() + "/file"
	}

	tags := []string(r.Tags)
	if tags == nil {
		tags = []string{}
	}

	var pIDs, pTitles []string
	for _, l := range links {
		pIDs = append(pIDs, l.ID)
		pTitles = append(pTitles, l.Title)
	}
	if pIDs == nil {
		pIDs = []string{}
		pTitles = []string{}
	}

	qc, dm, se, vu, qs, cert, cs, defTL, defAtt, defPass, compThresh := metaToDTO(r.Meta)

	return AssetDTO{
		ID:                     r.ID.String(),
		OrgID:                  r.OrgID.String(),
		CreatedBy:              r.CreatedBy.String(),
		CreatorName:            r.CreatorName,
		Title:                  r.Title,
		Description:            desc,
		AssetType:              r.AssetType,
		Status:                 r.Status,
		HasFile:                hasFile,
		FileName:               fn,
		FileSizeBytes:          r.FileSize,
		MimeType:               mt,
		FileURL:                fileURL,
		Tags:                   tags,
		UsedInCount:            r.UsedInCount,
		ProgramIDs:             pIDs,
		ProgramTitles:          pTitles,
		QuestionCount:          qc,
		DurationMins:           dm,
		ScormEntry:             se,
		VideoURL:               vu,
		QuestionSet:            qs,
		Certificate:            cert,
		CaseStudy:              cs,
		DefaultTimeLimitMins:   defTL,
		DefaultAttemptsAllowed: defAtt,
		DefaultPassingScorePct: defPass,
		CompletionThresholdPct: compThresh,
		CreatedAt:              r.CreatedAt,
		UpdatedAt:              r.UpdatedAt,
	}
}

func extToMime(ext string) string {
	m := map[string]string{
		".mp4":  "video/mp4",
		".mov":  "video/quicktime",
		".avi":  "video/x-msvideo",
		".pdf":  "application/pdf",
		".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
		".ppt":  "application/vnd.ms-powerpoint",
		".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
		".doc":  "application/msword",
		".zip":  "application/zip",
		".mp3":  "audio/mpeg",
		".png":  "image/png",
		".jpg":  "image/jpeg",
		".jpeg": "image/jpeg",
		".gif":  "image/gif",
		".svg":  "image/svg+xml",
	}
	if v, ok := m[ext]; ok {
		return v
	}
	return "application/octet-stream"
}
