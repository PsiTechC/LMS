import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { useAuth } from '../auth/AuthContext';
import { RoleLandingScreen } from '../screens/landing/RoleLandingScreen';
import { NotFoundScreen } from '../screens/NotFoundScreen';
import { ParticipantTabs } from './ParticipantTabs';
import { RetailerTabs } from './RetailerTabs';
import { colors, fontFamily } from '../theme';

export type AppStackParamList = {
  RoleLanding: undefined;
  NotFound: undefined;
};

const Stack = createNativeStackNavigator<AppStackParamList>();

/**
 * Authenticated area. `participant` gets the full bottom-tab workspace
 * (ParticipantTabs — Home / My Journey / Sessions / Notifications / More).
 * `participant_retailer` gets a deliberately sparser workspace (RetailerTabs
 * — Notifications / More only) reflecting their real, narrower permission
 * grant (see RetailerTabs' own doc comment for why Assessments/360°/Coaching
 * aren't there yet). Every other role still falls through to the temporary
 * `RoleLanding` placeholder — no mobile screens exist for those personas
 * yet. This keeps role isolation: neither variant can reach the other's or
 * another role's screens.
 */
export function AppStack() {
  const { user } = useAuth();

  if (user?.role === 'participant') {
    return <ParticipantTabs />;
  }

  if (user?.role === 'participant_retailer') {
    return <RetailerTabs />;
  }

  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.brand.navy },
        headerTintColor: colors.text.inverse,
        headerTitleStyle: { fontFamily: fontFamily.bold, fontSize: 15 },
        contentStyle: { backgroundColor: colors.surface.page },
      }}
    >
      <Stack.Screen name="RoleLanding" component={RoleLandingScreen} options={{ title: 'XA-LMS', headerBackVisible: false }} />
      <Stack.Screen name="NotFound" component={NotFoundScreen} options={{ title: 'Not Found' }} />
    </Stack.Navigator>
  );
}
