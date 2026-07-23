import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import { notificationsApi, type InAppNotification } from '../../api/notifications';
import { ApiError } from '../../api/client';
import { Badge, EmptyState, ErrorState, FullScreenLoading } from '../../components';
import { colors, fontFamily, spacing } from '../../theme';

/**
 * In-app notifications — GET /communications/notifications, the same
 * endpoint and InAppNotification shape the web header's notification bell
 * uses (apps/web/lib/communications-api.ts). Gated server-side by
 * `notifications:read`, which both participant and participant_retailer
 * hold, so this screen is real for both roles.
 */
export function NotificationsListScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<InAppNotification[]>([]);
  const [markingAll, setMarkingAll] = useState(false);

  const load = useCallback(async (signal: { cancelled: boolean }) => {
    try {
      const list = await notificationsApi.list();
      if (!signal.cancelled) {
        setItems(list);
        setError(null);
      }
    } catch (err) {
      if (!signal.cancelled) setError(err instanceof ApiError ? err.message : "Couldn't load notifications.");
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

  const markRead = useCallback(async (id: string) => {
    // Optimistic — this is a low-stakes, idempotent write (read receipt),
    // matching the web bell's own optimistic mark-read.
    setItems((prev) => prev.map((n) => (n.id === id && !n.read_at ? { ...n, read_at: new Date().toISOString() } : n)));
    try {
      await notificationsApi.markRead(id);
    } catch {
      void load({ cancelled: false });
    }
  }, [load]);

  const markAllRead = useCallback(async () => {
    setMarkingAll(true);
    const now = new Date().toISOString();
    setItems((prev) => prev.map((n) => (n.read_at ? n : { ...n, read_at: now })));
    try {
      await notificationsApi.markAllRead();
    } catch {
      void load({ cancelled: false });
    } finally {
      setMarkingAll(false);
    }
  }, [load]);

  if (loading) return <FullScreenLoading label="Loading notifications…" />;

  if (error && items.length === 0) {
    return (
      <View style={styles.center}>
        <ErrorState
          title="Couldn't load notifications"
          message={error}
          onAction={() => { setLoading(true); void load({ cancelled: false }).finally(() => setLoading(false)); }}
        />
      </View>
    );
  }

  const unreadCount = items.filter((n) => !n.read_at).length;

  return (
    <FlatList
      style={styles.list}
      contentContainerStyle={styles.listContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand.gold} />}
      data={items}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={
        unreadCount > 0 ? (
          <Pressable onPress={() => void markAllRead()} disabled={markingAll} style={styles.markAllRow}>
            <Text style={styles.markAllText}>{markingAll ? 'Marking all read…' : `Mark all ${unreadCount} as read`}</Text>
          </Pressable>
        ) : null
      }
      renderItem={({ item }) => <NotificationRow item={item} onPress={() => markRead(item.id)} />}
      ListEmptyComponent={
        <View style={styles.center}>
          <EmptyState title="No notifications" message="You're all caught up. Reminders and alerts will appear here." />
        </View>
      }
    />
  );
}

function NotificationRow({ item, onPress }: { item: InAppNotification; onPress: () => void }) {
  const unread = !item.read_at;
  return (
    <Pressable onPress={onPress} style={[styles.row, unread && styles.rowUnread]}>
      {unread && <View style={styles.unreadDot} />}
      <View style={{ flex: 1 }}>
        <View style={styles.rowTop}>
          <Text style={styles.rowTitle} numberOfLines={2}>{item.title}</Text>
          <Badge label={item.type} color={typeColor(item.type)} />
        </View>
        <Text style={styles.rowBody} numberOfLines={3}>{item.body}</Text>
        <Text style={styles.rowMeta}>{formatWhen(item.created_at)}</Text>
      </View>
    </Pressable>
  );
}

function typeColor(type: InAppNotification['type']): string {
  switch (type) {
    case 'alert':
      return colors.status.danger;
    case 'achievement':
      return colors.status.success;
    case 'reminder':
      return colors.status.warning;
    default:
      return colors.brand.gold;
  }
}

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

const styles = StyleSheet.create({
  center: { flex: 1, backgroundColor: colors.surface.page, justifyContent: 'center' },
  list: { flex: 1, backgroundColor: colors.surface.page },
  listContent: { padding: spacing.lg, paddingBottom: spacing.xxl, flexGrow: 1 },
  markAllRow: { alignSelf: 'flex-end', paddingVertical: spacing.sm, paddingHorizontal: spacing.md, marginBottom: spacing.sm },
  markAllText: { fontFamily: fontFamily.semiBold, fontSize: 12, color: colors.brand.gold },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: colors.surface.card,
    borderWidth: 1,
    borderColor: colors.surface.border,
    borderRadius: 12,
    padding: spacing.lg,
    marginBottom: spacing.sm,
  },
  rowUnread: { borderColor: 'rgba(200,168,96,0.4)', backgroundColor: 'rgba(200,168,96,0.05)' },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.brand.gold, marginTop: 6 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.sm },
  rowTitle: { flex: 1, fontFamily: fontFamily.bold, fontSize: 13, color: colors.text.primary },
  rowBody: { fontFamily: fontFamily.regular, fontSize: 12, color: colors.text.secondary, marginTop: 4, lineHeight: 17 },
  rowMeta: { fontFamily: fontFamily.medium, fontSize: 10, color: colors.text.secondary, marginTop: 6 },
});
