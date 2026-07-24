import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Badge, Card, PrimaryButton, ScreenContainer } from '../../components';
import { colors, fontFamily, spacing } from '../../theme';
import type { JourneyStackParamList } from '../../navigation/tabs/JourneyStack';

type Props = NativeStackScreenProps<JourneyStackParamList, 'AssessmentIntro'>;

/**
 * Instructions/eligibility screen — reads only the AssessmentCardDTO the
 * list screen already fetched (no network call here). Deliberately does NOT
 * call assessmentsApi.detail() until the participant taps "Start" — detail()
 * is what anchors a timed assessment's server-side countdown
 * (getOrCreateAttemptSession), so hitting it merely to preview instructions
 * would silently start the clock before the participant is ready.
 */
export function AssessmentIntroScreen({ route, navigation }: Props) {
  const { card } = route.params;
  const attemptsLeft = card.attempts_allowed - card.attempts_used;
  const noAttemptsLeft = attemptsLeft <= 0;
  const canStart = !card.locked && card.status !== 'upcoming' && !noAttemptsLeft;

  return (
    <ScreenContainer padded={false}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{card.title}</Text>

        <View style={styles.badgeRow}>
          {card.locked && <Badge label="Locked" color={colors.text.secondary} />}
          {card.status === 'upcoming' && !card.locked && <Badge label="Not yet available" color={colors.status.warning} />}
          {card.pending_review && <Badge label="Awaiting faculty review" color={colors.brand.slate} />}
          {!card.pending_review && card.best_score_pct != null && (
            <Badge
              label={`Best score ${Math.round(card.best_score_pct)}% ${card.passed ? '· Passed' : '· Not passed'}`}
              color={card.passed ? colors.status.success : colors.status.warning}
            />
          )}
        </View>

        {card.locked && !!card.locked_reason && (
          <View style={styles.banner}>
            <Text style={styles.bannerText}>🔒 {card.locked_reason}</Text>
          </View>
        )}

        <Card style={{ marginTop: spacing.lg }}>
          <InfoRow label="Questions" value={String(card.question_count)} />
          <InfoRow label="Time limit" value={card.time_limit_mins > 0 ? `${card.time_limit_mins} minutes` : 'Untimed'} />
          <InfoRow label="Attempts allowed" value={String(card.attempts_allowed)} />
          <InfoRow label="Attempts used" value={String(card.attempts_used)} />
          <InfoRow label="Passing score" value={card.passing_score_pct > 0 ? `${card.passing_score_pct}%` : 'Not set'} />
          {!!card.due_date && <InfoRow label="Due date" value={card.due_date} last />}
        </Card>

        {card.time_limit_mins > 0 && (
          <Text style={styles.note}>
            This assessment is timed. Once you start, the countdown runs server-side and continues even if you leave
            or refresh — reopening resumes the same clock, it does not restart it.
          </Text>
        )}

        {noAttemptsLeft && !card.locked && (
          <Text style={styles.note}>You have used all {card.attempts_allowed} allowed attempt{card.attempts_allowed === 1 ? '' : 's'} for this assessment.</Text>
        )}

        <View style={{ marginTop: spacing.xl }}>
          <PrimaryButton
            label={canStart ? 'Start Assessment' : noAttemptsLeft ? 'Attempts Used' : card.locked ? 'Locked' : 'Not Yet Available'}
            disabled={!canStart}
            onPress={() => navigation.navigate('AssessmentAttempt', { activityId: card.activity_id, title: card.title })}
          />
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

function InfoRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.infoRow, last && { borderBottomWidth: 0 }]}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.xl, paddingBottom: spacing.xxl },
  title: { fontFamily: fontFamily.extraBold, fontSize: 19, color: colors.text.primary, marginBottom: spacing.sm },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.sm },
  banner: {
    marginTop: spacing.sm,
    padding: spacing.md,
    backgroundColor: 'rgba(200,168,96,0.1)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.surface.border,
  },
  bannerText: { fontFamily: fontFamily.medium, fontSize: 12, color: colors.text.primary },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.surface.border,
  },
  infoLabel: { fontFamily: fontFamily.medium, fontSize: 12, color: colors.text.secondary },
  infoValue: { fontFamily: fontFamily.bold, fontSize: 12, color: colors.text.primary },
  note: { fontFamily: fontFamily.regular, fontSize: 12, color: colors.text.secondary, lineHeight: 18, marginTop: spacing.lg },
});
