import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, fontFamily, radii } from '../theme';

/** Pill badge — apps/CLAUDE.md "Badge / Pill" component pattern. */
export function Badge({ label, color = colors.brand.gold }: { label: string; color?: string }) {
  return (
    <View style={[styles.pill, { backgroundColor: `${color}1F` }]}>
      <Text style={[styles.label, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    borderRadius: radii.pill,
    paddingHorizontal: 9,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  label: { fontSize: 10, fontFamily: fontFamily.bold },
});
