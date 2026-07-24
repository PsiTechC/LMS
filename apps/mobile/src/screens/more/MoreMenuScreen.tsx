import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { useAuth } from '../../auth/AuthContext';
import { Card, MenuListItem, SecondaryButton } from '../../components';
import { resolveMoreDestinations } from '../../navigation/resolveDestinations';
import { ROLE_LABELS } from '../../navigation/roleLabels';
import { colors, fontFamily, spacing } from '../../theme';
import type { MoreStackParamList } from '../../navigation/tabs/MoreStack';
import type { ParticipantTabsParamList } from '../../navigation/ParticipantTabs';
import type { DestinationDefinition } from '../../navigation/types';

type Props = CompositeScreenProps<NativeStackScreenProps<MoreStackParamList, 'MoreMenu'>, BottomTabScreenProps<ParticipantTabsParamList>>;

/** Secondary entries are resolved from the shared destination registry. */
export function MoreMenuScreen({ navigation }: Props) {
  const { user, permissions, logout } = useAuth();
  if (!user) return null;
  const entries = resolveMoreDestinations({ role: user.role, permissions });
  const openEntry = (entry: DestinationDefinition) => {
    if (entry.key === 'profile') navigation.navigate('ProfileStack');
    if (entry.key === 'assessments') navigation.navigate('JourneyTab', { screen: 'AssessmentsList' });
  };

  return <ScrollView style={styles.container} contentContainerStyle={styles.content}>
    <Card style={styles.identityCard}>
      <View style={styles.avatar}><Text style={styles.avatarText}>{user.name.split(' ').map((name) => name[0]).join('').toUpperCase().slice(0, 2)}</Text></View>
      <View style={{ flex: 1 }}><Text style={styles.name} numberOfLines={1}>{user.name}</Text><Text style={styles.role}>{ROLE_LABELS[user.role] ?? user.role}</Text></View>
    </Card>
    {entries.map((entry) => <MenuListItem key={entry.key} icon={entry.icon} title={entry.label} description={entry.key === 'profile' ? 'Edit details, change password' : 'Quizzes and knowledge checks'} onPress={() => openEntry(entry)} />)}
    <SecondaryButton label="Log Out" onPress={() => void logout()} style={styles.logout} />
  </ScrollView>;
}
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface.page }, content: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md }, identityCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.sm }, avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.brand.gold, alignItems: 'center', justifyContent: 'center' }, avatarText: { fontFamily: fontFamily.extraBold, fontSize: 16, color: colors.text.inverse }, name: { fontFamily: fontFamily.bold, fontSize: 14, color: colors.text.primary }, role: { fontFamily: fontFamily.medium, fontSize: 11, color: colors.text.secondary, marginTop: 2 }, logout: { marginTop: spacing.lg },
});
