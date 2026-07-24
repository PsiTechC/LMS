import React, { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { useAuth } from '../../auth/AuthContext';
import { profileApi } from '../../api/profile';
import { ApiError } from '../../api/client';
import { Card, ErrorState, FullScreenLoading, PrimaryButton, SecondaryButton } from '../../components';
import { ROLE_LABELS } from '../../navigation/roleLabels';
import { colors, fontFamily, spacing } from '../../theme';
import type { ProfileResponse } from '../../types/api';
import type { ProfileStackParamList } from '../../navigation/tabs/ProfileStack';

type Props = NativeStackScreenProps<ProfileStackParamList, 'Profile'>;

export function ProfileScreen({ navigation }: Props) {
  const { user, logout } = useAuth();
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (signal: { cancelled: boolean }) => {
    try {
      const p = await profileApi.getMe();
      if (!signal.cancelled) {
        setProfile(p);
        setError(null);
      }
    } catch (err) {
      if (!signal.cancelled) setError(err instanceof ApiError ? err.message : 'Failed to load your profile.');
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

  if (loading) return <FullScreenLoading label="Loading profile…" />;

  if (error && !profile) {
    return (
      <View style={styles.center}>
        <ErrorState title="Couldn't load your profile" message={error} onAction={() => { setLoading(true); void load({ cancelled: false }).finally(() => setLoading(false)); }} />
      </View>
    );
  }

  if (!profile || !user) return null;

  const initials = profile.name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
  const roleLabel = ROLE_LABELS[user.role] ?? profile.role;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand.gold} />}
    >
      <Card>
        <View style={styles.header}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{profile.name}</Text>
            <View style={styles.roleBadge}>
              <Text style={styles.roleBadgeText}>{roleLabel}</Text>
            </View>
          </View>
        </View>

        <View style={styles.divider} />

        <Field label="Email Address" value={profile.email} />
        <Field label="Mobile Number" value={profile.mobile_number || 'Not set'} />
        <Field label="About" value={profile.about || 'Not set'} />

        <PrimaryButton label="Edit Profile" onPress={() => navigation.navigate('EditProfile')} style={styles.action} />
        <SecondaryButton label="Change Password" onPress={() => navigation.navigate('ChangePassword')} style={styles.action} />
      </Card>

      <SecondaryButton label="Log Out" onPress={() => void logout()} style={styles.logout} />
    </ScrollView>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, backgroundColor: colors.surface.page, justifyContent: 'center' },
  container: { flex: 1, backgroundColor: colors.surface.page },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.brand.gold, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: fontFamily.extraBold, fontSize: 22, color: colors.text.inverse },
  name: { fontFamily: fontFamily.bold, fontSize: 17, color: colors.text.primary, marginBottom: 6 },
  roleBadge: { alignSelf: 'flex-start', backgroundColor: 'rgba(200,168,96,0.14)', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 3 },
  roleBadgeText: { fontFamily: fontFamily.bold, fontSize: 11, color: colors.brand.gold },
  divider: { height: 1, backgroundColor: colors.surface.border, marginVertical: spacing.lg },
  field: { marginBottom: spacing.md },
  fieldLabel: { fontSize: 10, fontFamily: fontFamily.bold, color: colors.text.secondary, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 6 },
  fieldValue: { fontFamily: fontFamily.medium, fontSize: 13, color: colors.text.primary },
  action: { marginTop: spacing.md },
  logout: { marginTop: spacing.lg },
});
