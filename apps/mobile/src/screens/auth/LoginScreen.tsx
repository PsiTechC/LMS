import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '../../auth/AuthContext';
import { ApiError } from '../../api/client';
import { PrimaryButton, ScreenContainer, TextField, PasswordField } from '../../components';
import { colors, fontFamily, spacing } from '../../theme';

/**
 * Mobile-native login. Parity target: apps/web/components/layout/AuthModal.tsx
 * (email/password sign-in tab) and POST /auth/login (api/internal/auth).
 * Registration, email verification, and the developer OTP login are web-only
 * for now — not part of this mobile foundation slice.
 */
export function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const emailError = !email.trim() && formError ? 'Email is required' : null;
  const passwordError = !password && formError ? 'Password is required' : null;

  async function handleSubmit() {
    setFormError(null);
    if (!email.trim() || !password) {
      setFormError('Enter your email and password.');
      return;
    }
    setSubmitting(true);
    try {
      await login(email.trim(), password);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.kind === 'network') {
          setFormError('Network error — check your connection and try again.');
        } else if (err.status === 403 && err.code === 'EMAIL_NOT_VERIFIED') {
          setFormError('Please verify your email address before signing in.');
        } else {
          // Covers ErrInvalidCredentials / ErrInactiveAccount (401) surfaced
          // as err.message by the backend — see auth/handler.go login().
          setFormError(err.message || 'Invalid email or password.');
        }
      } else {
        setFormError('Something went wrong. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScreenContainer keyboardSafe>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <Text style={styles.title}>XA-LMS</Text>
          <Text style={styles.subtitle}>Sign in to continue</Text>
        </View>

        <TextField
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
          error={emailError}
          editable={!submitting}
        />
        <PasswordField
          label="Password"
          value={password}
          onChangeText={setPassword}
          autoComplete="password"
          textContentType="password"
          error={passwordError}
          editable={!submitting}
        />

        {!!formError && !emailError && !passwordError && (
          <Text style={styles.formError}>{formError}</Text>
        )}

        <PrimaryButton label="Sign In" onPress={handleSubmit} loading={submitting} style={styles.submit} />
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, justifyContent: 'center' },
  header: { marginBottom: spacing.xl, alignItems: 'center' },
  title: { fontFamily: fontFamily.extraBold, fontSize: 26, color: colors.brand.navy },
  subtitle: { fontFamily: fontFamily.medium, fontSize: 13, color: colors.text.secondary, marginTop: spacing.xs },
  formError: {
    fontFamily: fontFamily.medium,
    fontSize: 12,
    color: colors.status.danger,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  submit: { marginTop: spacing.sm },
});
