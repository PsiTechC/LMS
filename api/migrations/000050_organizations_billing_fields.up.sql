-- HISTORICAL RECORD ONLY. Like every file in this directory, this .sql is NOT
-- run automatically by the app (see CLAUDE.md → Database Migrations). The
-- actual idempotent schema change lives in api/internal/organizations/init.go
-- (InitSchema, called from main.go on every boot).
--
-- Adds billing/contract fields to organizations, consumed by the superadmin
-- Billing page's Organizations table: plan_start_date/plan_end_date (a
-- subscription/contract date range — previously only a bare "plan" tier
-- string existed, with no dates at all) and billing_note (a free-text
-- renewal reminder / plan note — no such field existed anywhere on
-- organizations before this).

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS plan_start_date date;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS plan_end_date date;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS billing_note text;
