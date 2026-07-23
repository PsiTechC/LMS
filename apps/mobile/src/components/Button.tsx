import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, ViewStyle } from 'react-native';

import { colors, fontFamily, radii, spacing } from '../theme';

interface ButtonProps {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  testID?: string;
}

/** Primary (gold CTA) — apps/CLAUDE.md "Buttons" table. One per screen. */
export function PrimaryButton({ label, onPress, loading, disabled, style, testID }: ButtonProps) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: !!loading }}
      onPress={onPress}
      disabled={isDisabled}
      testID={testID}
      style={({ pressed }) => [
        styles.base,
        styles.primary,
        isDisabled && styles.primaryDisabled,
        pressed && !isDisabled && styles.pressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={colors.text.inverse} />
      ) : (
        <Text style={[styles.label, styles.primaryLabel]}>{label}</Text>
      )}
    </Pressable>
  );
}

/** Secondary (ghost) — apps/CLAUDE.md "Buttons" table. */
export function SecondaryButton({ label, onPress, loading, disabled, style, testID }: ButtonProps) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: !!loading }}
      onPress={onPress}
      disabled={isDisabled}
      testID={testID}
      style={({ pressed }) => [
        styles.base,
        styles.secondary,
        pressed && !isDisabled && styles.secondaryPressed,
        isDisabled && styles.secondaryDisabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={colors.brand.navy} />
      ) : (
        <Text style={[styles.label, styles.secondaryLabel]}>{label}</Text>
      )}
    </Pressable>
  );
}

const MIN_TOUCH_TARGET = 44;

const styles = StyleSheet.create({
  base: {
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: radii.buttonFull,
    paddingVertical: 12,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: { backgroundColor: colors.brand.gold },
  primaryDisabled: { backgroundColor: colors.status.inactive },
  secondary: {
    backgroundColor: colors.surface.card,
    borderWidth: 1,
    borderColor: colors.surface.border,
  },
  secondaryPressed: { backgroundColor: colors.surface.alt },
  secondaryDisabled: { opacity: 0.5 },
  pressed: { opacity: 0.85 },
  label: { fontFamily: fontFamily.bold, fontSize: 13 },
  primaryLabel: { color: colors.text.inverse },
  secondaryLabel: { color: colors.text.primary },
});
