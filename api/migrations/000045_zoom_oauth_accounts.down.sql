ALTER TABLE zoom_accounts DROP COLUMN IF EXISTS connected_at;
ALTER TABLE zoom_accounts DROP COLUMN IF EXISTS status;
ALTER TABLE zoom_accounts DROP COLUMN IF EXISTS token_expires_at;
ALTER TABLE zoom_accounts DROP COLUMN IF EXISTS encrypted_refresh_token;
ALTER TABLE zoom_accounts DROP COLUMN IF EXISTS encrypted_access_token;
