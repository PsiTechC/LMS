import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, SectionList, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { cohortsApi } from '../../api/cohorts';
import { sessionsApi } from '../../api/sessions';
import { ApiError } from '../../api/client';
import { Badge, EmptyState, ErrorState, FullScreenLoading } from '../../components';
import { colors, fontFamily, spacing } from '../../theme';
import type { SessionDTO } from '../../types/api';
import { formatDateTime } from '../../utils/activities';
import type { SessionsStackParamList } from '../../navigation/tabs/SessionsStack';

type Props = NativeStackScreenProps<SessionsStackParamList, 'SessionsList'>;

export function SessionsListScreen({ navigation }: Props) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionDTO[]>([]);

  const load = useCallback(async (signal: { cancelled: boolean }) => {
    try {
      const enrollments = await cohortsApi.myEnrollments();
      if (signal.cancelled) return;
      const cohortIds = Array.from(new Set(enrollments.map((e) => e.cohort_id)));
      const settled = await Promise.allSettled(
        cohortIds.map((cohort_id) => sessionsApi.list({ cohort_id, limit: 100 }))
      );
      if (signal.cancelled) return;
      const merged = settled.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
      setSessions(merged);
      setError(null);
    } catch (err) {
      if (signal.cancelled) return;
      setError(err instanceof ApiError ? err.message : 'Failed to load sessions.');
    }
  }, []);

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

  // Refresh (e.g. a session flips to live, or a check-in just happened) when
  // this tab regains focus — same 60s-poll intent as the web dashboard,
  // scoped to focus instead of a background timer to avoid burning battery
  // on a screen the participant isn't looking at.
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

  if (loading) return <FullScreenLoading label="Loading sessions…" />;

  if (error && sessions.length === 0) {
    return (
      <View style={styles.center}>
        <ErrorState title="Couldn't load sessions" message={error} onAction={() => { setLoading(true); void load({ cancelled: false }).finally(() => setLoading(false)); }} />
      </View>
    );
  }

  const now = Date.now();
  const upcomingOrLive = sessions
    .filter((s) => s.status === 'live' || new Date(s.scheduled_at).getTime() >= now)
    .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());
  const past = sessions
    .filter((s) => s.status !== 'live' && new Date(s.scheduled_at).getTime() < now)
    .sort((a, b) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime());

  const sectionsData = [
    { title: `Upcoming & Live (${upcomingOrLive.length})`, data: upcomingOrLive },
    { title: `Completed (${past.length})`, data: past },
  ].filter((s) => s.data.length > 0);

  return (
    <SectionList
      style={styles.list}
      contentContainerStyle={styles.listContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand.gold} />}
      sections={sectionsData}
      keyExtractor={(item) => item.id}
      stickySectionHeadersEnabled={false}
      renderSectionHeader={({ section }) => <Text style={styles.sectionTitle}>{section.title}</Text>}
      renderItem={({ item }) => <SessionRow session={item} onPress={() => navigation.navigate('SessionDetail', { session: item })} />}
      ListEmptyComponent={
        <View style={styles.center}>
          <EmptyState title="No sessions yet" message="Scheduled live sessions for your cohort will appear here." />
        </View>
      }
    />
  );
}

function SessionRow({ session, onPress }: { session: SessionDTO; onPress: () => void }) {
  const live = session.status === 'live';
  return (
    <Pressable onPress={onPress} style={styles.row}>
      <View style={styles.dateBox}>
        <Text style={styles.dateDay}>{new Date(session.scheduled_at).getDate()}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle} numberOfLines={1}>{session.title}</Text>
        <Text style={styles.rowMeta}>{formatDateTime(session.scheduled_at)} · {session.duration_mins} min</Text>
      </View>
      <Badge label={session.status} color={live ? colors.status.success : session.status === 'scheduled' ? colors.brand.gold : colors.text.secondary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, backgroundColor: colors.surface.page, justifyContent: 'center' },
  list: { flex: 1, backgroundColor: colors.surface.page },
  listContent: { padding: spacing.lg, paddingBottom: spacing.xxl, flexGrow: 1 },
  sectionTitle: { fontFamily: fontFamily.extraBold, fontSize: 13, color: colors.text.primary, marginTop: spacing.md, marginBottom: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: 9,
    backgroundColor: colors.surface.card,
    borderWidth: 1,
    borderColor: colors.surface.border,
    marginBottom: spacing.sm,
    minHeight: 44,
  },
  dateBox: { width: 44, height: 44, borderRadius: 10, backgroundColor: 'rgba(200,168,96,0.1)', alignItems: 'center', justifyContent: 'center' },
  dateDay: { fontFamily: fontFamily.extraBold, fontSize: 15, color: colors.brand.gold },
  rowTitle: { fontFamily: fontFamily.bold, fontSize: 13, color: colors.text.primary },
  rowMeta: { fontFamily: fontFamily.medium, fontSize: 11, color: colors.text.secondary, marginTop: 3 },
});
