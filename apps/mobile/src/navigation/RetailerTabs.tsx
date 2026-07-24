import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { NotificationsStack } from './tabs/NotificationsStack';
import { MoreStack } from './tabs/MoreStack';
import { colors, fontFamily } from '../theme';
import { useAuth } from '../auth/AuthContext';
import { resolvePrimaryDestinations } from './resolveDestinations';

export type RetailerTabsParamList = { NotificationsTab: undefined; MoreTab: undefined; };
const Tab = createBottomTabNavigator<RetailerTabsParamList>();
const screens = { NotificationsTab: NotificationsStack, MoreTab: MoreStack };
export function RetailerTabs() {
  const { permissions } = useAuth();
  const destinations = resolvePrimaryDestinations({ role: 'participant_retailer', permissions });
  return <Tab.Navigator screenOptions={({ route }) => { const destination = destinations.find((item) => item.routeName === route.name); return { headerShown: false, tabBarActiveTintColor: colors.brand.gold, tabBarInactiveTintColor: 'rgba(255,255,255,0.68)', tabBarStyle: { backgroundColor: colors.brand.navy, borderTopColor: 'rgba(255,255,255,0.10)', height: 64, paddingBottom: 7, paddingTop: 7 }, tabBarLabelStyle: { fontFamily: fontFamily.semiBold, fontSize: 10 }, tabBarAccessibilityLabel: destination?.label ?? route.name, tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? (destination?.activeIcon ?? destination?.icon ?? 'ellipse') : (destination?.icon ?? 'ellipse-outline')} size={Math.min(size, 21)} color={color} /> }; }}>
    {destinations.map((destination) => <Tab.Screen key={destination.key} name={destination.routeName as keyof RetailerTabsParamList} component={screens[destination.routeName as keyof typeof screens]} options={{ title: destination.label }} />)}
  </Tab.Navigator>;
}
