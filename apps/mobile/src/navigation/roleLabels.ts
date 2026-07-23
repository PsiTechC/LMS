import type { UserRole } from '../types/api';

/**
 * Display label per role, mirroring the persona names used across the web
 * app (apps/web/app/dashboard/page.tsx ROLE_ROUTES + apps/CLAUDE.md persona
 * table). Used only for the temporary landing screen title — not a
 * permissions source.
 */
export const ROLE_LABELS: Record<UserRole, string> = {
  superadmin: 'Super Admin',
  superadmin_secondary: 'Super Admin',
  program_manager: 'Program Manager',
  faculty: 'Faculty',
  coach: 'Coach',
  participant: 'Participant',
  participant_retailer: 'Participant',
};
