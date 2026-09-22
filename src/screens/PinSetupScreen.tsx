import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { api, ApiError } from '../api/client';
import { colors, radius, spacing, type } from '../theme';

interface Props {
  onDone: () => void;
}

/**
 * UPI PIN creation (set + confirm), mirroring GPay's first-run PIN setup.
 * A numeric keypad keeps the flow identical to the payment sheet.
 */
export function PinSetupScreen({ onDone }: Props) {
  const [stage, setStage] = useState<'set' | 'confirm'>('set');
  const [first, setFirst] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function finish(confirmed: string) {
    setBusy(true);
    setError(null);
    try {
      await api.setPin(confirmed);
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save PIN.');
      setStage('set');
      setFirst('');
      setPin('');
    } finally {
      setBusy(false);
    }
  }

  function press(key: string) {
    if (busy) return;
    setError(null);
    if (key === '⌫') {
      setPin((p) => p.slice(0, -1));
      return;
    }
    setPin((p) => {
      const next = (p + key).slice(0, 6);
      if (next.length === 6) {
        setTimeout(() => {
          if (stage === 'set') {
            setFirst(next);
            setPin('');
            setStage('confirm');
          } else if (next === first) {
            finish(next);
          } else {
            setError('PINs do not match. Try again.');
            setFirst('');
            setPin('');
            setStage('set');
          }
        }, 120);
      }
      return next;
    });
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View style={styles.badge}>
          <Text style={styles.badgeGlyph}>●</Text>
        </View>
        <Text style={styles.title}>
          {stage === 'set' ? 'Create your UPI PIN' : 'Confirm your UPI PIN'}
        </Text>
        <Text style={styles.subtitle}>
          This PIN authorises every payment.{'\n'}
          {stage === 'set'
            ? 'Choose 6 digits you can remember.'
            : 'Re-enter the same 6 digits.'}
        </Text>
      </View>

      <View style={styles.dots}>
        {Array.from({ length: 6 }).map((_, i) => (
          <View key={i} style={[styles.dot, i < pin.length && styles.dotFilled]} />
        ))}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {busy ? <Text style={styles.busy}>Securing your PIN…</Text> : null}

      <View style={styles.keypad}>
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((k, i) => (
          <Pressable
            key={i}
            style={[styles.key, !k && styles.keyHidden]}
            onPress={() => press(k)}
            disabled={!k}
            accessibilityLabel={k === '⌫' ? 'Delete' : k || 'blank'}
          >
            <Text style={styles.keyText}>{k}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.note}>
        <Text style={styles.noteText}>
          🔒 Stored as a salted hash · 5 wrong attempts = 5-minute lock
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
  },
  header: { alignItems: 'center', marginTop: 64, marginBottom: spacing.lg },
  badge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.blueLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  badgeGlyph: { color: colors.blue, fontSize: 22 },
  title: { ...type.title, color: colors.text },
  subtitle: {
    ...type.label,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.xs,
    lineHeight: 19,
  },
  dots: { flexDirection: 'row', gap: 12, marginBottom: spacing.md },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  dotFilled: { backgroundColor: colors.text, borderColor: colors.text },
  error: { color: colors.red, fontSize: 14, fontWeight: '500' },
  busy: { color: colors.blue, fontSize: 14, fontWeight: '600' },
  keypad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: 264,
    marginTop: spacing.lg,
  },
  key: {
    width: 88,
    height: 60,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
  },
  keyHidden: { opacity: 0 },
  keyText: { fontSize: 26, fontWeight: '600', color: colors.text },
  note: {
    marginTop: 'auto',
    marginBottom: spacing.xl,
    backgroundColor: colors.background,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
  },
  noteText: { ...type.caption, color: colors.textSecondary },
});
