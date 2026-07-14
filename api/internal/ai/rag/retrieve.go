package rag

import (
	"context"

	"github.com/xa-lms/api/internal/ai/provider"
	"github.com/xa-lms/api/internal/ai/scope"
	"github.com/xa-lms/api/pkg/database"
	"gorm.io/gorm"
)

// Retrieve returns the k chunks most relevant to query, restricted to the
// caller's program (falls back to org-wide if no program is set on scope).
func Retrieve(ctx context.Context, s scope.Scope, query string, k int) ([]DocChunk, error) {
	if k <= 0 {
		k = 5
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

	q := database.DB.Model(&DocChunk{}).Where("embedding IS NOT NULL")
	if s.ProgramID != nil {
		q = q.Where("program_id = ?", *s.ProgramID)
	} else if s.OrgID != nil {
		q = q.Where("org_id = ?", *s.OrgID)
	}

	var rows []DocChunk
	err = q.
		Order(gorm.Expr("embedding <=> ?::vector", qv)).
		Limit(k).
		Find(&rows).Error
	return rows, err
}
