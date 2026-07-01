-- Add file_data bytea column if not exists, drop storage_path if exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'content_assets' AND column_name = 'file_data'
  ) THEN
    ALTER TABLE content_assets ADD COLUMN file_data BYTEA;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'content_assets' AND column_name = 'storage_path'
  ) THEN
    ALTER TABLE content_assets DROP COLUMN storage_path;
  END IF;
END $$;
