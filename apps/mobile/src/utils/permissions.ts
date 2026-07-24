import type { EffectivePermissions } from '../auth/AuthContext';

/**
 * Fail-open permission check — mirrors apps/web/components/layout/Sidebar.tsx
 * `isLocked`'s semantics exactly: `perms === null` (not loaded yet, or the
 * GET /me/permissions fetch failed) never hides/locks a destination, and
 * `full === true` (bootstrap superadmin) always passes. Otherwise the caller
 * must hold the exact "resource:action" key.
 */
export function hasPermission(perms: EffectivePermissions | null, key: string): boolean {
  if (!perms) return true;
  if (perms.full) return true;
  return perms.keys.has(key);
}
