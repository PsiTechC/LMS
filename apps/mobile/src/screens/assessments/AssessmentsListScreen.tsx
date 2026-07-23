import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { assessmentsApi } from '../../api/assessments';
import { ApiError } from '../../api/client';
import { Badge, Card, EmptyState, ErrorState, FullScreenLoading } from '../../components';
import { colors, fontFamily, spacing } from '../../theme';
import type { AssessmentCardDTO } from '../../types/api';
import type { JourneyStackParamList } from '../../navigation/tabs/JourneyStack';

type Props = NativeStackScreenProps<JourneyStackParamList, 'AssessmentsList'>;

type FilterTab = 'active' | 'upcoming' | 'completed';

/**
 * Quiz-backed assessments for the active program, sourced from
 * GET /assessments/my — the same endpoint apps/web/components/participant/
 * AssessmentsExperience.tsx uses for its quizCards map. Filter chips use the
 * backend's own status enum (active | upcoming | completed) rather than an
 * invented grouping, so status meaning stays identical to web.
 *
 * Assessment-type activities with no linked quiz asset (essay/file style)
 * never appear here — they are omitted server-side and stay reachable via
 * My Journey → Activity Detail's existing generic submission form.
 */
export function AssessmentsListScreen({ route, navigation }: Props) {
  const { programId } = route.params ?? {};
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasProgram, setHasProgram] = useState(true);
  const [assessments, setAssessments] = useState<AssessmentCardDTO[]>([]);
  const [tab, setTab] = useState<FilterTab>('active');

  const load = useCallback(
    async (signal: { cancelled: boolean }) => {
      try {
        const dto = await assessmentsApi.my(programId);
        if (signal.cancelled) return;
        setHasProgram(dto.has_program);
        setAssessments(dto.assessments);
        setError(null);
      } catch (err) {
        if (signal.cancelled) return;
        setError(err instanceof ApiError ? err.message : "Couldn't load assessments.");
      }
    },
    [programId]
  );

  useEffect(() => {
    const signal = { cancelled: false };
    setLoading(true);
    load(signal).finally(() => {
      if (!signal.cancelled) setLoading(false);
    });
    return () => {
      signal.cancelled = true;
    };
  }, [load]);

  // Refresh when returning from an attempt/result so newly-used attempts and
  // updated scores are reflected immediately.
  useFocusEffect(
    useCallback(() => {
      const signal = { cancelled: false };
      void load(signal);
      return () => {
        signal.cancelled = true;
      };
    }, [load])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load({ cancelled: false });
    setRefreshing(false);
  }, [load]);

  if (loading) return <FullScreenLoading label="Loading assessments…" />;

  if (error && assessments.length === 0) {
    return (
      <View style={styles.center}>
        <ErrorState
          title="Couldn't load assessments"
          message={error}
          onAction={() => {
            setLoading(true);
            void load({ cancelled: false }).finally(() => setLoading(false));
          }}
        />
      </View>
    );
  }

  if (!hasProgram) {
    return (
      <View style={styles.center}>
        <EmptyState title="Not enrolled yet" message="Assessments appear here once you're enrolled in a program." />
      </View>
    );
  }

  const filtered = assessments.filter((a) => a.status === tab);

  return (
    <View style={styles.container}>
      <View style={styles.tabRow}>
        {(['active', 'upcoming', 'completed'] as FilterTab[]).map((t) => (
          <Pressable key={t} onPress={() => setTab(t)} style={[styles.tab, tab === t && styles.tabActive]}>
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </Text>
          </Pressable>
        ))}
      </View>
      <FlatList
        style={styles.list}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand.gold} />}
        data={filtered}
        keyExtractor={(item) => item.activity_id}
        renderItem={({ item }) => (
          <AssessmentRow card={item} onPress={() => navigation.navigate('AssessmentIntro', { card: item })} />
        )}
        ListEmptyComponent={
          <Text style={styles.emptyInline}>
            {assessments.length === 0 ? 'No assessments in this program yet.' : `No ${tab} assessments.`}
          </Text>
        }
      />
    </View>
  );
}

function AssessmentRow({ card, onPress }: { card: AssessmentCardDTO; onPress: () => void }) {
  const attemptsLeft = card.attempts_allowed - card.attempts_used;
  return (
    <Pressable onPress={onPress}>
      <Card style={styles.rowCard}>
        <View style={styles.rowTop}>
          <Text style={styles.rowTitle} numberOfLines={2}>
            {card.title}
          </Text>
          {card.locked && <Badge label="Locked" color={colors.text.secondary} />}
          {!card.locked && card.pending_review && <Badge label="Awaiting review" color={colors.brand.slate} />}
          {!card.locked && !card.pending_review && card.best_score_pct != null && (
            <Badge
              label={`${Math.round(card.best_score_pct)}% ${card.passed ? '· Passed' : '· Not passed'}`}
              color={card.passed ? colors.status.success : colors.status.warning}
            />
          )}
        </View>
        <Text style={styles.rowMeta}>
          {card.question_count} question{card.question_count === 1 ? '' : 's'}
          {card.time_limit_mins > 0 ? ` · ⏱ ${card.time_limit_mins} min` : ''}
          {` · ${attemptsLeft > 0 ? `${attemptsLeft} attempt${attemptsLeft === 1 ? '' : 's'} left` : 'No attempts left'}`}
        </Text>
        {card.locked && !!card.locked_reason && <Text style={styles.lockedReason}>🔒 {card.locked_reason}</Text>}
        {!!card.due_date && <Text style={styles.rowMeta}>Due {card.due_date}</Text>}
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface.page },
  center: { flex: 1, backgroundColor: colors.surface.page },
  tabRow: { flexDirection: 'row', gap: spacing.sm, padding: spacing.lg, paddingBottom: spacing.sm },
  tab: {
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.surface.border,
    backgroundColor: colors.surface.card,
  },
  tabActive: { backgroundColor: colors.brand.navy, borderColor: colors.brand.navy },
  tabText: { fontFamily: fontFamily.semiBold, fontSize: 12, color: colors.text.secondary },
  tabTextActive: { color: colors.text.inverse, fontFamily: fontFamily.bold },
  list: { flex: 1 },
  listContent: { padding: spacing.lg, paddingTop: 0, paddingBottom: spacing.xxl },
  rowCard: { marginBottom: spacing.md },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.sm },
  rowTitle: { flex: 1, fontFamily: fontFamily.bold, fontSize: 14, color: colors.text.primary },
  rowMeta: { fontFamily: fontFamily.medium, fontSize: 11, color: colors.text.secondary, marginTop: 6 },
  lockedReason: { fontFamily: fontFamily.medium, fontSize: 11, color: colors.text.primary, marginTop: 6 },
  emptyInline: { textAlign: 'center', color: colors.text.secondary, fontFamily: fontFamily.medium, fontSize: 12, padding: spacing.xl },
});
