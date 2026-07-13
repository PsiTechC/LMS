UPDATE custom_roles
SET permissions = (
    SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
    FROM jsonb_array_elements(permissions) AS t(elem)
    WHERE elem NOT IN ('"zoom:manage"'::jsonb, '"zoom:join"'::jsonb)
), updated_at = NOW()
WHERE is_system = TRUE AND org_id IS NULL AND name IN ('faculty', 'coach');
