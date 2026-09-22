import React, { useState } from 'react';
import {
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Card } from '../components/Card';
import { StatusBadge } from '../components/StatusBadge';
import { colors, radius, spacing } from '../theme';
import type { PaymentIntent } from '../types';

interface Props {
  transactions: PaymentIntent[];
  loading: boolean;
  onRefresh: () => void;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Full transaction history pulled from GET /v1/payment_intents. */
export function HistoryScreen({ transactions, loading, onRefresh }: Props) {
  const [selected, setSelected] = useState<PaymentIntent | null>(null);
  const total = transactions
    .filter((t) => t.status === 'succeeded')
    .reduce((sum, t) => sum + t.amount, 0);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={loading} onRefresh={onRefresh} tintColor={colors.blue} />
      }
    >
      <Text style={styles.title}>Transactions</Text>

      <Card>
        <Text style={styles.totalLabel}>Total paid</Text>
        <Text style={styles.totalValue}>₹{total.toLocaleString('en-IN')}</Text>
        <Text style={styles.totalSub}>
          {transactions.length} transaction{transactions.length === 1 ? '' : 's'}
        </Text>
      </Card>

      {transactions.length === 0 ? (
        <Card>
          <Text style={styles.empty}>Nothing here yet — your payments will show up here.</Text>
        </Card>
      ) : (
        transactions.map((tx) => (
          <Pressable
            key={tx.id}
            onPress={() => setSelected(tx)}
            accessibilityLabel={`Receipt for ${tx.description}`}
          >
            <Card style={styles.txCard}>
              <View style={styles.row}>
                <View style={styles.meta}>
                  <Text style={styles.desc} numberOfLines={1}>
                    {tx.description}
                  </Text>
                  <Text style={styles.sub} numberOfLines={1}>
                    {tx.recipient} · {formatTime(tx.createdAt)}
                  </Text>
                  <Text style={styles.id} numberOfLines={1}>
                    {tx.id}
                  </Text>
                </View>
                <View style={styles.right}>
                  <Text style={styles.amount}>-₹{tx.amount.toLocaleString('en-IN')}</Text>
                  <StatusBadge
                    label={tx.status}
                    tone={
                      tx.status === 'succeeded'
                        ? 'green'
                        : tx.status === 'canceled'
                          ? 'red'
                          : 'amber'
                    }
                  />
                </View>
              </View>
            </Card>
          </Pressable>
        ))
      )}

      {/* Receipt detail */}
      <Modal visible={!!selected} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modal}>
            <View style={styles.modalIcon}>
              <Text style={styles.modalIconText}>↓</Text>
            </View>
            <Text style={styles.modalAmount}>
              ₹{selected?.amount.toLocaleString('en-IN')}
            </Text>
            <Text style={styles.modalTo}>to {selected?.recipient}</Text>
            <Text style={styles.modalNote}>{selected?.description}</Text>

            <View style={styles.modalList}>
              <ModalRow label="Txn ID" value={selected?.id ?? ''} mono />
              <ModalRow
                label="Date"
                value={selected ? formatTime(selected.createdAt) : ''}
              />
              <ModalRow
                label="Status"
                value={selected?.status ?? ''}
                highlight={selected?.status === 'succeeded'}
              />
              <ModalRow label="Method" value="UPI · PIN authorized" />
            </View>

            <Pressable style={styles.modalClose} onPress={() => setSelected(null)}>
              <Text style={styles.modalCloseText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

function ModalRow({
  label,
  value,
  mono,
  highlight,
}: {
  label: string;
  value: string;
  mono?: boolean;
  highlight?: boolean;
}) {
  return (
    <View style={styles.modalRow}>
      <Text style={styles.modalLabel}>{label}</Text>
      <Text
        style={[
          styles.modalValue,
          mono && styles.mono,
          highlight && { color: colors.green },
        ]}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xl },
  title: { fontSize: 22, fontWeight: '700', color: colors.text, marginBottom: spacing.xs },
  totalLabel: { fontSize: 13, color: colors.textSecondary },
  totalValue: { fontSize: 28, fontWeight: '700', color: colors.text, marginTop: 2 },
  totalSub: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  txCard: { paddingVertical: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  meta: { flex: 1 },
  desc: { fontSize: 14, fontWeight: '600', color: colors.text },
  sub: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  id: { fontSize: 11, color: colors.border, marginTop: 2, fontFamily: 'monospace' },
  right: { alignItems: 'flex-end', gap: 4 },
  amount: { fontSize: 15, fontWeight: '700', color: colors.text },
  empty: { color: colors.textSecondary, fontSize: 14, textAlign: 'center' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(32,33,36,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  modal: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
  },
  modalIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.blueLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  modalIconText: { color: colors.blue, fontSize: 24, fontWeight: '800' },
  modalAmount: { fontSize: 30, fontWeight: '800', color: colors.text },
  modalTo: { fontSize: 15, color: colors.textSecondary, marginTop: 2 },
  modalNote: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 4,
    textAlign: 'center',
  },
  modalList: {
    alignSelf: 'stretch',
    marginTop: spacing.md,
    gap: 8,
    backgroundColor: colors.background,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  modalRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  modalLabel: { fontSize: 12, color: colors.textSecondary },
  modalValue: { fontSize: 12, color: colors.text, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  mono: { fontFamily: 'monospace', fontWeight: '400' },
  modalClose: {
    marginTop: spacing.md,
    alignSelf: 'stretch',
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalCloseText: { color: colors.blue, fontSize: 15, fontWeight: '600' },
});
