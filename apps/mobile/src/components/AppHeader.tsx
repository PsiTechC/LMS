import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, fontFamily, spacing } from '../theme';

type Props = { title: string; subtitle?: string; onBack?: () => void; rightAction?: React.ReactNode; notificationCount?: number };

export function AppHeader({ title, subtitle, onBack, rightAction, notificationCount }: Props) {
  return <SafeAreaView edges={['top']} style={styles.safe}><View style={styles.row}>
    {onBack ? <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel="Go back" hitSlop={8} style={styles.back}><Ionicons name="chevron-back" size={23} color={colors.brand.navy} /></Pressable> : null}
    <View style={styles.titleArea}><Text numberOfLines={1} style={styles.title}>{title}</Text>{subtitle ? <Text numberOfLines={1} style={styles.subtitle}>{subtitle}</Text> : null}</View>
    {notificationCount ? <View accessibilityLabel={`${notificationCount} unread notifications`} style={styles.indicator}><Text style={styles.indicatorText}>{notificationCount > 9 ? '9+' : notificationCount}</Text></View> : null}
    {rightAction ? <View style={styles.action}>{rightAction}</View> : null}
  </View></SafeAreaView>;
}
const styles = StyleSheet.create({ safe:{ backgroundColor:colors.surface.card, borderBottomWidth:1, borderBottomColor:colors.surface.border }, row:{ minHeight:60, flexDirection:'row', alignItems:'center', paddingHorizontal:spacing.lg, gap:spacing.sm }, back:{ width:44,height:44,alignItems:'center',justifyContent:'center', marginLeft:-10 }, titleArea:{ flex:1,minWidth:0 }, title:{ fontFamily:fontFamily.bold,fontSize:17,color:colors.text.primary }, subtitle:{ fontFamily:fontFamily.medium,fontSize:11,color:colors.text.secondary,marginTop:1 }, action:{ minWidth:44, alignItems:'flex-end' }, indicator:{ minWidth:18,height:18,borderRadius:9,backgroundColor:colors.brand.gold,alignItems:'center',justifyContent:'center' }, indicatorText:{ fontFamily:fontFamily.bold,fontSize:9,color:colors.text.inverse } });
