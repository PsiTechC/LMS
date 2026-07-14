package rag

import (
	"context"

	"github.com/google/uuid"
	"github.com/xa-lms/api/internal/ai/provider"
	"github.com/xa-lms/api/internal/ai/scope"
	"github.com/xa-lms/api/pkg/database"
	"gorm.io/gorm"
)

// HasChunks reports whether a source document has already been indexed.
func HasChunks(sourceType string, sourceID uuid.UUID) bool {
	var count int64
	database.DB.Model(&DocChunk{}).
		Where("source_type = ? AND source_id = ?", sourceType, sourceID).
		Count(&count)
	return count > 0
}

// RetrieveBySource returns the k chunks most relevant to query, restricted
// to one specific source document (e.g. one content_assets row) rather than
// the caller's whole program — used when a feature needs "this module's
// content only," not "anything the participant's program has."
func RetrieveBySource(ctx context.Context, s scope.Scope, sourceType string, sourceID uuid.UUID, query string, k int) ([]DocChunk, error) {
	if k <= 0 {
		k = 8
	}

	cfg := provider.Resolve(s, provider.TierEmbed)
	vectors, err := provider.Embed(ctx, cfg, []string{query})
	if err != nil {
		return nil, err
	}
	if len(vectors) == 0 || len(vectors[0]) == 0 {
		return nil, nil
	}
	qv := vectorLiteral(vectors[0])

	var rows []DocChunk
	err = database.DB.Model(&DocChunk{}).
		Where("source_type = ? AND source_id = ? AND embedding IS NOT NULL", sourceType, sourceID).
		Order(gorm.Expr("embedding <=> ?::vector", qv)).
		Limit(k).
		Find(&rows).Error
	return rows, err
}

// AllChunksForSource returns every chunk for a source document, in chunk
// order — used when the caller wants the full indexed text rather than a
// similarity-ranked subset (e.g. generating questions from an entire short
// document instead of just the parts matching a query).
func AllChunksForSource(sourceType string, sourceID uuid.UUID) ([]DocChunk, error) {
	var rows []DocChunk
	err := database.DB.Where("source_type = ? AND source_id = ?", sourceType, sourceID).
		Order("chunk_index ASC").
		Find(&rows).Error
	return rows, err
}
