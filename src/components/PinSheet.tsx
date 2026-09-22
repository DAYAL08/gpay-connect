import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { colors, radius, spacing } from '../theme';

interface Props {
  visible: boolean;
  amount: number;
  recipient: string;
  onCancel: () => void;
  /** Return null on success, or an error message to keep the sheet open. */
  onSubmit: (pin: string) => Promise<string | null>;
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];

/**
 * GPay-style UPI PIN sheet: masked dots + numeric keypad.
 * The PIN never travels until 6 digits are entered.
 */
export function PinSheet({ visible, amount, recipient, onCancel, onSubmit }: Props) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (visible) {
      setPin('');
      setError(null);
      setBusy(false);
    }
  }, [visible]);

  async function submit(code: string) {
    if (code.length !== 6 || busy) return;
    setBusy(true);
    const err = await onSubmit(code);
    setBusy(false);
    if (err) {
      setError(err);
      setPin('');
    }
  }

  function press(key: string) {
    if (busy) return;
    setError(null);
    if (key === '⌫') {
      setPin((p) => p.slice(0, -1));
      return;
    }
    if (!key) return;
    setPin((p) => {
      const next = (p + key).slice(0, 6);
      if (next.length === 6) setTimeout(() => submit(next), 120);
      return next;
    });
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.handle} />

          <Text style={styles.title}>Enter 6-digit UPI PIN</Text>
          <Text style={styles.payTo}>
            Paying ₹{amount.toLocaleString('en-IN')} to {recipient}
          </Text>

          <View style={styles.dots}>
            {Array.from({ length: 6 }).map((_, i) => (
              <View
                key={i}
                style={[styles.dot, i < pin.length && styles.dotFilled]}
              />
            ))}
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}
          {busy ? <ActivityIndicator color={colors.blue} style={{ marginTop: 8 }} /> : null}

          <View style={styles.keypad}>
            {KEYS.map((k, i) => (
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

          <Pressable onPress={onCancel} disabled={busy} style={styles.cancel}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(32,33,36,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    paddingTop: spacing.sm,
    alignItems: 'center',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: spacing.md,
  },
  title: { fontSize: 17, fontWeight: '700', color: colors.text },
  payTo: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 4,
    marginBottom: spacing.md,
  },
  dots: { flexDirection: 'row', gap: 12, marginBottom: spacing.sm },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  dotFilled: {
    backgroundColor: colors.text,
    borderColor: colors.text,
  },
  error: {
    color: colors.red,
    fontSize: 13,
    fontWeight: '500',
    marginTop: 4,
    textAlign: 'center',
  },
  keypad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: 264,
    marginTop: spacing.md,
  },
  key: {
    width: 88,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
  },
  keyHidden: { opacity: 0 },
  keyText: { fontSize: 24, fontWeight: '600', color: colors.text },
  cancel: { paddingVertical: spacing.sm, paddingHorizontal: spacing.lg },
  cancelText: { color: colors.blue, fontSize: 15, fontWeight: '600' },
});
