-- Reverse of 000036. HISTORICAL RECORD ONLY (not run automatically).

DELETE FROM custom_roles
WHERE is_system = FALSE
  AND org_id IS NULL
  AND lower(name) = 'super admin (secondary)';

DROP TABLE IF EXISTS rbac_shadow_checks;
