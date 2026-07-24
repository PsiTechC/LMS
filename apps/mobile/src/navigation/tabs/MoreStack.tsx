import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { MoreMenuScreen } from '../../screens/more/MoreMenuScreen';
import { ProfileStack } from './ProfileStack';
import { colors, fontFamily } from '../../theme';

export type MoreStackParamList = {
  MoreMenu: undefined;
  // Nested navigator, not a real screen — ProfileStack owns its own header
  // (headerShown:false below) and its own Profile/EditProfile/ChangePassword
  // routes, unchanged from the previous ProfileTab. Nesting it here (instead
  // of flattening its screens into this stack) means the existing, working
  // ProfileStack/ProfileScreen/EditProfileScreen/ChangePasswordScreen code
  // needs zero changes to be reachable from More.
  ProfileStack: undefined;
};

const Stack = createNativeStackNavigator<MoreStackParamList>();

/**
 * More tab: permission-filtered secondary destinations (Assessments today —
 * see MoreMenuScreen) plus Profile, which moved here from its own bottom tab
 * to make room for Notifications within the 5-tab limit. Still fully
 * reachable, just one level deeper.
 */
export function MoreStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.brand.navy },
        headerTintColor: colors.text.inverse,
        headerTitleStyle: { fontFamily: fontFamily.bold, fontSize: 15 },
        contentStyle: { backgroundColor: colors.surface.page },
      }}
    >
      <Stack.Screen name="MoreMenu" component={MoreMenuScreen} options={{ title: 'More' }} />
      <Stack.Screen name="ProfileStack" component={ProfileStack} options={{ headerShown: false }} />
    </Stack.Navigator>
  );
}
