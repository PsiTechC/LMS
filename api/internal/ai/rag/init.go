package rag

import "github.com/xa-lms/api/pkg/database"

// embeddingDims must match the embedding model configured via AI_MODEL_EMBED
// (OpenAI text-embedding-3-small default = 1536 dims). Changing embedding
// models with a different dimension requires re-indexing (DROP + recreate
// the embedding column), not just a schema tweak.
const embeddingDims = 1536

// InitSchema creates the RAG document-chunk table and its vector index.
// Idempotent — safe to run against a database that already has the table.
func InitSchema() error {
	sqlDB, err := database.DB.DB()
	if err != nil {
		return err
	}
	_, err = sqlDB.Exec(`
		CREATE TABLE IF NOT EXISTS ai_doc_chunks (
		    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
		    org_id      UUID REFERENCES organizations(id) ON DELETE CASCADE,
		    program_id  UUID,
		    source_type TEXT NOT NULL,
		    source_id   UUID NOT NULL,
		    chunk_index INT NOT NULL,
		    title       TEXT NOT NULL DEFAULT '',
		    content     TEXT NOT NULL,
		    embedding   vector(1536),
		    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
		    UNIQUE (source_type, source_id, chunk_index)
		);

		CREATE INDEX IF NOT EXISTS idx_ai_doc_chunks_program ON ai_doc_chunks(program_id);
		CREATE INDEX IF NOT EXISTS idx_ai_doc_chunks_source ON ai_doc_chunks(source_type, source_id);
	`)
	if err != nil {
		return err
	}

	// ivfflat requires rows to train lists against; creating it lazily on an
	// empty table is fine (pgvector allows it, just untrained until ANALYZE).
	// Guard with IF NOT EXISTS via pg_indexes to stay idempotent since
	// "CREATE INDEX IF NOT EXISTS" is supported for vector indexes too.
	_, err = sqlDB.Exec(`
		CREATE INDEX IF NOT EXISTS idx_ai_doc_chunks_embedding
		ON ai_doc_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
	`)
	return err
}
