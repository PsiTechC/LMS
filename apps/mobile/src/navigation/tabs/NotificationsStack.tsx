import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { NotificationsListScreen } from '../../screens/notifications/NotificationsListScreen';
import { colors, fontFamily } from '../../theme';

export type NotificationsStackParamList = {
  NotificationsList: undefined;
};

const Stack = createNativeStackNavigator<NotificationsStackParamList>();

export function NotificationsStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.brand.navy },
        headerTintColor: colors.text.inverse,
        headerTitleStyle: { fontFamily: fontFamily.bold, fontSize: 15 },
        contentStyle: { backgroundColor: colors.surface.page },
      }}
    >
      <Stack.Screen name="NotificationsList" component={NotificationsListScreen} options={{ title: 'Notifications' }} />
    </Stack.Navigator>
  );
}
