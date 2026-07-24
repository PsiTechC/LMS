import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { profileApi } from '../../api/profile';
import { ApiError } from '../../api/client';
import { PasswordField, PrimaryButton, ScreenContainer } from '../../components';
import { colors, fontFamily, spacing } from '../../theme';
import type { ProfileStackParamList } from '../../navigation/tabs/ProfileStack';

type Props = NativeStackScreenProps<ProfileStackParamList, 'ChangePassword'>;

export function ChangePasswordScreen({ navigation }: Props) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit() {
    setError(null);
    setSuccess(false);
    if (!currentPassword || !newPassword) {
      setError('Enter your current and new password.');
      return;
    }
    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match.');
      return;
    }
    setSaving(true);
    try {
      await profileApi.changePassword({ current_password: currentPassword, new_password: newPassword });
      setSuccess(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => navigation.goBack(), 1200);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to change password.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScreenContainer keyboardSafe padded={false}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        <PasswordField label="Current Password" value={currentPassword} onChangeText={setCurrentPassword} editable={!saving} />
        <PasswordField label="New Password" value={newPassword} onChangeText={setNewPassword} editable={!saving} />
        <PasswordField label="Confirm New Password" value={confirmPassword} onChangeText={setConfirmPassword} editable={!saving} />
        {!!error && <Text style={styles.error}>{error}</Text>}
        {success && <Text style={styles.success}>Password changed.</Text>}
        <PrimaryButton label={saving ? 'Updating…' : 'Update Password'} onPress={handleSubmit} loading={saving} />
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.xl, paddingBottom: spacing.xxl },
  error: { fontFamily: fontFamily.medium, fontSize: 12, color: colors.status.danger, marginBottom: spacing.md },
  success: { fontFamily: fontFamily.medium, fontSize: 12, color: colors.status.success, marginBottom: spacing.md },
});
