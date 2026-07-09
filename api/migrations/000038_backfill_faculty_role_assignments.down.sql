-- Reverse of 000038. HISTORICAL RECORD ONLY (not run automatically).
-- Removes only the backfilled assignments that link a faculty user to the
-- faculty system role — leaves any manually-created assignments
-- (assigned_by IS NOT NULL) and any assignment to a different role untouched.

DELETE FROM role_assignments ra
USING users u,
      (SELECT id FROM custom_roles WHERE is_system = TRUE AND org_id IS NULL AND name = 'faculty' LIMIT 1) cr
WHERE ra.user_id = u.id
  AND u.role = 'faculty'
  AND ra.role_id = cr.id
  AND ra.assigned_by IS NULL;
