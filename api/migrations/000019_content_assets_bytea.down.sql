ALTER TABLE content_assets DROP COLUMN IF EXISTS file_data;
ALTER TABLE content_assets ADD COLUMN IF NOT EXISTS storage_path TEXT;
