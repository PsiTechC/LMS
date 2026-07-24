import type { EffectivePermissions } from '../auth/AuthContext';
import type { UserRole } from '../types/api';
import { hasPermission } from '../utils/permissions';
import { destinationDefinitions } from './registry';
import { roleNavigation } from './roleNavigation';
import type { DestinationDefinition, DestinationGroup, PrimaryDestinationDefinition } from './types';

export interface ResolveDestinationOptions { role: UserRole; permissions: EffectivePermissions | null; enabledFeatures?: ReadonlySet<string>; }
function featureIsEnabled(destination: DestinationDefinition, enabledFeatures?: ReadonlySet<string>) { return destination.featureFlag === null || enabledFeatures?.has(destination.featureFlag) === true; }
function isAvailable(destination: DestinationDefinition, options: ResolveDestinationOptions) {
  return destination.implementationStatus === 'implemented' && destination.allowedRoles.includes(options.role) && featureIsEnabled(destination, options.enabledFeatures) && destination.requiredPermissions.every((permission) => hasPermission(options.permissions, permission));
}
/** Resolves only implemented, role-permitted destinations in a named group. */
export function resolveDestinations(group: DestinationGroup, options: ResolveDestinationOptions): readonly DestinationDefinition[] {
  const configuredKeys = roleNavigation[options.role].primaryDestinationKeys;
  return destinationDefinitions.filter((destination) => destination.group === group).filter((destination) => group !== 'primary' || configuredKeys.includes(destination.key)).filter((destination) => isAvailable(destination, options)).sort((a, b) => a.priority - b.priority);
}
export function resolvePrimaryDestinations(options: ResolveDestinationOptions): readonly PrimaryDestinationDefinition[] { return resolveDestinations('primary', options) as readonly PrimaryDestinationDefinition[]; }
export function resolveMoreDestinations(options: ResolveDestinationOptions): readonly DestinationDefinition[] {
  if (roleNavigation[options.role].workspace === 'placeholder') return [];
  return resolveDestinations('more', options);
}
