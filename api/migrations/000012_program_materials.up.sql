CREATE TABLE program_materials (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    program_id   UUID        NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
    uploaded_by  UUID        NOT NULL REFERENCES users(id),
    title        TEXT        NOT NULL,
    type         TEXT        NOT NULL CHECK (type IN ('pdf','ppt','video','link','scorm','article')),
    url          TEXT        NOT NULL,
    size_bytes   BIGINT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_program_materials_program ON program_materials(program_id);
CREATE INDEX idx_program_materials_uploader ON program_materials(uploaded_by);