DROP INDEX IF EXISTS idx_user_avatars_user;
DROP TABLE IF EXISTS user_avatars;
-- avatar_url is not dropped here — it predates this migration (already
-- present on auth.User) and other code paths depend on it existing.
