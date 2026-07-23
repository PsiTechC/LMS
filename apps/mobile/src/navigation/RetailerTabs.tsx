import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { NotificationsStack } from './tabs/NotificationsStack';
import { MoreStack } from './tabs/MoreStack';
import { colors, fontFamily } from '../theme';
export type RetailerTabsParamList={NotificationsTab:undefined;MoreTab:undefined};
const Tab=createBottomTabNavigator<RetailerTabsParamList>();
const icons:Record<keyof RetailerTabsParamList,React.ComponentProps<typeof Ionicons>['name']>={NotificationsTab:'notifications-outline',MoreTab:'menu-outline'};
export function RetailerTabs(){return <Tab.Navigator screenOptions={({route})=>({headerShown:false,tabBarActiveTintColor:colors.brand.gold,tabBarInactiveTintColor:'rgba(255,255,255,0.68)',tabBarStyle:{backgroundColor:colors.brand.navy,borderTopColor:'rgba(255,255,255,0.10)',height:64,paddingBottom:7,paddingTop:7},tabBarLabelStyle:{fontFamily:fontFamily.semiBold,fontSize:10},tabBarAccessibilityLabel:route.name,tabBarIcon:({color,size,focused})=><Ionicons name={focused?icons[route.name as keyof RetailerTabsParamList].replace('-outline','') as React.ComponentProps<typeof Ionicons>['name']:icons[route.name as keyof RetailerTabsParamList]} size={Math.min(size,21)} color={color}/>})}><Tab.Screen name="NotificationsTab" component={NotificationsStack} options={{title:'Alerts'}}/><Tab.Screen name="MoreTab" component={MoreStack} options={{title:'More'}}/></Tab.Navigator>}
