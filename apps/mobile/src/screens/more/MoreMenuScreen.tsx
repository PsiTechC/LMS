import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { useAuth } from '../../auth/AuthContext';
import { Card, SecondaryButton } from '../../components';
import { hasPermission } from '../../utils/permissions';
import { ROLE_LABELS } from '../../navigation/roleLabels';
import { colors, fontFamily, spacing } from '../../theme';
import type { MoreStackParamList } from '../../navigation/tabs/MoreStack';

type Props = NativeStackScreenProps<MoreStackParamList, 'MoreMenu'>;

interface MenuEntry {
  key: string;
  icon: string;
  label: string;
  meta: string;
  onPress: () => void;
}

/**
 * Permission-aware secondary-destination menu — the mobile equivalent of the
 * web sidebar's non-primary tabs (apps/web/components/layout/nav-config.ts),
 * filtered by this account's real GET /me/permissions grants
 * (src/utils/permissions.ts hasPermission), not by a guessed role shape.
 *
 * Only entries with an actual built mobile screen are listed — everything
 * else (My Cohorts, Certificates, Leaderboard, Surveys, Feedback, 360°
 * Feedback, Coaching, Discussions, Capstone) has no mobile screen yet and is
 * deliberately omitted rather than shown as a dead end (see final report's
 * parity matrix for that list).
 */
export function MoreMenuScreen({ navigation }: Props) {
  const { user, permissions, logout } = useAuth();
  if (!user) return null;

  const entries: MenuEntry[] = [];

  // Assessments (quiz-taking) — reuses the existing JourneyStack screens via
  // cross-tab navigation rather than duplicating them here. Gated on the
  // REAL backend permission the /assessments routes enforce
  // (api/internal/assessments/handler.go — assessments:read), not on
  // nav-config.ts's `submissions:read`, which is what participant_retailer
  // actually holds despite never being able to reach the quiz routes — see
  // CLAUDE.md's documented nav-config/rbac mismatch. This is what keeps a
  // Retailer from getting an Assessments entry here.
  if (hasPermission(permissions, 'assessments:read')) {
    entries.push({
      key: 'assessments',
      icon: '✦',
      label: 'Assessments',
      meta: 'Quizzes and knowledge checks',
      // Cross-tab navigation out of a nested stack — React Navigation
      // bubbles an unrecognized route name up to the parent tab navigator
      // at runtime; `any` sidesteps MoreStackParamList's narrower static
      // type (which correctly has no knowledge of sibling tabs).
      onPress: () => (navigation as any).navigate('JourneyTab', { screen: 'AssessmentsList' }),
    });
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Card style={styles.identityCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {user.name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.name} numberOfLines={1}>{user.name}</Text>
          <Text style={styles.role}>{ROLE_LABELS[user.role] ?? user.role}</Text>
        </View>
      </Card>

      <Pressable onPress={() => navigation.navigate('ProfileStack')} style={styles.row}>
        <Text style={styles.rowIcon}>◎</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.rowLabel}>My Profile</Text>
          <Text style={styles.rowMeta}>Edit details, change password</Text>
        </View>
        <Text style={styles.chevron}>›</Text>
      </Pressable>

      {entries.map((e) => (
        <Pressable key={e.key} onPress={e.onPress} style={styles.row}>
          <Text style={styles.rowIcon}>{e.icon}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowLabel}>{e.label}</Text>
            <Text style={styles.rowMeta}>{e.meta}</Text>
          </View>
          <Text style={styles.chevron}>›</Text>
        </Pressable>
      ))}

      <SecondaryButton label="Log Out" onPress={() => void logout()} style={styles.logout} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface.page },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  identityCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.sm },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.brand.gold, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: fontFamily.extraBold, fontSize: 16, color: colors.text.inverse },
  name: { fontFamily: fontFamily.bold, fontSize: 14, color: colors.text.primary },
  role: { fontFamily: fontFamily.medium, fontSize: 11, color: colors.text.secondary, marginTop: 2 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface.card,
    borderWidth: 1,
    borderColor: colors.surface.border,
    borderRadius: 12,
    padding: spacing.lg,
    minHeight: 44,
  },
  rowIcon: { fontSize: 18, color: colors.brand.gold, width: 22, textAlign: 'center' },
  rowLabel: { fontFamily: fontFamily.bold, fontSize: 13, color: colors.text.primary },
  rowMeta: { fontFamily: fontFamily.medium, fontSize: 11, color: colors.text.secondary, marginTop: 2 },
  chevron: { fontSize: 20, color: colors.text.secondary },
  logout: { marginTop: spacing.lg },
});
