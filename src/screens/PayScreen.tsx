import React, { useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { api, ApiError } from '../api/client';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { PinSheet } from '../components/PinSheet';
import { contacts } from '../data/mock';
import { colors, radius, spacing, type } from '../theme';
import type { ConnectedAccount, PaymentIntent } from '../types';

interface Props {
  account: ConnectedAccount | null;
  pinSet: boolean;
  onPaid: (intent: PaymentIntent) => void;
  navigate: (screen: 'connect') => void;
  /** Payee prefilled from a QR scan or UPI ID lookup. */
  prefill?: { upi: string; amount?: number } | null;
  onPrefillApplied?: () => void;
  onOpenQr?: () => void;
}

const presets = [100, 250, 500, 1000];

/** Send-money flow: recipient -> amount -> UPI PIN -> receipt. */
export function PayScreen({
  account,
  pinSet,
  onPaid,
  navigate,
  prefill,
  onPrefillApplied,
  onOpenQr,
}: Props) {
  const [recipient, setRecipient] = useState(contacts[0]);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [askPin, setAskPin] = useState(false);
  const [receipt, setReceipt] = useState<PaymentIntent | null>(null);
  const [error, setError] = useState<string | null>(null);

  const connected = account?.status === 'active';
  const value = Number(amount);

  // Apply a prefilled payee (from QR scan / UPI ID screen).
  useEffect(() => {
    if (!prefill) return;
    const known = contacts.find(
      (c) => c.upi.toLowerCase() === prefill.upi.toLowerCase(),
    );
    const local = prefill.upi.split('@')[0];
    setRecipient(
      known ?? {
        id: `upi:${prefill.upi}`,
        name: local.charAt(0).toUpperCase() + local.slice(1),
        upi: prefill.upi,
        color: '#1a73e8',
      },
    );
    if (prefill.amount) setAmount(String(prefill.amount));
    onPrefillApplied?.();
  }, [prefill, onPrefillApplied]);

  function handlePressPay() {
    setError(null);
    if (!connected) {
      setError('Connect your Stripe account before paying.');
      return;
    }
    if (!pinSet) {
      setError('Set your UPI PIN first — it authorises every payment.');
      return;
    }
    if (!value || value <= 0 || Number.isNaN(value)) {
      setError('Enter an amount greater than zero.');
      return;
    }
    setAskPin(true);
  }

  /** Called by the PIN sheet; returns null on success, else an error message. */
  async function payWithPin(pin: string): Promise<string | null> {
    const idempotencyKey = `ik_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 10)}`;
    try {
      const intent = await api.createPaymentIntent(
        {
          amount: Math.round(value),
          description: note.trim() || `Payment to ${recipient.name}`,
          recipient: recipient.upi,
          pin,
        },
        idempotencyKey,
      );
      setAskPin(false);
      setAmount('');
      setNote('');
      setReceipt(intent);
      onPaid(intent);
      return null;
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) {
          setAskPin(false);
          return 'Session expired.';
        }
        return err.message;
      }
      return 'Payment failed. Try again.';
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Pay someone</Text>
      <Text style={styles.subtitle}>Payments are protected by your UPI PIN</Text>

      {onOpenQr ? (
        <Pressable style={styles.scanLink} onPress={onOpenQr}>
          <Text style={styles.scanLinkText}>▣ Scan a QR instead</Text>
        </Pressable>
      ) : null}

      <Card title="People">
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.people}
        >
          {contacts.map((c) => {
            const selected = c.id === recipient.id;
            return (
              <Pressable
                key={c.id}
                style={[styles.person, selected && styles.personActive]}
                onPress={() => setRecipient(c)}
                accessibilityLabel={`Select ${c.name}`}
              >
                <View style={[styles.avatar, { backgroundColor: c.color }]}>
                  <Text style={styles.avatarText}>{c.name[0]}</Text>
                </View>
                <Text style={styles.personName} numberOfLines={1}>
                  {c.name.split(' ')[0]}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <Text style={styles.upi}>{recipient.upi}</Text>
      </Card>

      <Card title="Amount">
        <View style={styles.amountRow}>
          <Text style={styles.currency}>₹</Text>
          <TextInput
            style={styles.amountInput}
            value={amount}
            onChangeText={(v) => {
              setAmount(v.replace(/[^0-9]/g, ''));
              setError(null);
            }}
            keyboardType="number-pad"
            placeholder="0"
            placeholderTextColor={colors.border}
            maxLength={6}
          />
        </View>
        <View style={styles.presets}>
          {presets.map((p) => (
            <Pressable
              key={p}
              style={styles.preset}
              onPress={() => {
                setAmount(String(p));
                setError(null);
              }}
            >
              <Text style={styles.presetText}>₹{p}</Text>
            </Pressable>
          ))}
        </View>
        <TextInput
          style={styles.note}
          value={note}
          onChangeText={setNote}
          placeholder="Add a note (optional)"
          placeholderTextColor={colors.textSecondary}
          maxLength={60}
        />
      </Card>

      {error ? (
        <View style={[styles.banner, !connected && styles.bannerWarn]}>
          <Text style={[styles.bannerText, !connected && styles.bannerWarnText]}>
            {error}
          </Text>
          {!connected ? (
            <Pressable onPress={() => navigate('connect')}>
              <Text style={styles.bannerLink}>Go to Connect →</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <Button
        label={value > 0 ? `Pay ₹${value.toLocaleString('en-IN')}` : 'Pay'}
        onPress={handlePressPay}
        disabled={!value}
      />

      <View style={styles.secureFootnote}>
        <Text style={styles.secureFootnoteText}>
          🔒 PIN never leaves this device unhashed · idempotency key prevents
          double charges
        </Text>
      </View>

      <PinSheet
        visible={askPin}
        amount={value || 0}
        recipient={recipient.name}
        onCancel={() => setAskPin(false)}
        onSubmit={payWithPin}
      />

      {/* Receipt */}
      <Modal visible={!!receipt} transparent animationType="fade">
        <View style={styles.receiptBackdrop}>
          <View style={styles.receipt}>
            <View style={styles.check}>
              <Text style={styles.checkGlyph}>✓</Text>
            </View>
            <Text style={styles.receiptAmount}>
              ₹{receipt?.amount.toLocaleString('en-IN')}
            </Text>
            <Text style={styles.receiptTo}>Paid to {receipt?.recipient}</Text>
            <Text style={styles.receiptId}>{receipt?.id}</Text>
            <View style={styles.receiptRow}>
              <Text style={styles.receiptLabel}>Status</Text>
              <Text style={styles.receiptStatus}>{receipt?.status}</Text>
            </View>
            <Button
              label="Done"
              onPress={() => setReceipt(null)}
              style={{ alignSelf: 'stretch', marginTop: spacing.md }}
            />
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
  title: { ...type.title, color: colors.text },
  subtitle: { ...type.label, color: colors.textSecondary, marginTop: -8 },
  scanLink: {
    alignSelf: 'flex-start',
    backgroundColor: colors.blueLight,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
  },
  scanLinkText: { color: colors.blue, fontSize: 13, fontWeight: '600' },
  people: { gap: spacing.md, paddingVertical: spacing.xs },
  person: { alignItems: 'center', width: 60, gap: 4, borderRadius: radius.md },
  personActive: { backgroundColor: colors.blueLight },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  personName: { fontSize: 11, color: colors.textSecondary },
  upi: {
    fontSize: 13,
    color: colors.blue,
    fontWeight: '600',
    marginTop: spacing.sm,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  currency: { fontSize: 30, color: colors.textSecondary, fontWeight: '600' },
  amountInput: {
    fontSize: 44,
    fontWeight: '700',
    color: colors.text,
    minWidth: 80,
    textAlign: 'center',
    paddingVertical: 4,
    letterSpacing: -1,
  },
  presets: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  preset: {
    flex: 1,
    backgroundColor: colors.background,
    borderRadius: radius.full,
    paddingVertical: 9,
    alignItems: 'center',
  },
  presetText: { fontSize: 14, color: colors.blue, fontWeight: '600' },
  note: {
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  banner: {
    backgroundColor: colors.redLight,
    borderRadius: radius.md,
    padding: spacing.sm,
    gap: 4,
  },
  bannerWarn: { backgroundColor: colors.amberLight },
  bannerText: { fontSize: 13, color: colors.red, lineHeight: 18 },
  bannerWarnText: { color: '#b06000' },
  bannerLink: { fontSize: 13, color: colors.blue, fontWeight: '700' },
  secureFootnote: { alignItems: 'center' },
  secureFootnoteText: {
    fontSize: 11,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  receiptBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(32,33,36,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  receipt: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
  },
  check: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.greenLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  checkGlyph: { color: colors.green, fontSize: 32, fontWeight: '800' },
  receiptAmount: { fontSize: 32, fontWeight: '800', color: colors.text },
  receiptTo: { fontSize: 15, color: colors.textSecondary, marginTop: 2 },
  receiptId: {
    fontSize: 12,
    color: colors.textSecondary,
    fontFamily: 'monospace',
    marginTop: 6,
  },
  receiptRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: spacing.sm,
    backgroundColor: colors.background,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  receiptLabel: { fontSize: 12, color: colors.textSecondary },
  receiptStatus: {
    fontSize: 12,
    color: colors.green,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
});
