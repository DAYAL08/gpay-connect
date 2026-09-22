import React, { useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { ActionTile } from '../components/ActionTile';
import { Card } from '../components/Card';
import { StatusBadge } from '../components/StatusBadge';
import { contacts, quickActions } from '../data/mock';
import { colors, radius, spacing, type } from '../theme';
import type { Balance, ConnectedAccount, PaymentIntent, ScreenName } from '../types';

interface Props {
  account: ConnectedAccount | null;
  balance: Balance | null;
  transactions: PaymentIntent[];
  loading: boolean;
  phone: string | null;
  pinSet: boolean;
  onRefresh: () => void;
  navigate: (screen: ScreenName) => void;
  onQuickAction: (id: string) => void;
  onLock: () => void;
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export function HomeScreen({
  account,
  balance,
  transactions,
  loading,
  phone,
  pinSet,
  onRefresh,
  navigate,
  onQuickAction,
  onLock,
}: Props) {
  const [hidden, setHidden] = useState(false);
  const connected = account?.status === 'active';
  const recent = transactions.slice(0, 3);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={loading} onRefresh={onRefresh} tintColor={colors.blue} />
      }
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.greeting}>{greeting()}</Text>
          <Text style={styles.name}>{phone ?? 'GPay Connect'}</Text>
        </View>
        <Pressable
          onPress={onLock}
          style={styles.lockBtn}
          accessibilityLabel="Lock session"
        >
          <Text style={styles.lockText}>Lock</Text>
        </Pressable>
      </View>

      {/* Security strip */}
      <View style={styles.securityStrip}>
        <View style={styles.secItem}>
          <View style={[styles.dot, { backgroundColor: colors.green }]} />
          <Text style={styles.secText}>OTP verified</Text>
        </View>
        <View style={styles.secItem}>
          <View
            style={[
              styles.dot,
              { backgroundColor: pinSet ? colors.green : colors.amber },
            ]}
          />
          <Text style={styles.secText}>
            {pinSet ? 'UPI PIN active' : 'PIN not set'}
          </Text>
        </View>
        <View style={styles.secItem}>
          <View style={[styles.dot, { backgroundColor: colors.blue }]} />
          <Text style={styles.secText}>TLS sandbox</Text>
        </View>
      </View>

      {/* Balance card */}
      <Card>
        <View style={styles.balanceRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.balanceLabel}>Total balance</Text>
            <Text style={styles.balanceValue}>
              {connected
                ? hidden
                  ? '₹ ••••••'
                  : `₹${(balance?.available ?? 0).toLocaleString('en-IN')}`
                : 'Connect your account'}
            </Text>
            {connected && balance ? (
              <Text style={styles.balanceSub}>
                ₹{balance.pending.toLocaleString('en-IN')} pending settlement
              </Text>
            ) : null}
          </View>
          <View style={{ alignItems: 'flex-end', gap: 8 }}>
            <StatusBadge
              label={connected ? 'Connected' : account ? 'Setup needed' : 'Not connected'}
              tone={connected ? 'green' : account ? 'amber' : 'neutral'}
            />
            {connected ? (
              <Pressable onPress={() => setHidden((h) => !h)}>
                <Text style={styles.hideText}>{hidden ? 'Show' : 'Hide'}</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
        <Pressable
          style={styles.cta}
          onPress={() => navigate(connected ? 'pay' : 'connect')}
        >
          <Text style={styles.ctaText}>
            {connected ? 'Pay now' : 'Finish Stripe Connect setup'}
          </Text>
          <Text style={styles.ctaArrow}>→</Text>
        </Pressable>
      </Card>

      {/* Quick actions */}
      <View style={styles.actions}>
        {quickActions.map((a) => (
          <ActionTile
            key={a.id}
            title={a.label}
            icon={a.icon}
            onPress={() => onQuickAction(a.id)}
          />
        ))}
      </View>

      {/* People */}
      <Text style={styles.sectionTitle}>People</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.peopleRow}
      >
        {contacts.map((c) => (
          <Pressable
            key={c.id}
            style={styles.person}
            onPress={() => navigate('pay')}
            accessibilityLabel={`Pay ${c.name}`}
          >
            <View style={[styles.personAvatar, { backgroundColor: c.color }]}>
              <Text style={styles.personInitial}>{c.name[0]}</Text>
            </View>
            <Text style={styles.personName} numberOfLines={1}>
              {c.name.split(' ')[0]}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Recent activity */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Recent activity</Text>
        <Pressable onPress={() => navigate('history')}>
          <Text style={styles.link}>See all</Text>
        </Pressable>
      </View>

      {recent.length === 0 ? (
        <Card>
          <Text style={styles.empty}>
            No transactions yet — connect your account and make your first
            payment.
          </Text>
        </Card>
      ) : (
        <Card style={{ paddingVertical: spacing.xs }}>
          {recent.map((tx, i) => (
            <View
              key={tx.id}
              style={[styles.txRow, i > 0 && styles.txRowBorder]}
            >
              <View style={styles.txIcon}>
                <Text style={styles.txIconText}>↑</Text>
              </View>
              <View style={styles.txMeta}>
                <Text style={styles.txTitle} numberOfLines={1}>
                  {tx.description}
                </Text>
                <Text style={styles.txSub} numberOfLines={1}>
                  to {tx.recipient}
                </Text>
              </View>
              <View style={styles.txRight}>
                <Text style={styles.txAmount}>
                  -₹{tx.amount.toLocaleString('en-IN')}
                </Text>
                <Text
                  style={[
                    styles.txStatus,
                    {
                      color:
                        tx.status === 'succeeded' ? colors.green : colors.amber,
                    },
                  ]}
                >
                  {tx.status}
                </Text>
              </View>
            </View>
          ))}
        </Card>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: spacing.xl, gap: spacing.md },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  greeting: { ...type.label, color: colors.textSecondary },
  name: { ...type.title, color: colors.text, marginTop: 1 },
  lockBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    backgroundColor: colors.surface,
  },
  lockText: { color: colors.blue, fontSize: 13, fontWeight: '600' },
  securityStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: radius.full,
    paddingVertical: 8,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  secItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  secText: { fontSize: 11, color: colors.textSecondary, fontWeight: '500' },
  balanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  balanceLabel: { ...type.label, color: colors.textSecondary },
  balanceValue: {
    fontSize: 32,
    fontWeight: '700',
    color: colors.text,
    marginTop: 2,
    letterSpacing: -0.5,
  },
  balanceSub: { ...type.caption, color: colors.textSecondary, marginTop: 3 },
  hideText: { color: colors.blue, fontSize: 13, fontWeight: '600' },
  cta: {
    marginTop: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.blueLight,
    borderRadius: radius.full,
    paddingVertical: 13,
  },
  ctaText: { color: colors.blue, fontWeight: '600', fontSize: 15 },
  ctaArrow: { color: colors.blue, fontSize: 15 },
  actions: { flexDirection: 'row', gap: spacing.sm },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: { ...type.heading, color: colors.text },
  link: { color: colors.blue, fontWeight: '600', fontSize: 13 },
  peopleRow: { gap: spacing.md, paddingVertical: spacing.xs },
  person: { alignItems: 'center', width: 60, gap: 4 },
  personAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  personInitial: { color: '#fff', fontSize: 18, fontWeight: '700' },
  personName: { fontSize: 11, color: colors.textSecondary },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  txRowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  txIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.blueLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  txIconText: { color: colors.blue, fontSize: 16, fontWeight: '700' },
  txMeta: { flex: 1 },
  txTitle: { fontSize: 14, fontWeight: '600', color: colors.text },
  txSub: { fontSize: 12, color: colors.textSecondary, marginTop: 1 },
  txRight: { alignItems: 'flex-end' },
  txAmount: { fontSize: 14, fontWeight: '700', color: colors.text },
  txStatus: { fontSize: 11, marginTop: 1, textTransform: 'capitalize' },
  empty: { color: colors.textSecondary, fontSize: 14, textAlign: 'center', lineHeight: 20 },
});
