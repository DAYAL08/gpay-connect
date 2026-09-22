import React, { useEffect, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { api, ApiError, SecurityOverview } from '../api/client';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { StatusBadge } from '../components/StatusBadge';
import { colors, radius, spacing } from '../theme';
import type { AccountLink, ConnectedAccount } from '../types';

interface Props {
  account: ConnectedAccount | null;
  onChanged: (account: ConnectedAccount) => void;
  onRefresh: () => void;
}

const steps = [
  'Business details',
  'Bank account payout',
  'Identity verification',
];

/** Stripe Connect onboarding flow, simulated against the mock server. */
export function ConnectScreen({ account, onChanged, onRefresh }: Props) {
  const [email, setEmail] = useState('merchant@example.com');
  const [country, setCountry] = useState('IN');
  const [businessType, setBusinessType] = useState<'individual' | 'company'>(
    'individual',
  );
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(-1);
  const [link, setLink] = useState<AccountLink | null>(null);
  const [security, setSecurity] = useState<SecurityOverview | null>(null);

  const connected = account?.status === 'active';

  // Wire up the security posture card (GET /v1/security/overview).
  useEffect(() => {
    api
      .securityOverview()
      .then(setSecurity)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) return;
        // server may be unreachable — card simply stays hidden
      });
  }, [account?.status, step]);

  async function handleCreate() {
    if (!email.includes('@')) {
      Alert.alert('Invalid email', 'Enter a valid email address.');
      return;
    }
    setBusy(true);
    try {
      const created = await api.createAccount({ email, country, businessType });
      onChanged(created);
      const accountLink = await api.createAccountLink();
      setLink(accountLink);
      setStep(0);
    } catch (err) {
      Alert.alert('Connection failed', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  }

  /** Advance through the simulated hosted-onboarding steps. */
  async function handleAdvance() {
    if (step < steps.length - 1) {
      setBusy(true);
      try {
        await new Promise((r) => setTimeout(r, 700));
        setStep(step + 1);
      } finally {
        setBusy(false);
      }
      return;
    }
    setBusy(true);
    try {
      const completed = await api.completeOnboarding();
      onChanged(completed);
      setStep(-1);
      setLink(null);
      onRefresh();
      Alert.alert('Account connected', 'Payments and payouts are now enabled.');
    } catch (err) {
      Alert.alert('Failed', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
    >
      <Text style={styles.title}>Stripe Connect</Text>
      <Text style={styles.subtitle}>
        Link a connected account to accept and disburse payments.
      </Text>

      {account ? (
        <Card>
          <View style={styles.statusRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.accountId}>{account.id}</Text>
              <Text style={styles.accountMeta}>
                {account.email} · {account.country.toUpperCase()}
              </Text>
            </View>
            <StatusBadge
              label={connected ? 'Active' : 'Incomplete'}
              tone={connected ? 'green' : 'amber'}
            />
          </View>
          <View style={styles.flags}>
            <Text style={[styles.flag, { color: account.chargesEnabled ? colors.green : colors.textSecondary }]}>
              {account.chargesEnabled ? '✓' : '○'} Charges
            </Text>
            <Text style={[styles.flag, { color: account.payoutsEnabled ? colors.green : colors.textSecondary }]}>
              {account.payoutsEnabled ? '✓' : '○'} Payouts
            </Text>
          </View>
        </Card>
      ) : null}

      {!connected && step === -1 ? (
        <Card title="Create connected account">
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="merchant@example.com"
            placeholderTextColor={colors.textSecondary}
          />
          <Text style={styles.label}>Country</Text>
          <TextInput
            style={styles.input}
            value={country}
            onChangeText={(v) => setCountry(v.toUpperCase().slice(0, 2))}
            placeholder="IN"
            placeholderTextColor={colors.textSecondary}
            autoCapitalize="characters"
          />
          <Text style={styles.label}>Business type</Text>
          <View style={styles.segment}>
            {(['individual', 'company'] as const).map((t) => (
              <Text
                key={t}
                style={[
                  styles.segmentItem,
                  businessType === t && styles.segmentActive,
                ]}
                onPress={() => setBusinessType(t)}
              >
                {t === 'individual' ? 'Individual' : 'Company'}
              </Text>
            ))}
          </View>
          <Button
            label={account ? 'Resume onboarding' : 'Connect account'}
            onPress={handleCreate}
            loading={busy}
            style={{ marginTop: spacing.md }}
          />
        </Card>
      ) : null}

      {step >= 0 && link ? (
        <Card title={`Onboarding · step ${step + 1} of ${steps.length}`}>
          <Text style={styles.linkUrl} numberOfLines={2}>
            {link.url}
          </Text>
          {steps.map((s, i) => (
            <View key={s} style={styles.stepRow}>
              <View
                style={[
                  styles.stepDot,
                  i < step && { backgroundColor: colors.green },
                  i === step && { backgroundColor: colors.blue },
                ]}
              >
                <Text style={styles.stepDotText}>
                  {i < step ? '✓' : i + 1}
                </Text>
              </View>
              <Text
                style={[
                  styles.stepLabel,
                  i === step && { color: colors.text, fontWeight: '600' },
                ]}
              >
                {s}
              </Text>
            </View>
          ))}
          <Button
            label={step < steps.length - 1 ? 'Continue' : 'Finish setup'}
            onPress={handleAdvance}
            loading={busy}
            style={{ marginTop: spacing.md }}
          />
        </Card>
      ) : null}

      {connected ? (
        <Card title="You're connected">
          <Text style={styles.doneText}>
            This account can now create payment intents and receive payouts.
          </Text>
          <Button
            label="Refresh status"
            variant="secondary"
            onPress={onRefresh}
            style={{ marginTop: spacing.sm }}
          />
        </Card>
      ) : null}

      {security ? (
        <Card title="Security">
          <View style={styles.secRow}>
            <Text style={styles.secLabel}>Two-factor</Text>
            <Text style={styles.secValue}>SMS OTP at sign-in</Text>
          </View>
          <View style={styles.secRow}>
            <Text style={styles.secLabel}>UPI PIN</Text>
            <Text
              style={[
                styles.secValue,
                { color: security.pinSet ? colors.green : colors.amber },
              ]}
            >
              {security.pinLocked
                ? 'Locked (too many attempts)'
                : security.pinSet
                  ? 'Enabled for payments'
                  : 'Not set yet'}
            </Text>
          </View>
          <View style={styles.secRow}>
            <Text style={styles.secLabel}>Session expires</Text>
            <Text style={styles.secValue}>
              {new Date(security.tokenExpiresAt).toLocaleString('en-IN', {
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </Text>
          </View>
          <View style={styles.secRow}>
            <Text style={styles.secLabel}>Rate limits</Text>
            <Text style={styles.secValue}>
              {security.rateLimits.otpSendsPerWindow} OTPs /{' '}
              {security.rateLimits.windowMinutes} min ·{' '}
              {security.rateLimits.pinAttemptsBeforeLock} PIN tries
            </Text>
          </View>
        </Card>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
  title: { fontSize: 22, fontWeight: '700', color: colors.text },
  subtitle: { fontSize: 14, color: colors.textSecondary, marginTop: -8 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  accountId: { fontSize: 15, fontWeight: '700', color: colors.text },
  accountMeta: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  flags: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
  flag: { fontSize: 13, fontWeight: '600' },
  label: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 4,
    marginTop: spacing.sm,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  segment: {
    flexDirection: 'row',
    backgroundColor: colors.background,
    borderRadius: radius.full,
    padding: 4,
    gap: 4,
  },
  segmentItem: {
    flex: 1,
    textAlign: 'center',
    paddingVertical: 8,
    borderRadius: radius.full,
    fontSize: 14,
    color: colors.textSecondary,
    overflow: 'hidden',
    textTransform: 'capitalize',
  },
  segmentActive: {
    backgroundColor: colors.surface,
    color: colors.blue,
    fontWeight: '600',
  },
  linkUrl: {
    fontSize: 11,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    fontFamily: 'monospace',
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 6,
  },
  stepDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDotText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  stepLabel: { fontSize: 14, color: colors.textSecondary },
  doneText: { fontSize: 14, color: colors.textSecondary, lineHeight: 20 },
  secRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingVertical: 5,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  secLabel: { fontSize: 13, color: colors.textSecondary },
  secValue: { fontSize: 13, color: colors.text, fontWeight: '600', textAlign: 'right', flexShrink: 1 },
});
