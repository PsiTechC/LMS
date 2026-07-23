import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { cohortsApi } from '../../api/cohorts';
import { programsApi } from '../../api/programs';
import { submissionsApi } from '../../api/submissions';
import { ApiError } from '../../api/client';
import { AppHeader, Badge, Card, EmptyState, ErrorState, FullScreenLoading, JourneyActivityCard, ProgressBar } from '../../components';
import { colors, fontFamily, spacing } from '../../theme';
import type { ActivityDTO, MyEnrollmentDTO, ProgramDetailDTO, SubmissionDTO } from '../../types/api';
import { getPhaseActivities, isActivityDone, phaseStatus, titleCase } from '../../utils/activities';
import type { JourneyStackParamList } from '../../navigation/tabs/JourneyStack';

type Props = NativeStackScreenProps<JourneyStackParamList, 'Journey'>;

type SubmissionMap = Record<string, SubmissionDTO | null>;

export function JourneyScreen({ navigation }: Props) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [enrollments, setEnrollments] = useState<MyEnrollmentDTO[]>([]);
  const [activeEnrollment, setActiveEnrollment] = useState<MyEnrollmentDTO | null>(null);
  const [program, setProgram] = useState<ProgramDetailDTO | null>(null);
  const [submissions, setSubmissions] = useState<SubmissionMap>({});
  const [aiFocus, setAiFocus] = useState<string | null>(null);
  const [selectedPhaseIdx, setSelectedPhaseIdx] = useState(0);

  const loadEnrollments = useCallback(async (signal: { cancelled: boolean }) => {
    try {
      const list = await cohortsApi.myEnrollments();
      if (signal.cancelled) return;
      setEnrollments(list);
      setActiveEnrollment((current) => current ?? list[0] ?? null);
      setLoadError(null);
    } catch (err) {
      if (signal.cancelled) return;
      setLoadError(err instanceof ApiError ? err.message : 'Failed to load your enrollments.');
    }
  }, []);

  const loadProgramData = useCallback(async (enrollment: MyEnrollmentDTO, signal: { cancelled: boolean }) => {
    try {
      const prog = await programsApi.get(enrollment.program_id);
      if (signal.cancelled) return;
      setProgram(prog);

      const trackable = (prog.phases ?? [])
        .flatMap((phase) => getPhaseActivities(phase))
        .filter((a) => ['assessment', 'survey', 'journal', 'assignment', 'peer_review', 'capstone', 'feedback_360', 'discussion'].includes(a.type));
      const settled = await Promise.allSettled(
        trackable.map((a) => submissionsApi.my(a.id).then((s) => [a.id, s] as const))
      );
      if (signal.cancelled) return;
      const next: SubmissionMap = {};
      settled.forEach((result, i) => {
        next[trackable[i].id] = result.status === 'fulfilled' ? result.value[1] : null;
      });
      setSubmissions(next);
    } catch (err) {
      if (signal.cancelled) return;
      setProgram(null);
    }
  }, []);

  // Initial load.
  useEffect(() => {
    const signal = { cancelled: false };
    setLoading(true);
    loadEnrollments(signal).finally(() => {
      if (!signal.cancelled) setLoading(false);
    });
    return () => {
      signal.cancelled = true;
    };
  }, [loadEnrollments]);

  // Program + submissions load whenever the active enrollment changes.
  useEffect(() => {
    if (!activeEnrollment) return;
    const signal = { cancelled: false };
    setProgram(null);
    setSubmissions({});
    setSelectedPhaseIdx(0);
    void loadProgramData(activeEnrollment, signal);
    return () => {
      signal.cancelled = true;
    };
  }, [activeEnrollment, loadProgramData]);

  // AI Daily Focus — best-effort, falls back silently to the derived line
  // rendered below if the AI call fails.
  useEffect(() => {
    if (!activeEnrollment) return;
    const signal = { cancelled: false };
    cohortsApi
      .aiDailyFocus()
      .then((res) => {
        if (!signal.cancelled) setAiFocus(res.insight ?? null);
      })
      .catch(() => {
        if (!signal.cancelled) setAiFocus(null);
      });
    return () => {
      signal.cancelled = true;
    };
  }, [activeEnrollment?.enrollment_id]);

  // Refresh submissions when returning from ActivityDetail (post-submit).
  useFocusEffect(
    useCallback(() => {
      if (!activeEnrollment) return;
      const signal = { cancelled: false };
      void loadProgramData(activeEnrollment, signal);
      return () => {
        signal.cancelled = true;
      };
    }, [activeEnrollment, loadProgramData])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    const signal = { cancelled: false };
    await loadEnrollments(signal);
    if (activeEnrollment) await loadProgramData(activeEnrollment, signal);
    setRefreshing(false);
  }, [loadEnrollments, loadProgramData, activeEnrollment]);

  const activities = useMemo(
    () => (program?.phases ?? []).flatMap((phase) => getPhaseActivities(phase)),
    [program]
  );
  const completedCount = activities.filter((a) => isActivityDone(a, submissions)).length;
  const pendingMandatory = activities.filter((a) => a.is_mandatory && !isActivityDone(a, submissions));

  const phases = program?.phases ?? [];
  const selectedPhase = phases[selectedPhaseIdx];
  const selectedActs = getPhaseActivities(selectedPhase);

  if (loading) return <FullScreenLoading label="Loading your journey…" />;

  if (loadError && enrollments.length === 0) {
    return (
      <View style={styles.center}>
        <ErrorState title="Couldn't load your journey" message={loadError} onAction={() => { setLoading(true); void loadEnrollments({ cancelled: false }).finally(() => setLoading(false)); }} />
      </View>
    );
  }

  if (!activeEnrollment) {
    return (
      <View style={styles.center}>
        <EmptyState
          title="Not enrolled yet"
          message="Your Program Manager will send an invite link. Once accepted, your participant journey appears here."
        />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <AppHeader title="My Journey" subtitle={activeEnrollment.program_title} />
      <FlatList
      style={styles.list}
      contentContainerStyle={styles.listContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand.gold} />}
      data={selectedActs}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={
        <View style={{ gap: spacing.lg }}>
          {enrollments.length > 1 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {enrollments.map((e) => (
                <Pressable
                  key={e.enrollment_id}
                  onPress={() => setActiveEnrollment(e)}
                  style={[styles.chip, e.enrollment_id === activeEnrollment.enrollment_id && styles.chipActive]}
                >
                  <Text style={[styles.chipText, e.enrollment_id === activeEnrollment.enrollment_id && styles.chipTextActive]} numberOfLines={1}>
                    {e.program_title}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          )}

          <View style={styles.aiBanner}>
            <Text style={styles.aiTag}>AI</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.aiTitle}>AI Daily Focus</Text>
              <Text style={styles.aiBody}>
                {aiFocus ?? `Continue ${activeEnrollment.program_title}. You are at ${activeEnrollment.completion_percent}% completion — pick one activity and keep the streak alive.`}
              </Text>
            </View>
          </View>

          <Pressable
            onPress={() => navigation.navigate('AssessmentsList', { programId: activeEnrollment.program_id })}
            style={styles.assessmentsEntry}
          >
            <Text style={styles.assessmentsEntryIcon}>✦</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.assessmentsEntryTitle}>Assessments</Text>
              <Text style={styles.assessmentsEntryMeta}>Quizzes and knowledge checks for this program</Text>
            </View>
            <Text style={styles.assessmentsEntryChevron}>›</Text>
          </Pressable>

          <View style={styles.statsRow}>
            <StatTile label="Progress" value={`${activeEnrollment.completion_percent}%`} color={activeEnrollment.program_color || colors.brand.gold} />
            <StatTile label="Completed" value={`${completedCount}/${activities.length}`} color={colors.status.success} />
            <StatTile label="Pending" value={String(pendingMandatory.length)} color={pendingMandatory.length ? colors.status.warning : colors.status.success} />
          </View>

          <View style={[styles.hero, { backgroundColor: activeEnrollment.program_color || colors.brand.gold }]}>
            <Text style={styles.heroCohort}>{activeEnrollment.cohort_name}</Text>
            <Text style={styles.heroTitle}>{activeEnrollment.program_title}</Text>
            <Text style={styles.heroBody} numberOfLines={3}>
              {activeEnrollment.program_description || 'Your active leadership development journey.'}
            </Text>
            <View style={{ marginTop: spacing.md }}>
              <ProgressBar percent={activeEnrollment.completion_percent} color={colors.text.inverse} />
            </View>
          </View>

          <Card style={{ padding: 0, overflow: 'hidden' }}>
            <Text style={styles.sectionTitle}>Learning Journey Timeline</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.phaseTabs}>
              {phases.map((phase, index) => {
                const status = phaseStatus(phase, submissions);
                const isSel = index === selectedPhaseIdx;
                const dot = status === 'done' ? colors.brand.navy : status === 'locked' ? colors.status.inactive : colors.brand.gold;
                return (
                  <Pressable key={phase.id} onPress={() => setSelectedPhaseIdx(index)} style={[styles.phaseTab, isSel && styles.phaseTabActive]}>
                    <View style={[styles.phaseDot, { backgroundColor: dot }]}>
                      <Text style={styles.phaseDotText}>{status === 'done' ? '✓' : status === 'locked' ? '🔒' : index + 1}</Text>
                    </View>
                    <Text style={styles.phaseLabel} numberOfLines={1}>{phase.title}</Text>
                  </Pressable>
                );
              })}
              {phases.length === 0 && <Text style={styles.emptyInline}>No phases published yet.</Text>}
            </ScrollView>
            {selectedPhase?.locked && (
              <View style={styles.lockedBanner}>
                <Text style={styles.lockedText}>🔒 {selectedPhase.locked_reason || "This phase isn't open yet."}</Text>
              </View>
            )}
            {selectedPhase && (
              <View style={styles.phaseHeader}>
                <View>
                  <Text style={styles.phaseHeaderTitle}>{selectedPhase.title}</Text>
                  <Text style={styles.phaseHeaderMeta}>
                    {selectedActs.filter((a) => isActivityDone(a, submissions)).length}/{selectedActs.length} complete
                  </Text>
                </View>
                <Badge
                  label={phaseStatus(selectedPhase, submissions) === 'done' ? 'Completed' : 'Active'}
                  color={phaseStatus(selectedPhase, submissions) === 'done' ? colors.status.success : colors.brand.gold}
                />
              </View>
            )}
          </Card>
        </View>
      }
      renderItem={({ item }) => (
        <JourneyActivityCard activity={item} submission={submissions[item.id] ?? null} phaseTitle={selectedPhase?.title} onPress={() => navigation.navigate('ActivityDetail', { activity: item, submission: submissions[item.id] ?? null })} />
      )}
      ListEmptyComponent={phases.length ? <Text style={styles.emptyInline}>No activities in this phase yet.</Text> : null}
      ListFooterComponent={
        <Card style={{ marginTop: spacing.lg }}>
          <Text style={styles.sectionTitle}>Cohort Signals</Text>
          <InfoRow k="Cohort" v={activeEnrollment.cohort_name} />
          <InfoRow k="Risk" v={titleCase(activeEnrollment.risk_level)} />
        </Card>
      }
      />
    </View>
  );
}

function StatTile({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <Card style={styles.statTile}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </Card>
  );
}

function InfoRow({ k, v }: { k: string; v: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoKey}>{k}</Text>
      <Text style={styles.infoValue}>{v}</Text>
    </View>
  );
}

function ActivityRow({ activity, submission, onPress }: { activity: ActivityDTO; submission: SubmissionDTO | null; onPress: () => void }) {
  const done = isActivityDone(activity, { [activity.id]: submission });
  return (
    <Pressable onPress={onPress} style={[styles.activityRow, done && styles.activityRowDone]}>
      <View style={{ flex: 1 }}>
        <View style={styles.activityTitleRow}>
          <Text style={styles.activityTitle} numberOfLines={1}>{activity.title}</Text>
          {activity.is_mandatory && <Badge label="Required" color={colors.brand.gold} />}
          {done && <Badge label={submission?.grade != null ? `Grade ${submission.grade}` : 'Done'} color={colors.status.success} />}
        </View>
        <Text style={styles.activityMeta}>
          {titleCase(activity.type.replaceAll('_', ' '))} · {activity.duration_mins || 30} min
        </Text>
      </View>
      {activity.locked && <Badge label="Locked" color={colors.text.secondary} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface.page },
  center: { flex: 1, backgroundColor: colors.surface.page },
  list: { flex: 1, backgroundColor: colors.surface.page },
  listContent: { padding: spacing.lg, paddingBottom: spacing.xxl },
  chipRow: { gap: spacing.sm, paddingBottom: spacing.xs },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.surface.border,
    backgroundColor: colors.surface.card,
    maxWidth: 200,
  },
  chipActive: { backgroundColor: colors.brand.navy, borderColor: colors.brand.navy },
  chipText: { fontFamily: fontFamily.semiBold, fontSize: 12, color: colors.text.primary },
  chipTextActive: { color: colors.text.inverse },
  aiBanner: {
    flexDirection: 'row',
    gap: spacing.md,
    backgroundColor: colors.brand.navy,
    borderRadius: 12,
    padding: spacing.lg,
  },
  aiTag: { fontFamily: fontFamily.extraBold, color: colors.brand.gold, fontSize: 13 },
  aiTitle: { fontFamily: fontFamily.extraBold, color: colors.text.inverse, fontSize: 13, marginBottom: 2 },
  aiBody: { fontFamily: fontFamily.regular, color: 'rgba(255,255,255,0.86)', fontSize: 12, lineHeight: 18 },
  assessmentsEntry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.surface.border,
    padding: spacing.lg,
  },
  assessmentsEntryIcon: { fontSize: 20, color: colors.brand.gold },
  assessmentsEntryTitle: { fontFamily: fontFamily.bold, fontSize: 13, color: colors.text.primary },
  assessmentsEntryMeta: { fontFamily: fontFamily.medium, fontSize: 11, color: colors.text.secondary, marginTop: 2 },
  assessmentsEntryChevron: { fontSize: 20, color: colors.text.secondary },
  statsRow: { flexDirection: 'row', gap: spacing.sm },
  statTile: { flex: 1, alignItems: 'center', paddingVertical: spacing.md },
  statValue: { fontFamily: fontFamily.extraBold, fontSize: 20 },
  statLabel: { fontFamily: fontFamily.medium, fontSize: 10, color: colors.text.secondary, marginTop: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  hero: { borderRadius: 16, padding: spacing.xl },
  heroCohort: { fontFamily: fontFamily.semiBold, fontSize: 11, color: 'rgba(255,255,255,0.75)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  heroTitle: { fontFamily: fontFamily.extraBold, fontSize: 20, color: colors.text.inverse, marginBottom: 6 },
  heroBody: { fontFamily: fontFamily.regular, fontSize: 13, color: 'rgba(255,255,255,0.85)', lineHeight: 19 },
  sectionTitle: { fontFamily: fontFamily.extraBold, fontSize: 14, color: colors.text.primary, padding: spacing.lg, paddingBottom: spacing.sm },
  phaseTabs: { borderTopWidth: 1, borderTopColor: colors.surface.border, borderBottomWidth: 1, borderBottomColor: colors.surface.border },
  phaseTab: { alignItems: 'center', gap: 5, paddingHorizontal: spacing.md, paddingVertical: spacing.md, minWidth: 84, borderBottomWidth: 3, borderBottomColor: 'transparent' },
  phaseTabActive: { borderBottomColor: colors.brand.gold, backgroundColor: colors.surface.card },
  phaseDot: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  phaseDotText: { color: colors.text.inverse, fontFamily: fontFamily.bold, fontSize: 11 },
  phaseLabel: { fontFamily: fontFamily.medium, fontSize: 10, color: colors.text.secondary, maxWidth: 78 },
  lockedBanner: { margin: spacing.lg, marginBottom: 0, padding: spacing.md, backgroundColor: 'rgba(200,168,96,0.1)', borderRadius: 8, borderWidth: 1, borderColor: colors.surface.border },
  lockedText: { fontFamily: fontFamily.medium, fontSize: 12, color: colors.text.primary },
  phaseHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.lg },
  phaseHeaderTitle: { fontFamily: fontFamily.bold, fontSize: 13, color: colors.text.primary },
  phaseHeaderMeta: { fontFamily: fontFamily.medium, fontSize: 11, color: colors.text.secondary, marginTop: 2 },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: 9,
    backgroundColor: colors.surface.card,
    borderWidth: 1,
    borderColor: colors.surface.border,
    marginTop: spacing.sm,
    minHeight: 44,
  },
  activityRowDone: { backgroundColor: 'rgba(34,197,94,0.05)', borderColor: 'rgba(34,197,94,0.2)' },
  activityTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  activityTitle: { fontFamily: fontFamily.bold, fontSize: 13, color: colors.text.primary, flexShrink: 1 },
  activityMeta: { fontFamily: fontFamily.medium, fontSize: 11, color: colors.text.secondary, marginTop: 4 },
  emptyInline: { textAlign: 'center', color: colors.text.secondary, fontFamily: fontFamily.medium, fontSize: 12, padding: spacing.lg },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.surface.border },
  infoKey: { fontFamily: fontFamily.medium, fontSize: 12, color: colors.text.secondary },
  infoValue: { fontFamily: fontFamily.bold, fontSize: 12, color: colors.text.primary },
});
