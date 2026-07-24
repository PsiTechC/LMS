import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { SessionsListScreen } from '../../screens/sessions/SessionsListScreen';
import { SessionDetailScreen } from '../../screens/sessions/SessionDetailScreen';
import type { SessionDTO } from '../../types/api';
import { colors, fontFamily } from '../../theme';

export type SessionsStackParamList = {
  SessionsList: undefined;
  SessionDetail: { session: SessionDTO };
};

const Stack = createNativeStackNavigator<SessionsStackParamList>();

export function SessionsStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.brand.navy },
        headerTintColor: colors.text.inverse,
        headerTitleStyle: { fontFamily: fontFamily.bold, fontSize: 15 },
        contentStyle: { backgroundColor: colors.surface.page },
      }}
    >
      <Stack.Screen name="SessionsList" component={SessionsListScreen} options={{ title: 'Live Sessions' }} />
      <Stack.Screen name="SessionDetail" component={SessionDetailScreen} options={{ title: 'Session' }} />
    </Stack.Navigator>
  );
}
