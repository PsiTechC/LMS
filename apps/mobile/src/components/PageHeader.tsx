import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, fontFamily, spacing } from '../theme';
export function PageHeader({ title, subtitle, context, action }: { title:string; subtitle?:string; context?:React.ReactNode; action?:React.ReactNode }) { return <View style={styles.row}><View style={styles.copy}><Text style={styles.title}>{title}</Text>{subtitle ? <Text style={styles.subtitle}>{subtitle}</Text>:null}{context}</View>{action ? <View style={styles.action}>{action}</View>:null}</View>; }
const styles=StyleSheet.create({row:{flexDirection:'row',alignItems:'flex-start',justifyContent:'space-between',gap:spacing.md},copy:{flex:1,minWidth:0},title:{fontFamily:fontFamily.extraBold,fontSize:21,color:colors.text.primary},subtitle:{fontFamily:fontFamily.medium,fontSize:12,color:colors.text.secondary,marginTop:3},action:{flexShrink:0}});
