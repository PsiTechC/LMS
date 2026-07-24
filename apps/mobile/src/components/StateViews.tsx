import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { PrimaryButton } from './Button';
import { colors, fontFamily, spacing } from '../theme';

/** Blocks the whole screen — app launch / session restore / initial fetch. */
export function FullScreenLoading({ label }: { label?: string }) {
  return (
    <View style={styles.fullScreen}>
      <ActivityIndicator size="large" color={colors.brand.gold} />
      {!!label && <Text style={styles.loadingLabel}>{label}</Text>}
    </View>
  );
}

/** Small inline spinner for in-place refresh/submit states. */
export function InlineLoading({ label }: { label?: string }) {
  return (
    <View style={styles.inline}>
      <ActivityIndicator size="small" color={colors.brand.gold} />
      {!!label && <Text style={styles.inlineLabel}>{label}</Text>}
    </View>
  );
}

interface MessageStateProps {
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ title, message, actionLabel, onAction }: MessageStateProps) {
  return (
    <View style={styles.center}>
      <Text style={styles.title}>{title}</Text>
      {!!message && <Text style={styles.message}>{message}</Text>}
      {!!actionLabel && !!onAction && (
        <PrimaryButton label={actionLabel} onPress={onAction} style={styles.action} />
      )}
    </View>
  );
}

export function ErrorState({ title = 'Something went wrong', message, actionLabel = 'Retry', onAction }: MessageStateProps) {
  return (
    <View style={styles.center}>
      <Text style={[styles.title, styles.errorTitle]}>{title}</Text>
      {!!message && <Text style={styles.message}>{message}</Text>}
      {!!onAction && <PrimaryButton label={actionLabel} onPress={onAction} style={styles.action} />}
    </View>
  );
}

export function OfflineState({ onRetry }: { onRetry?: () => void }) {
  return (
    <ErrorState
      title="You're offline"
      message="Check your internet connection and try again."
      actionLabel="Try again"
      onAction={onRetry}
    />
  );
}

const styles = StyleSheet.create({
  fullScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface.page,
    gap: spacing.md,
  },
  loadingLabel: { fontFamily: fontFamily.medium, fontSize: 13, color: colors.text.secondary },
  inline: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md },
  inlineLabel: { fontFamily: fontFamily.medium, fontSize: 12, color: colors.text.secondary },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.sm,
  },
  title: { fontFamily: fontFamily.bold, fontSize: 15, color: colors.text.primary, textAlign: 'center' },
  errorTitle: { color: colors.status.danger },
  message: { fontFamily: fontFamily.regular, fontSize: 13, color: colors.text.secondary, textAlign: 'center' },
  action: { marginTop: spacing.md, minWidth: 160 },
});
