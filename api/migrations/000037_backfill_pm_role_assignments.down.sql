-- Reverse of 000037. HISTORICAL RECORD ONLY (not run automatically).
-- Removes only the backfilled assignments that link a program_manager user to
-- the program_manager system role — leaves any manually-created assignments
-- (assigned_by IS NOT NULL) untouched.

DELETE FROM role_assignments ra
USING users u,
      (SELECT id FROM custom_roles WHERE is_system = TRUE AND org_id IS NULL AND name = 'program_manager' LIMIT 1) cr
WHERE ra.user_id = u.id
  AND u.role = 'program_manager'
  AND ra.role_id = cr.id
  AND ra.assigned_by IS NULL;
