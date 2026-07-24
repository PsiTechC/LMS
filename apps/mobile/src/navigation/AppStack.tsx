import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { useAuth } from '../auth/AuthContext';
import { RoleLandingScreen } from '../screens/landing/RoleLandingScreen';
import { NotFoundScreen } from '../screens/NotFoundScreen';
import { ParticipantTabs } from './ParticipantTabs';
import { RetailerTabs } from './RetailerTabs';
import { roleNavigation } from './roleNavigation';
import { colors, fontFamily } from '../theme';

export type AppStackParamList = { RoleLanding: undefined; NotFound: undefined; };
const Stack = createNativeStackNavigator<AppStackParamList>();

/** Authenticated workspace selection is centralized in roleNavigation.ts. */
export function AppStack() {
  const { user } = useAuth();
  const workspace = user ? roleNavigation[user.role].workspace : 'placeholder';
  if (workspace === 'participant') return <ParticipantTabs />;
  if (workspace === 'participant-retailer') return <RetailerTabs />;
  return <Stack.Navigator screenOptions={{ headerStyle: { backgroundColor: colors.brand.navy }, headerTintColor: colors.text.inverse, headerTitleStyle: { fontFamily: fontFamily.bold, fontSize: 15 }, contentStyle: { backgroundColor: colors.surface.page } }}>
    <Stack.Screen name="RoleLanding" component={RoleLandingScreen} options={{ title: 'XA-LMS', headerBackVisible: false }} />
    <Stack.Screen name="NotFound" component={NotFoundScreen} options={{ title: 'Not Found' }} />
  </Stack.Navigator>;
}
