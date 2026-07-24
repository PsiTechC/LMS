import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useAuth } from '../../auth/AuthContext';
import { SecondaryButton, ScreenContainer } from '../../components';
import { ROLE_LABELS } from '../../navigation/roleLabels';
import { colors, fontFamily, radii, spacing } from '../../theme';

/**
 * TEMPORARY role landing screen — placeholder entry point per role, not a
 * feature dashboard. Web parity reference: apps/web/app/dashboard/page.tsx
 * routes each role to its own dashboard (coach / faculty / participant /
 * program-manager / superadmin); those dashboards are out of scope for this
 * foundation slice and are the recommended next mobile feature build-out.
 */
export function RoleLandingScreen() {
  const { user, logout } = useAuth();

  if (!user) return null;

  const roleLabel = ROLE_LABELS[user.role] ?? user.role;
  const accent = colors.persona[user.role] ?? colors.brand.gold;

  return (
    <ScreenContainer>
      <View style={styles.content}>
        <View style={[styles.badge, { backgroundColor: `${accent}1A`, borderColor: accent }]}>
          <Text style={[styles.badgeText, { color: accent }]}>{roleLabel}</Text>
        </View>
        <Text style={styles.greeting}>Welcome, {user.name}</Text>
        <Text style={styles.email}>{user.email}</Text>
        <Text style={styles.note}>
          This is a temporary role landing screen. The {roleLabel.toLowerCase()} mobile workspace has not been
          built yet — see the mobile roadmap gap noted in the implementation report.
        </Text>
        <SecondaryButton label="Log Out" onPress={() => void logout()} style={styles.logout} />
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  badge: {
    borderWidth: 1,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    marginBottom: spacing.md,
  },
  badgeText: { fontFamily: fontFamily.bold, fontSize: 10, letterSpacing: 0.5, textTransform: 'uppercase' },
  greeting: { fontFamily: fontFamily.bold, fontSize: 17, color: colors.text.primary },
  email: { fontFamily: fontFamily.medium, fontSize: 13, color: colors.text.secondary, marginBottom: spacing.md },
  note: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    color: colors.text.secondary,
    textAlign: 'center',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.xl,
  },
  logout: { minWidth: 160 },
});
