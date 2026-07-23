import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { HomeStack } from './tabs/HomeStack';
import { JourneyStack } from './tabs/JourneyStack';
import { SessionsStack } from './tabs/SessionsStack';
import { NotificationsStack } from './tabs/NotificationsStack';
import { MoreStack } from './tabs/MoreStack';
import { colors, fontFamily } from '../theme';
export type ParticipantTabsParamList={HomeTab:undefined;JourneyTab:undefined;SessionsTab:undefined;NotificationsTab:undefined;MoreTab:undefined};
const Tab=createBottomTabNavigator<ParticipantTabsParamList>();
const icons:Record<keyof ParticipantTabsParamList,React.ComponentProps<typeof Ionicons>['name']>={HomeTab:'home-outline',JourneyTab:'map-outline',SessionsTab:'videocam-outline',NotificationsTab:'notifications-outline',MoreTab:'menu-outline'};
export function ParticipantTabs(){return <Tab.Navigator screenOptions={({route})=>({headerShown:false,tabBarActiveTintColor:colors.brand.gold,tabBarInactiveTintColor:'rgba(255,255,255,0.68)',tabBarStyle:{backgroundColor:colors.brand.navy,borderTopColor:'rgba(255,255,255,0.10)',height:64,paddingBottom:7,paddingTop:7},tabBarLabelStyle:{fontFamily:fontFamily.semiBold,fontSize:10},tabBarAccessibilityLabel:route.name,tabBarIcon:({color,size,focused})=><Ionicons name={focused?icons[route.name as keyof ParticipantTabsParamList].replace('-outline','') as React.ComponentProps<typeof Ionicons>['name']:icons[route.name as keyof ParticipantTabsParamList]} size={Math.min(size,21)} color={color}/>})}><Tab.Screen name="HomeTab" component={HomeStack} options={{title:'Home'}}/><Tab.Screen name="JourneyTab" component={JourneyStack} options={{title:'Journey'}}/><Tab.Screen name="SessionsTab" component={SessionsStack} options={{title:'Sessions'}}/><Tab.Screen name="NotificationsTab" component={NotificationsStack} options={{title:'Alerts'}}/><Tab.Screen name="MoreTab" component={MoreStack} options={{title:'More'}}/></Tab.Navigator>}
