import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Badge, Card, PrimaryButton, ScreenContainer } from '../../components';
import { colors, fontFamily, spacing } from '../../theme';
import type { QuestionResultDTO } from '../../types/api';
import type { JourneyStackParamList } from '../../navigation/tabs/JourneyStack';

type Props = NativeStackScreenProps<JourneyStackParamList, 'AssessmentResult'>;

/**
 * Renders exactly what the backend's submit response contains — score is
 * never (re)computed client-side. This per-question breakdown is only ever
 * available right after a fresh submit: there is no participant-facing
 * endpoint to refetch a past attempt's per-question detail afterwards (see
 * final report "Backend limitations"), so this screen is the one place it's
 * shown.
 */
export function AssessmentResultScreen({ route, navigation }: Props) {
  const { result } = route.params;
  const pending = result.status === 'pending_review';
  const color = pending ? colors.brand.slate : result.passed ? colors.status.success : colors.status.warning;

  return (
    <ScreenContainer padded={false}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.scoreCircle, { borderColor: color }]}>
          {pending ? (
            <Text style={styles.scorePending}>⏳</Text>
          ) : (
            <Text style={[styles.scoreValue, { color }]}>{Math.round(result.score_pct)}%</Text>
          )}
        </View>

        <Text style={styles.headline}>
          {pending ? 'Submitted — Awaiting Review' : result.passed ? '✓ Passed' : 'Not Passed'}
        </Text>

        {pending ? (
          <Text style={styles.subline}>
            This assessment has open-ended answers your faculty will grade. You'll be notified when your final score
            is ready — it will appear in Assessments.
          </Text>
        ) : (
          <Text style={styles.subline}>
            {result.score} of {result.max_score} points
            {result.attempts_left > 0 ? ` · ${result.attempts_left} attempt${result.attempts_left === 1 ? '' : 's'} remaining` : ''}
          </Text>
        )}

        {result.timed_out && <Badge label="Time expired — auto-submitted" color={colors.status.danger} />}

        <View style={{ marginTop: spacing.xl, gap: spacing.sm, width: '100%' }}>
          {result.questions.map((q, i) => (
            <QuestionResultRow key={q.id} q={q} index={i} />
          ))}
        </View>

        <View style={{ marginTop: spacing.xl, width: '100%' }}>
          <PrimaryButton label="Done" onPress={() => navigation.popToTop()} />
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

function QuestionResultRow({ q, index }: { q: QuestionResultDTO; index: number }) {
  const ungraded = q.is_correct === undefined;
  const bg = q.is_correct === true ? 'rgba(34,197,94,0.05)' : q.is_correct === false ? 'rgba(239,68,68,0.05)' : colors.surface.alt;
  return (
    <Card style={{ backgroundColor: bg }}>
      <View style={styles.qTopRow}>
        <Text style={styles.qText} numberOfLines={4}>
          Q{index + 1}. {q.text}
        </Text>
        {q.is_correct === true && <Badge label="Correct" color={colors.status.success} />}
        {q.is_correct === false && <Badge label="Incorrect" color={colors.status.danger} />}
        {ungraded && <Badge label="Faculty review" color={colors.brand.slate} />}
      </View>
      {q.options && q.correct_index !== undefined && (
        <Text style={styles.qMeta}>
          Correct answer: <Text style={styles.qMetaStrong}>{q.options[q.correct_index]}</Text>
          {q.selected_index !== undefined && q.selected_index !== q.correct_index && (
            <Text> · Your answer: {q.options[q.selected_index]}</Text>
          )}
        </Text>
      )}
      {ungraded && !!q.selected_text && <Text style={styles.qOpenAnswer}>{q.selected_text}</Text>}
    </Card>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.xl, paddingBottom: spacing.xxl, alignItems: 'center' },
  scoreCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 6,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  scoreValue: { fontFamily: fontFamily.extraBold, fontSize: 22 },
  scorePending: { fontSize: 34 },
  headline: { fontFamily: fontFamily.bold, fontSize: 16, color: colors.text.primary, marginBottom: 4 },
  subline: { fontFamily: fontFamily.medium, fontSize: 12, color: colors.text.secondary, textAlign: 'center', lineHeight: 18, maxWidth: 320 },
  qTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.sm, marginBottom: 6 },
  qText: { flex: 1, fontFamily: fontFamily.semiBold, fontSize: 12, color: colors.text.primary },
  qMeta: { fontFamily: fontFamily.medium, fontSize: 11, color: colors.text.secondary },
  qMetaStrong: { fontFamily: fontFamily.bold, color: colors.text.primary },
  qOpenAnswer: {
    fontFamily: fontFamily.regular,
    fontSize: 11,
    color: colors.text.secondary,
    backgroundColor: colors.surface.card,
    borderWidth: 1,
    borderColor: colors.surface.border,
    borderRadius: 8,
    padding: spacing.sm,
    marginTop: 4,
  },
});
