import React, { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { api, ApiError } from '../api/client';
import { Button } from '../components/Button';
import { OtpInput } from '../components/OtpInput';
import { colors, radius, spacing, type } from '../theme';

interface Props {
  phone: string;
  maskedPhone: string;
  devOtp: string;
  onVerified: () => void;
  onBack: () => void;
}

/** OTP verification step with resend timer and attempt feedback. */
export function OtpScreen({
  phone,
  maskedPhone,
  devOtp,
  onVerified,
  onBack,
}: Props) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(30);

  useEffect(() => {
    if (seconds <= 0) return;
    const t = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [seconds]);

  async function verify(value: string) {
    if (value.length !== 6 || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.verifyOtp(phone, value);
      onVerified();
    } catch (err) {
      setCode('');
      setError(
        err instanceof ApiError ? err.message : 'Verification failed. Try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    if (seconds > 0 || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.sendOtp(phone);
      setSeconds(30);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not resend.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Pressable onPress={onBack} style={styles.back} accessibilityLabel="Go back">
        <Text style={styles.backText}>←</Text>
      </Pressable>

      <View style={styles.header}>
        <View style={styles.badge}>
          <Text style={styles.badgeGlyph}>✓</Text>
        </View>
        <Text style={styles.title}>Verify your number</Text>
        <Text style={styles.subtitle}>
          Enter the 6-digit code sent to {maskedPhone}
        </Text>
      </View>

      <OtpInput value={code} onChange={setCode} onComplete={verify} />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {busy ? <Text style={styles.checking}>Verifying…</Text> : null}

      {devOtp ? (
        <View style={styles.sandbox}>
          <Text style={styles.sandboxLabel}>Sandbox mode — no SMS sent</Text>
          <Pressable onPress={() => { setCode(devOtp); verify(devOtp); }}>
            <Text style={styles.sandboxCode}>Use code {devOtp}</Text>
          </Pressable>
        </View>
      ) : null}

      <Button
        label="Verify"
        onPress={() => verify(code)}
        loading={busy}
        disabled={code.length !== 6}
        style={{ marginTop: spacing.lg }}
      />

      <Pressable onPress={resend} disabled={seconds > 0} style={styles.resend}>
        <Text style={[styles.resendText, seconds > 0 && styles.resendMuted]}>
          {seconds > 0 ? `Resend code in ${seconds}s` : 'Resend code'}
        </Text>
      </Pressable>

      <Text style={styles.hint}>
        5 wrong attempts request a new code · 3 codes per 10 minutes
      </Text>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
  },
  back: { paddingTop: spacing.lg, width: 40 },
  backText: { fontSize: 24, color: colors.text },
  header: { alignItems: 'center', marginTop: spacing.xl, marginBottom: spacing.xl },
  badge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.greenLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  badgeGlyph: { color: colors.green, fontSize: 26, fontWeight: '700' },
  title: { ...type.title, color: colors.text },
  subtitle: {
    ...type.body,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  error: {
    color: colors.red,
    fontSize: 14,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  checking: {
    color: colors.blue,
    fontSize: 14,
    textAlign: 'center',
    marginTop: spacing.sm,
    fontWeight: '600',
  },
  sandbox: {
    marginTop: spacing.lg,
    backgroundColor: colors.amberLight,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: 'center',
    gap: 4,
  },
  sandboxLabel: { fontSize: 12, color: '#b06000', fontWeight: '600' },
  sandboxCode: { fontSize: 15, color: colors.blue, fontWeight: '700' },
  resend: { alignItems: 'center', marginTop: spacing.md },
  resendText: { color: colors.blue, fontSize: 15, fontWeight: '600' },
  resendMuted: { color: colors.textSecondary },
  hint: {
    ...type.caption,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
});
