package rag

import (
	"context"
	"strconv"
	"strings"

	"github.com/google/uuid"
	"github.com/xa-lms/api/internal/ai/provider"
	"github.com/xa-lms/api/internal/ai/scope"
	"github.com/xa-lms/api/pkg/database"
	"gorm.io/gorm"
)

const (
	chunkSize    = 1500 // characters per chunk, roughly ~350-400 tokens
	chunkOverlap = 200
)

// Index chunks text, embeds each chunk, and upserts them into ai_doc_chunks
// for a given source document (e.g. a content_assets row). Safe to call
// again for the same source - it replaces the previous chunks.
func Index(ctx context.Context, s scope.Scope, sourceType string, sourceID uuid.UUID, title, text string) error {
	text = strings.TrimSpace(text)
	if text == "" {
		return deleteChunks(sourceType, sourceID)
	}

	chunks := splitIntoChunks(text, chunkSize, chunkOverlap)
	if len(chunks) == 0 {
		return deleteChunks(sourceType, sourceID)
	}

	cfg := provider.Resolve(s, provider.TierEmbed)
	vectors, err := provider.Embed(ctx, cfg, chunks)
	if err != nil {
		return err
	}

	return database.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Exec(`DELETE FROM ai_doc_chunks WHERE source_type = ? AND source_id = ?`, sourceType, sourceID).Error; err != nil {
			return err
		}
		for i, chunk := range chunks {
			var orgID any
			if s.OrgID != nil {
				orgID = *s.OrgID
			}
			var programID any
			if s.ProgramID != nil {
				programID = *s.ProgramID
			}
			err := tx.Exec(`
				INSERT INTO ai_doc_chunks (org_id, program_id, source_type, source_id, chunk_index, title, content, embedding)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?::vector)
			`, orgID, programID, sourceType, sourceID, i, title, chunk, vectorLiteral(vectors[i])).Error
			if err != nil {
				return err
			}
		}
		return nil
	})
}

func splitIntoChunks(text string, size, overlap int) []string {
	runes := []rune(text)
	if len(runes) <= size {
		return []string{text}
	}
	var chunks []string
	for start := 0; start < len(runes); {
		end := start + size
		if end > len(runes) {
			end = len(runes)
		}
		chunks = append(chunks, string(runes[start:end]))
		if end == len(runes) {
			break
		}
		start = end - overlap
		if start < 0 {
			start = 0
		}
	}
	return chunks
}

// vectorLiteral formats a float32 slice as a pgvector text literal, e.g.
// "[0.1,0.2,0.3]". Values come only from the embedding API response, never
// from user input; the literal is still passed as a bound parameter (cast
// with ::vector), never concatenated into the SQL string.
func vectorLiteral(v []float32) string {
	parts := make([]string, len(v))
	for i, f := range v {
		parts[i] = strconv.FormatFloat(float64(f), 'f', -1, 32)
	}
	return "[" + strings.Join(parts, ",") + "]"
}

func deleteChunks(sourceType string, sourceID uuid.UUID) error {
	return database.DB.Exec(`DELETE FROM ai_doc_chunks WHERE source_type = ? AND source_id = ?`, sourceType, sourceID).Error
}
