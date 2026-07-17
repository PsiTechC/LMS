DROP INDEX IF EXISTS idx_organization_logos_org;
DROP TABLE IF EXISTS organization_logos;
ALTER TABLE organizations DROP COLUMN IF EXISTS logo_url;
