import React, { useEffect, useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { attendanceApi } from '../../api/attendance';
import { ApiError } from '../../api/client';
import { Badge, InlineLoading, PrimaryButton, ScreenContainer, SecondaryButton, TextField } from '../../components';
import { colors, fontFamily, spacing } from '../../theme';
import { formatDateTime } from '../../utils/activities';
import { resolveJoinLink } from '../../utils/sessionLink';
import type { SessionsStackParamList } from '../../navigation/tabs/SessionsStack';

type Props = NativeStackScreenProps<SessionsStackParamList, 'SessionDetail'>;

/**
 * Mobile-native attendance flow: rather than the web's "display our own QR
 * for a second device to scan" (ParticipantQrCheckInModal in
 * apps/web/app/dashboard/participant/page.tsx — meant for a participant
 * sitting at a laptop), the participant is already holding this device, so
 * they type the code faculty is displaying and call the same
 * POST /attendance-sessions/check-in endpoint directly. Functional parity
 * (marks the same attendance record), different — and more natural —
 * mobile interaction.
 */
export function SessionDetailScreen({ route }: Props) {
  const { session } = route.params;
  const live = session.status === 'live';
  const joinLink = resolveJoinLink(session.meeting_type, session.join_url, session.virtual_link);

  const [attendanceOpen, setAttendanceOpen] = useState(false);
  const [checkedIn, setCheckedIn] = useState(false);
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!live || checkedIn) {
      setAttendanceOpen(false);
      return;
    }
    let cancelled = false;
    async function check() {
      try {
        await attendanceApi.participantActive(session.id);
        if (!cancelled) setAttendanceOpen(true);
      } catch {
        if (!cancelled) setAttendanceOpen(false);
      }
    }
    void check();
    const id = setInterval(check, 7000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [session.id, live, checkedIn]);

  async function handleCheckIn() {
    setError(null);
    if (!code.trim()) {
      setError('Enter the attendance code shown by your faculty.');
      return;
    }
    setSubmitting(true);
    try {
      await attendanceApi.checkIn(code.trim());
      setCheckedIn(true);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message || 'Check-in failed. Confirm the code and try again.');
      } else {
        setError('Check-in failed. Confirm the code and try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleJoin() {
    if (joinLink) await Linking.openURL(joinLink);
  }

  return (
    <ScreenContainer keyboardSafe>
      <ScrollView contentContainerStyle={styles.content}>
        <Badge label={session.status} color={live ? colors.status.success : session.status === 'scheduled' ? colors.brand.gold : colors.text.secondary} />
        <Text style={styles.title}>{session.title}</Text>
        {!!session.description && <Text style={styles.description}>{session.description}</Text>}
        <Text style={styles.meta}>{formatDateTime(session.scheduled_at)} · {session.duration_mins} min</Text>
        {!!session.faculty_name && <Text style={styles.meta}>Faculty: {session.faculty_name}</Text>}

        {session.agenda?.length > 0 && (
          <View style={styles.agendaBlock}>
            <Text style={styles.sectionLabel}>Agenda</Text>
            {session.agenda.map((item, i) => (
              <View key={i} style={styles.agendaRow}>
                {!!item.time && <Text style={styles.agendaTime}>{item.time}</Text>}
                <Text style={styles.agendaTitle}>{item.title}</Text>
              </View>
            ))}
          </View>
        )}

        {joinLink && live && (
          <PrimaryButton label="Join Session" onPress={handleJoin} style={styles.joinButton} />
        )}
        {!live && !joinLink && (
          <Text style={styles.info}>The join link will appear here once this session is live.</Text>
        )}

        {live && !checkedIn && (
          <View style={styles.attendanceBlock}>
            <Text style={styles.sectionLabel}>Attendance</Text>
            {attendanceOpen ? (
              <>
                <Text style={styles.info}>Attendance is open for this session — enter the code your faculty is displaying.</Text>
                <TextField
                  label="Attendance Code"
                  value={code}
                  onChangeText={setCode}
                  autoCapitalize="characters"
                  editable={!submitting}
                  placeholder="e.g. AB12CD"
                />
                {!!error && <Text style={styles.error}>{error}</Text>}
                <SecondaryButton label={submitting ? 'Checking in…' : 'Check In'} onPress={handleCheckIn} loading={submitting} />
              </>
            ) : (
              <InlineLoading label="Waiting for faculty to open attendance…" />
            )}
          </View>
        )}
        {checkedIn && (
          <View style={styles.checkedInBanner}>
            <Text style={styles.checkedInText}>✓ You're marked present</Text>
          </View>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.xl, paddingBottom: spacing.xxl, gap: spacing.sm },
  title: { fontFamily: fontFamily.extraBold, fontSize: 19, color: colors.text.primary, marginTop: spacing.sm },
  description: { fontFamily: fontFamily.regular, fontSize: 13, color: colors.text.secondary, lineHeight: 20 },
  meta: { fontFamily: fontFamily.medium, fontSize: 12, color: colors.text.secondary },
  sectionLabel: { fontFamily: fontFamily.bold, fontSize: 12, color: colors.text.primary, marginBottom: spacing.sm, textTransform: 'uppercase', letterSpacing: 0.5 },
  agendaBlock: { marginTop: spacing.lg },
  agendaRow: { flexDirection: 'row', gap: spacing.sm, paddingVertical: spacing.xs },
  agendaTime: { fontFamily: fontFamily.bold, fontSize: 12, color: colors.brand.gold, minWidth: 56 },
  agendaTitle: { fontFamily: fontFamily.medium, fontSize: 13, color: colors.text.primary, flexShrink: 1 },
  joinButton: { marginTop: spacing.lg },
  attendanceBlock: { marginTop: spacing.xl },
  info: { fontFamily: fontFamily.medium, fontSize: 12, color: colors.text.secondary, marginBottom: spacing.md },
  error: { fontFamily: fontFamily.medium, fontSize: 12, color: colors.status.danger, marginBottom: spacing.sm },
  checkedInBanner: { marginTop: spacing.lg, padding: spacing.md, backgroundColor: 'rgba(34,197,94,0.1)', borderRadius: 8, borderWidth: 1, borderColor: 'rgba(34,197,94,0.3)' },
  checkedInText: { fontFamily: fontFamily.bold, fontSize: 13, color: colors.status.success, textAlign: 'center' },
});
