import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';

import { colors, fontFamily, radii, spacing } from '../theme';

interface TextFieldProps extends TextInputProps {
  label: string;
  error?: string | null;
}

/** Standard input — apps/CLAUDE.md "Input Field" (label + field). */
export function TextField({ label, error, style, ...inputProps }: TextFieldProps) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.text.secondary}
        style={[
          styles.input,
          focused && styles.inputFocused,
          !!error && styles.inputError,
          style,
        ]}
        onFocus={(e) => {
          setFocused(true);
          inputProps.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          inputProps.onBlur?.(e);
        }}
        {...inputProps}
      />
      {!!error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
}

/** Password variant of TextField with a show/hide toggle. */
export function PasswordField({ label, error, style, ...inputProps }: TextFieldProps) {
  const [visible, setVisible] = useState(false);
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>
      <View
        style={[
          styles.passwordRow,
          focused && styles.inputFocused,
          !!error && styles.inputError,
        ]}
      >
        <TextInput
          accessibilityLabel={label}
          placeholderTextColor={colors.text.secondary}
          secureTextEntry={!visible}
          style={[styles.passwordInput, style]}
          onFocus={(e) => {
            setFocused(true);
            inputProps.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            inputProps.onBlur?.(e);
          }}
          {...inputProps}
        />
        <Pressable
          onPress={() => setVisible((v) => !v)}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={visible ? 'Hide password' : 'Show password'}
        >
          <Text style={styles.toggleText}>{visible ? 'Hide' : 'Show'}</Text>
        </Pressable>
      </View>
      {!!error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginBottom: spacing.lg },
  label: {
    fontSize: 10,
    fontFamily: fontFamily.bold,
    color: colors.text.secondary,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.surface.border,
    borderRadius: radii.input,
    paddingVertical: 12,
    paddingHorizontal: spacing.md,
    fontSize: 13,
    fontFamily: fontFamily.regular,
    color: colors.text.primary,
    minHeight: 44,
    backgroundColor: colors.surface.card,
  },
  inputFocused: { borderColor: colors.brand.gold },
  inputError: { borderColor: colors.status.danger },
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.surface.border,
    borderRadius: radii.input,
    paddingHorizontal: spacing.md,
    minHeight: 44,
    backgroundColor: colors.surface.card,
  },
  passwordInput: {
    flex: 1,
    fontSize: 13,
    fontFamily: fontFamily.regular,
    color: colors.text.primary,
    paddingVertical: 12,
  },
  toggleText: {
    fontSize: 11,
    fontFamily: fontFamily.bold,
    color: colors.brand.slate,
    paddingLeft: spacing.sm,
  },
  errorText: {
    fontSize: 11,
    fontFamily: fontFamily.medium,
    color: colors.status.danger,
    marginTop: 4,
  },
});
