import React from 'react';
import { StyleSheet, View } from 'react-native';

import { colors, radii } from '../theme';

/** Progress bar — apps/CLAUDE.md "Progress Bar" component pattern. */
export function ProgressBar({ percent, color = colors.brand.gold }: { percent: number; color?: string }) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <View style={styles.track}>
      <View style={[styles.fill, { width: `${clamped}%`, backgroundColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: 6, backgroundColor: colors.surface.alt, borderRadius: radii.pill, overflow: 'hidden' },
  fill: { height: 6, borderRadius: radii.pill },
});
