package content

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/lib/pq"
	"github.com/xa-lms/api/pkg/database"
	"gorm.io/gorm"
)

// assetRow is used for list/get queries — excludes file_data (large blob).
type assetRow struct {
	ID          uuid.UUID
	OrgID       uuid.UUID
	CreatedBy   uuid.UUID
	CreatorName string
	Title       string
	Description *string
	AssetType   string
	Status      string
	FileName    *string
	FileSize    *int64
	MimeType    *string
	HasFile     bool // true when file_data IS NOT NULL
	Meta        []byte
	UsedInCount int
	Tags        pq.StringArray
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

func listAssets(orgID uuid.UUID, assetType, status, search string) ([]assetRow, error) {
	query := database.DB.Table("content_assets ca").
		Select(`ca.id, ca.org_id, ca.created_by,
			u.name AS creator_name,
			ca.title, ca.description, ca.asset_type, ca.status,
			ca.file_name, ca.file_size, ca.mime_type,
			(ca.file_data IS NOT NULL AND length(ca.file_data) > 0) AS has_file,
			ca.meta, ca.used_in_count, ca.tags, ca.created_at, ca.updated_at`).
		Joins("LEFT JOIN users u ON u.id = ca.created_by").
		Where("ca.org_id = ?", orgID).
		Where("ca.status != 'archived'")

	if assetType != "" && assetType != "all" {
		query = query.Where("ca.asset_type = ?", assetType)
	}
	if status != "" {
		query = query.Where("ca.status = ?", status)
	}
	if search != "" {
		query = query.Where("ca.title ILIKE ?", "%"+search+"%")
	}

	rows, err := query.Order("ca.created_at DESC").Rows()
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []assetRow
	for rows.Next() {
		var r assetRow
		if err := rows.Scan(
			&r.ID, &r.OrgID, &r.CreatedBy, &r.CreatorName,
			&r.Title, &r.Description, &r.AssetType, &r.Status,
			&r.FileName, &r.FileSize, &r.MimeType, &r.HasFile,
			&r.Meta, &r.UsedInCount, &r.Tags, &r.CreatedAt, &r.UpdatedAt,
		); err != nil {
			return nil, err
		}
		results = append(results, r)
	}
	return results, nil
}

func getAsset(id, orgID uuid.UUID) (*assetRow, error) {
	rows, err := database.DB.Table("content_assets ca").
		Select(`ca.id, ca.org_id, ca.created_by,
			u.name AS creator_name,
			ca.title, ca.description, ca.asset_type, ca.status,
			ca.file_name, ca.file_size, ca.mime_type,
			(ca.file_data IS NOT NULL AND length(ca.file_data) > 0) AS has_file,
			ca.meta, ca.used_in_count, ca.tags, ca.created_at, ca.updated_at`).
		Joins("LEFT JOIN users u ON u.id = ca.created_by").
		Where("ca.id = ? AND ca.org_id = ?", id, orgID).
		Rows()
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	if !rows.Next() {
		return nil, gorm.ErrRecordNotFound
	}
	var r assetRow
	if err := rows.Scan(
		&r.ID, &r.OrgID, &r.CreatedBy, &r.CreatorName,
		&r.Title, &r.Description, &r.AssetType, &r.Status,
		&r.FileName, &r.FileSize, &r.MimeType, &r.HasFile,
		&r.Meta, &r.UsedInCount, &r.Tags, &r.CreatedAt, &r.UpdatedAt,
	); err != nil {
		return nil, err
	}
	return &r, nil
}

// getAssetWithFile fetches the full row including file_data bytes.
func getAssetWithFile(id, orgID uuid.UUID) (*ContentAsset, error) {
	sqlDB, err := database.DB.DB()
	if err != nil {
		return nil, err
	}
	row := sqlDB.QueryRow(`
		SELECT id, org_id, created_by, title, description, asset_type, status,
		       file_name, file_size, mime_type, file_data, meta, used_in_count, tags, created_at, updated_at
		FROM content_assets WHERE id = $1 AND org_id = $2`, id, orgID)
	var a ContentAsset
	var fileData []byte // scan into local var — NULL bytea scans as nil []byte
	if err := row.Scan(
		&a.ID, &a.OrgID, &a.CreatedBy, &a.Title, &a.Description, &a.AssetType, &a.Status,
		&a.FileName, &a.FileSize, &a.MimeType, &fileData, &a.Meta, &a.UsedInCount,
		pq.Array(&a.Tags), &a.CreatedAt, &a.UpdatedAt,
	); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, gorm.ErrRecordNotFound
		}
		return nil, err
	}
	a.FileData = fileData
	return &a, nil
}

func getAssetForFile(id, orgID uuid.UUID) (*ContentAsset, error) {
	sqlDB, err := database.DB.DB()
	if err != nil {
		return nil, err
	}
	row := sqlDB.QueryRow(`
		SELECT id, org_id, created_by, title, description, asset_type, status,
		       file_name, file_size, mime_type, meta, used_in_count, tags, created_at, updated_at
		FROM content_assets WHERE id = $1 AND org_id = $2`, id, orgID)
	var a ContentAsset
	if err := row.Scan(
		&a.ID, &a.OrgID, &a.CreatedBy, &a.Title, &a.Description, &a.AssetType, &a.Status,
		&a.FileName, &a.FileSize, &a.MimeType, &a.Meta, &a.UsedInCount,
		pq.Array(&a.Tags), &a.CreatedAt, &a.UpdatedAt,
	); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, gorm.ErrRecordNotFound
		}
		return nil, err
	}
	return &a, nil
}

func createAsset(a *ContentAsset) error {
	sqlDB, err := database.DB.DB()
	if err != nil {
		return err
	}
	_, err = sqlDB.Exec(`
		INSERT INTO content_assets
			(id, org_id, created_by, title, description, asset_type, status,
			 file_name, file_size, mime_type, file_data,
			 meta, used_in_count, tags, created_at, updated_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
		a.ID, a.OrgID, a.CreatedBy, a.Title, a.Description, a.AssetType, a.Status,
		a.FileName, a.FileSize, a.MimeType, a.FileData,
		a.Meta, a.UsedInCount, pq.Array(a.Tags), a.CreatedAt, a.UpdatedAt,
	)
	return err
}

func updateAsset(id, orgID uuid.UUID, fields map[string]interface{}) error {
	// Build SET clause dynamically, handling tags specially via pq.Array
	setClauses := []string{}
	args := []interface{}{}
	i := 1
	for k, v := range fields {
		if k == "tags" {
			// v is already a "{...}" literal string — pass as-is
			setClauses = append(setClauses, fmt.Sprintf("%s = $%d", k, i))
			args = append(args, v)
		} else {
			setClauses = append(setClauses, fmt.Sprintf("%s = $%d", k, i))
			args = append(args, v)
		}
		i++
	}
	if len(setClauses) == 0 {
		return nil
	}
	args = append(args, id, orgID)
	query := fmt.Sprintf(
		"UPDATE content_assets SET %s WHERE id = $%d AND org_id = $%d",
		strings.Join(setClauses, ", "), i, i+1,
	)
	sqlDB, err := database.DB.DB()
	if err != nil {
		return err
	}
	_, err = sqlDB.Exec(query, args...)
	return err
}

func archiveAsset(id, orgID uuid.UUID) error {
	return database.DB.
		Model(&ContentAsset{}).
		Where("id = ? AND org_id = ?", id, orgID).
		Update("status", "archived").Error
}

func getLibraryStats(orgID uuid.UUID) (LibraryStatsDTO, error) {
	type row struct {
		Total     int
		Active    int
		Draft     int
		TypeCount int
	}
	var r row
	err := database.DB.Raw(`
		SELECT
			COUNT(*) FILTER (WHERE status != 'archived')                   AS total,
			COUNT(*) FILTER (WHERE status = 'active')                      AS active,
			COUNT(*) FILTER (WHERE status = 'draft')                       AS draft,
			COUNT(DISTINCT asset_type) FILTER (WHERE status != 'archived') AS type_count
		FROM content_assets
		WHERE org_id = ?
	`, orgID).Scan(&r).Error
	return LibraryStatsDTO{
		TotalAssets:  r.Total,
		ActiveAssets: r.Active,
		DraftAssets:  r.Draft,
		TypeCount:    r.TypeCount,
	}, err
}

func getAssetPrograms(assetIDs []uuid.UUID) (map[uuid.UUID][]programLink, error) {
	if len(assetIDs) == 0 {
		return map[uuid.UUID][]programLink{}, nil
	}
	type row struct {
		AssetID   uuid.UUID
		ProgramID uuid.UUID
		Title     string
	}
	var rows []row
	err := database.DB.Raw(`
		SELECT cap.asset_id, p.id AS program_id, p.title
		FROM content_asset_programs cap
		JOIN programs p ON p.id = cap.program_id
		WHERE cap.asset_id IN ?
	`, assetIDs).Scan(&rows).Error
	if err != nil {
		return nil, err
	}
	result := make(map[uuid.UUID][]programLink)
	for _, r := range rows {
		result[r.AssetID] = append(result[r.AssetID], programLink{ID: r.ProgramID.String(), Title: r.Title})
	}
	return result, nil
}

type programLink struct {
	ID    string
	Title string
}

func buildMetaJSON(req CreateAssetRequest) ([]byte, error) {
	m := map[string]interface{}{}
	if req.QuestionCount != nil {
		m["question_count"] = *req.QuestionCount
	}
	if req.DurationMins != nil {
		m["duration_mins"] = *req.DurationMins
	}
	if req.ScormEntry != nil {
		m["scorm_entry"] = *req.ScormEntry
	}
	if req.VideoURL != nil {
		m["video_url"] = *req.VideoURL
	}
	return json.Marshal(m)
}

func updateMetaJSON(existing []byte, req UpdateAssetRequest) ([]byte, error) {
	m := map[string]interface{}{}
	if len(existing) > 0 {
		_ = json.Unmarshal(existing, &m)
	}
	if req.QuestionCount != nil {
		m["question_count"] = *req.QuestionCount
	}
	if req.DurationMins != nil {
		m["duration_mins"] = *req.DurationMins
	}
	if req.ScormEntry != nil {
		m["scorm_entry"] = *req.ScormEntry
	}
	if req.VideoURL != nil {
		m["video_url"] = *req.VideoURL
	}
	return json.Marshal(m)
}

func metaToDTO(raw []byte) (qc *int, dm *int, se *string, vu *string) {
	if len(raw) == 0 {
		return
	}
	var m map[string]interface{}
	if err := json.Unmarshal(raw, &m); err != nil {
		return
	}
	if v, ok := m["question_count"].(float64); ok {
		i := int(v)
		qc = &i
	}
	if v, ok := m["duration_mins"].(float64); ok {
		i := int(v)
		dm = &i
	}
	if v, ok := m["scorm_entry"].(string); ok {
		se = &v
	}
	if v, ok := m["video_url"].(string); ok {
		vu = &v
	}
	return
}

func tagsToLiteral(tags []string) string {
	if len(tags) == 0 {
		return "{}"
	}
	quoted := make([]string, len(tags))
	for i, t := range tags {
		quoted[i] = fmt.Sprintf(`"%s"`, strings.ReplaceAll(t, `"`, `\"`))
	}
	return "{" + strings.Join(quoted, ",") + "}"
}
