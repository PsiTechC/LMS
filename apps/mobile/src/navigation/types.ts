import type { Ionicons } from '@expo/vector-icons';

import type { UserRole } from '../types/api';

export type DestinationKey =
  | 'home' | 'journey' | 'sessions' | 'notifications' | 'more' | 'profile' | 'assessments'
  | 'activity-detail' | 'session-detail' | 'assessment-intro' | 'assessment-attempt' | 'assessment-result';
export type DestinationGroup = 'primary' | 'more' | 'contextual';
export type DestinationImplementationStatus = 'implemented' | 'planned';
export type BadgeSource = 'unread-notifications' | null;
export type PrimaryTabRouteName = 'HomeTab' | 'JourneyTab' | 'SessionsTab' | 'NotificationsTab' | 'MoreTab';
export type DestinationRouteName = PrimaryTabRouteName | 'ProfileStack' | 'AssessmentsList' | 'ActivityDetail' | 'SessionDetail' | 'AssessmentIntro' | 'AssessmentAttempt' | 'AssessmentResult';
export type DestinationIconName = React.ComponentProps<typeof Ionicons>['name'];

export interface DestinationDefinition {
  key: DestinationKey;
  routeName: DestinationRouteName;
  label: string;
  icon: DestinationIconName;
  activeIcon?: DestinationIconName;
  priority: number;
  group: DestinationGroup;
  allowedRoles: readonly UserRole[];
  requiredPermissions: readonly string[];
  featureFlag: string | null;
  badgeSource: BadgeSource;
  implementationStatus: DestinationImplementationStatus;
}

export type PrimaryDestinationDefinition = DestinationDefinition & { group: 'primary'; routeName: PrimaryTabRouteName };
export interface RoleNavigationDefinition { workspace: 'participant' | 'participant-retailer' | 'placeholder'; primaryDestinationKeys: readonly DestinationKey[]; }
