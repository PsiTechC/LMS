import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { NavigatorScreenParams } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { HomeStack } from './tabs/HomeStack';
import { JourneyStack } from './tabs/JourneyStack';
import type { JourneyStackParamList } from './tabs/JourneyStack';
import { SessionsStack } from './tabs/SessionsStack';
import { NotificationsStack } from './tabs/NotificationsStack';
import { MoreStack } from './tabs/MoreStack';
import { colors, fontFamily } from '../theme';
import { useAuth } from '../auth/AuthContext';
import { resolvePrimaryDestinations } from './resolveDestinations';
import type { PrimaryTabRouteName } from './types';

export type ParticipantTabsParamList = { HomeTab: undefined; JourneyTab: NavigatorScreenParams<JourneyStackParamList> | undefined; SessionsTab: undefined; NotificationsTab: undefined; MoreTab: undefined; };
const Tab = createBottomTabNavigator<ParticipantTabsParamList>();
const screens: Record<PrimaryTabRouteName, React.ComponentType<any>> = { HomeTab: HomeStack, JourneyTab: JourneyStack, SessionsTab: SessionsStack, NotificationsTab: NotificationsStack, MoreTab: MoreStack };
export function ParticipantTabs() {
  const { permissions } = useAuth();
  const destinations = resolvePrimaryDestinations({ role: 'participant', permissions });
  return <Tab.Navigator screenOptions={({ route }) => { const destination = destinations.find((item) => item.routeName === route.name); return { headerShown: false, tabBarActiveTintColor: colors.brand.gold, tabBarInactiveTintColor: 'rgba(255,255,255,0.68)', tabBarStyle: { backgroundColor: colors.brand.navy, borderTopColor: 'rgba(255,255,255,0.10)', height: 64, paddingBottom: 7, paddingTop: 7 }, tabBarLabelStyle: { fontFamily: fontFamily.semiBold, fontSize: 10 }, tabBarAccessibilityLabel: destination?.label ?? route.name, tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? (destination?.activeIcon ?? destination?.icon ?? 'ellipse') : (destination?.icon ?? 'ellipse-outline')} size={Math.min(size, 21)} color={color} /> }; }}>
    {destinations.map((destination) => <Tab.Screen key={destination.key} name={destination.routeName} component={screens[destination.routeName]} options={{ title: destination.label }} />)}
  </Tab.Navigator>;
}
