import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { LoginScreen } from '../screens/auth/LoginScreen';
import { NotFoundScreen } from '../screens/NotFoundScreen';
import { colors } from '../theme';

export type AuthStackParamList = {
  Login: undefined;
  NotFound: undefined;
};

const Stack = createNativeStackNavigator<AuthStackParamList>();

/** Unauthenticated area. Login is the only real screen today. */
export function AuthStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.surface.page },
      }}
    >
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="NotFound" component={NotFoundScreen} />
    </Stack.Navigator>
  );
}
