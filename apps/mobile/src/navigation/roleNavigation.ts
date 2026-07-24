import type { UserRole } from '../types/api';
import type { RoleNavigationDefinition } from './types';

/** Persona-specific placement only; destination metadata stays in registry.ts. */
export const roleNavigation: Record<UserRole, RoleNavigationDefinition> = {
  participant: { workspace: 'participant', primaryDestinationKeys: ['home', 'journey', 'sessions', 'notifications', 'more'] },
  participant_retailer: { workspace: 'participant-retailer', primaryDestinationKeys: ['notifications', 'more'] },
  coach: { workspace: 'placeholder', primaryDestinationKeys: [] },
  faculty: { workspace: 'placeholder', primaryDestinationKeys: [] },
  program_manager: { workspace: 'placeholder', primaryDestinationKeys: [] },
  superadmin: { workspace: 'placeholder', primaryDestinationKeys: [] },
  superadmin_secondary: { workspace: 'placeholder', primaryDestinationKeys: [] },
};
