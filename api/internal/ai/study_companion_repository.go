package ai

import (
	"errors"

	"github.com/xa-lms/api/pkg/database"
)

var ErrActivityNotAccessible = errors.New("activity not found or not accessible")

type activityAssetRow struct {
	AssetID       string
	ActivityType  string
	AssetFileName string
	Title         string
	ProgramID     string
}

// resolveActivityAssetForParticipant returns the content asset backing an
// activity, but ONLY if the caller is actively enrolled in the program that
// activity belongs to — this is the access boundary that stops a
// participant from generating study material for content outside their own
// program. Activities with no asset_id at all (assessment/survey/live_session/
// coaching/journal/assignment/peer_review) resolve with an empty AssetID,
// which the caller treats as "unavailable." AssetFileName lets the caller
// decide extractability by the file's own format (see
// rag.HasExtractableFile) rather than by asset_type, which is a
// content-library category, not a file format.
func resolveActivityAssetForParticipant(userID, activityID string) (*activityAssetRow, error) {
	var row activityAssetRow
	err := database.DB.Raw(`
		SELECT COALESCE(a.config_json->>'asset_id', '') AS asset_id,
		       a.type::text AS activity_type, a.title,
		       COALESCE(ca.file_name, '') AS asset_file_name,
		       ph.program_id::text AS program_id
		FROM activities a
		JOIN program_phases ph ON ph.id = a.phase_id
		JOIN enrollments e ON e.cohort_id IN (
			SELECT id FROM cohorts WHERE program_id = ph.program_id
		)
		LEFT JOIN content_assets ca ON ca.id = NULLIF(a.config_json->>'asset_id', '')::uuid
		WHERE a.id = ?::uuid AND e.user_id = ?::uuid AND e.status <> 'withdrawn'
		LIMIT 1
	`, activityID, userID).Scan(&row).Error
	if err != nil {
		return nil, err
	}
	if row.Title == "" {
		return nil, ErrActivityNotAccessible
	}
	return &row, nil
}
