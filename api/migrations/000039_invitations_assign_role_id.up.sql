-- Additive: carry an optional custom role on an invitation, applied to the user
-- on accept (used by the "Participant Retail" enroll variant). Nullable, no
-- default → safe on existing rows. HISTORICAL RECORD ONLY (not auto-run; applied
-- idempotently by invitations.fixSchema() on startup — see CLAUDE.md).
ALTER TABLE invitations ADD COLUMN IF NOT EXISTS assign_role_id UUID;
