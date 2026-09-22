import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { api, ApiError } from '../api/client';
import { Button } from '../components/Button';
import { colors, radius, spacing, type } from '../theme';

interface Props {
  onSent: (phone: string, devOtp: string) => void;
}

/** Phone-number sign-in — the GPay entry point (OTP follows). */
export function LoginScreen({ onSent }: Props) {
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid = /^\d{10}$/.test(phone);

  async function handleContinue() {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      const challenge = await api.sendOtp(phone);
      onSent(phone, challenge.devOtp);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Something went wrong. Try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.hero}>
        <View style={styles.logo}>
          <Text style={styles.logoGlyph}>G</Text>
        </View>
        <Text style={styles.brand}>GPay Connect</Text>
        <Text style={styles.tagline}>
          Secure payments with Stripe Connect{'\n'}sandbox protection
        </Text>
      </View>

      <View style={styles.form}>
        <Text style={styles.label}>Mobile number</Text>
        <View style={[styles.phoneRow, error ? styles.phoneRowError : null]}>
          <Text style={styles.cc}>+91</Text>
          <View style={styles.divider} />
          <TextInput
            style={styles.input}
            value={phone}
            onChangeText={(v) => {
              setPhone(v.replace(/\D/g, '').slice(0, 10));
              setError(null);
            }}
            keyboardType="phone-pad"
            placeholder="98765 43210"
            placeholderTextColor={colors.border}
            maxLength={10}
            autoFocus
            accessibilityLabel="Mobile number"
          />
        </View>
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Button
          label="Continue"
          onPress={handleContinue}
          loading={busy}
          disabled={!valid}
          style={{ marginTop: spacing.lg }}
        />

        <Text style={styles.terms}>
          By continuing you agree to our Terms & Privacy Policy. Standard SMS
          charges may apply.
        </Text>

        <View style={styles.secureNote}>
          <View style={styles.lockDot} />
          <Text style={styles.secureText}>
            OTP verification · signed sessions · UPI PIN protection
          </Text>
        </View>
      </View>

      <Pressable style={styles.footer}>
        <Text style={styles.footerText}>Help & safety</Text>
      </Pressable>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
  },
  hero: {
    alignItems: 'center',
    paddingTop: 72,
    paddingBottom: spacing.xl,
  },
  logo: {
    width: 72,
    height: 72,
    borderRadius: 22,
    backgroundColor: colors.blue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoGlyph: { color: '#fff', fontSize: 36, fontWeight: '800' },
  brand: {
    ...type.title,
    color: colors.text,
    marginTop: spacing.md,
  },
  tagline: {
    ...type.label,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.xs,
    lineHeight: 19,
  },
  form: { marginTop: spacing.sm },
  label: {
    ...type.label,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    height: 56,
    backgroundColor: colors.surface,
  },
  phoneRowError: { borderColor: colors.red },
  cc: { fontSize: 16, fontWeight: '700', color: colors.text },
  divider: {
    width: 1,
    height: 24,
    backgroundColor: colors.border,
    marginHorizontal: spacing.sm,
  },
  input: {
    flex: 1,
    fontSize: 17,
    color: colors.text,
    letterSpacing: 1,
    paddingVertical: 0,
  },
  error: { color: colors.red, fontSize: 13, marginTop: spacing.sm },
  terms: {
    ...type.caption,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.md,
    lineHeight: 17,
  },
  secureNote: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: spacing.lg,
    backgroundColor: colors.greenLight,
    borderRadius: radius.full,
    paddingVertical: 8,
    paddingHorizontal: spacing.md,
    alignSelf: 'center',
  },
  lockDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.green,
  },
  secureText: { fontSize: 12, color: colors.green, fontWeight: '600' },
  footer: { alignItems: 'center', paddingVertical: spacing.lg },
  footerText: { color: colors.blue, fontSize: 14, fontWeight: '600' },
});
