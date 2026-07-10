-- Explicit, single-source-of-truth flag for "is this account the org's
-- Primary PM". Nullable, defaults FALSE — safe for all existing rows.
ALTER TABLE role_assignments ADD COLUMN IF NOT EXISTS is_primary_pm BOOLEAN DEFAULT FALSE;

-- One-time backfill (matches the UI's existing loose Primary/Secondary
-- definition): PM-tier (base_role program_manager, whether via the bare
-- persona or a custom role built on it) AND not specifically the shared
-- "Secondary PM" role. Guarded so it never re-runs once any row is Primary.
DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM role_assignments WHERE is_primary_pm = TRUE) THEN
		UPDATE role_assignments ra
		SET is_primary_pm = TRUE
		WHERE (
			ra.base_role = 'program_manager'
			OR EXISTS (
				SELECT 1 FROM custom_roles cr
				WHERE cr.id = ra.role_id AND cr.base_role = 'program_manager'
			)
		)
		AND NOT EXISTS (
			SELECT 1 FROM custom_roles cr2
			WHERE cr2.id = ra.role_id AND cr2.name = 'Secondary PM'
		);
	END IF;
END $$;
