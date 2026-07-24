import React from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, spacing } from '../theme';

interface Props {
  children: React.ReactNode;
  style?: ViewStyle;
  // Disable when a screen manages its own ScrollView/FlatList padding.
  padded?: boolean;
  keyboardSafe?: boolean;
}

/**
 * Safe-area + keyboard-safe screen wrapper. Every screen should render
 * inside this rather than a bare `View` so notches, home indicators, and
 * on-screen keyboards are handled once, centrally.
 */
export function ScreenContainer({ children, style, padded = true, keyboardSafe = false }: Props) {
  const content = (
    <View style={[styles.base, padded && styles.padded, style]}>{children}</View>
  );

  if (!keyboardSafe) {
    return (
      <SafeAreaView style={styles.flex} edges={['top', 'bottom', 'left', 'right']}>
        {content}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.flex} edges={['top', 'bottom', 'left', 'right']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
      >
        {content}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.surface.page },
  base: { flex: 1, backgroundColor: colors.surface.page },
  padded: { padding: spacing.xl },
});
