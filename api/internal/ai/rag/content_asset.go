package rag

import (
	"context"
	"encoding/json"
	"strings"

	"github.com/google/uuid"
	"github.com/xa-lms/api/internal/ai/extract"
	"github.com/xa-lms/api/internal/ai/scope"
	"github.com/xa-lms/api/pkg/database"
)

type contentAssetRow struct {
	Title     string
	AssetType string
	MimeType  string
	FileName  string
	FileData  []byte
	Meta      []byte
}

type caseStudyMeta struct {
	CaseStudy struct {
		BodyText string `json:"body_text"`
	} `json:"case_study"`
}

// TextExtractableExtensions are the file extensions extract.Text can pull
// real text from. asset_type (Quiz/eLearning/Case Study/Video/...) is a
// PM-chosen content-library category, not a file format - a PM can upload
// a .docx under "Case Study" or a .pdf under "eLearning" - so whether a
// content asset has extractable text is decided by the file itself
// (mime_type / extension), never by asset_type.
var TextExtractableExtensions = map[string]bool{
	"pdf": true, "docx": true, "pptx": true, "md": true, "txt": true,
}

func fileExtension(fileName string) string {
	i := strings.LastIndex(fileName, ".")
	if i < 0 || i == len(fileName)-1 {
		return ""
	}
	return strings.ToLower(fileName[i+1:])
}

// HasExtractableFile reports whether a content asset's uploaded file (by
// name/extension) is a format extract.Text supports - used by callers that
// need to decide feature availability without touching file bytes.
func HasExtractableFile(fileName string) bool {
	return TextExtractableExtensions[fileExtension(fileName)]
}

// ExtractContentAssetText pulls the indexable text out of a content_assets
// row: a typed-in case_study body_text from meta (if present, regardless of
// file), otherwise the uploaded file's text via extract.Text, dispatched by
// the file's own mime_type/extension - never by asset_type, since asset_type
// is a content-library category (Quiz, eLearning, Case Study, ...), not a
// file format. Returns ok=false when there's no extractable text (e.g. a
// video file, an unsupported format, or extraction failure) - callers
// should treat that as "this asset can't be used for text-based
// generation," not a hard error.
func ExtractContentAssetText(assetID uuid.UUID) (title, text string, ok bool, err error) {
	var row contentAssetRow
	err = database.DB.Raw(`
		SELECT title, asset_type::text AS asset_type,
		       COALESCE(mime_type, '') AS mime_type, COALESCE(file_name, '') AS file_name,
		       file_data, COALESCE(meta::text, '{}')::jsonb::text AS meta
		FROM content_assets WHERE id = ?
	`, assetID).Scan(&row).Error
	if err != nil || row.Title == "" {
		return "", "", false, err
	}
	title = row.Title

	// A typed-in case study body always wins if present, regardless of
	// whether a file is also attached.
	if len(row.Meta) > 0 {
		var m caseStudyMeta
		_ = json.Unmarshal([]byte(row.Meta), &m)
		if body := strings.TrimSpace(m.CaseStudy.BodyText); body != "" {
			return title, body, true, nil
		}
	}

	if len(row.FileData) == 0 || !HasExtractableFile(row.FileName) {
		return title, "", false, nil
	}
	extracted, extractErr := extract.Text(row.FileData, row.MimeType)
	if extractErr != nil {
		return title, "", false, nil // extraction failure - treat as no text, not a hard error
	}
	extracted = strings.TrimSpace(extracted)
	return title, extracted, extracted != "", nil
}

// EnsureContentAssetIndexed indexes a content asset's text on first use if
// it hasn't been indexed yet. Returns ok=false when the asset has no
// extractable text (caller should not offer text-generation features for it).
func EnsureContentAssetIndexed(ctx context.Context, s scope.Scope, assetID uuid.UUID) (ok bool, err error) {
	if HasChunks("content_asset", assetID) {
		return true, nil
	}
	title, text, hasText, err := ExtractContentAssetText(assetID)
	if err != nil {
		return false, err
	}
	if !hasText {
		return false, nil
	}
	if err := Index(ctx, s, "content_asset", assetID, title, text); err != nil {
		return false, err
	}
	return true, nil
}
