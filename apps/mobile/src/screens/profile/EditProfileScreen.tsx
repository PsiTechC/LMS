import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { useAuth } from '../../auth/AuthContext';
import { profileApi } from '../../api/profile';
import { ApiError } from '../../api/client';
import { FullScreenLoading, PrimaryButton, ScreenContainer, TextField } from '../../components';
import { colors, fontFamily, spacing } from '../../theme';
import type { ProfileStackParamList } from '../../navigation/tabs/ProfileStack';

type Props = NativeStackScreenProps<ProfileStackParamList, 'EditProfile'>;

export function EditProfileScreen({ navigation }: Props) {
  const { updateUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [about, setAbout] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (signal: { cancelled: boolean }) => {
    try {
      const p = await profileApi.getMe();
      if (signal.cancelled) return;
      setName(p.name);
      setMobile(p.mobile_number ?? '');
      setAbout(p.about ?? '');
    } catch (err) {
      if (!signal.cancelled) setError(err instanceof ApiError ? err.message : 'Failed to load profile.');
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

  async function handleSave() {
    if (!name.trim()) {
      setError('Name is required.');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const saved = await profileApi.updateMe({ name: name.trim(), mobile_number: mobile.trim(), about: about.trim() });
      updateUser({ name: saved.name });
      navigation.goBack();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save changes.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <FullScreenLoading label="Loading…" />;

  return (
    <ScreenContainer keyboardSafe padded={false}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        <TextField label="Full Name" value={name} onChangeText={setName} editable={!saving} placeholder="Your full name" />
        <TextField label="Mobile Number" value={mobile} onChangeText={setMobile} editable={!saving} keyboardType="phone-pad" placeholder="+91 98765 43210" />
        <TextField
          label="About"
          value={about}
          onChangeText={setAbout}
          editable={!saving}
          multiline
          numberOfLines={4}
          style={styles.textarea}
          placeholder="Tell us about yourself, your role, and your goals…"
        />
        {!!error && <Text style={styles.error}>{error}</Text>}
        <PrimaryButton label={saving ? 'Saving…' : 'Save Changes'} onPress={handleSave} loading={saving} />
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.xl, paddingBottom: spacing.xxl },
  textarea: { minHeight: 100, textAlignVertical: 'top' },
  error: { fontFamily: fontFamily.medium, fontSize: 12, color: colors.status.danger, marginBottom: spacing.md },
});
