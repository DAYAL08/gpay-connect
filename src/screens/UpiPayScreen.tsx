import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { api, ApiError, UpiId } from '../api/client';
import { StatusBadge } from '../components/StatusBadge';
import { colors, radius, spacing, type } from '../theme';

interface Props {
  /** Pay to an arbitrary UPI ID (opens the Pay screen prefilled). */
  onPayTo: (upi: string) => void;
}

const UPI_RE = /^[a-z0-9._-]{2,64}@[a-z0-9]{2,32}$/i;

/** Pay-to-UPI-ID entry + management of your own UPI IDs. */
export function UpiPayScreen({ onPayTo }: Props) {
  const [ids, setIds] = useState<UpiId[]>([]);
  const [payee, setPayee] = useState('');
  const [newId, setNewId] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api
      .listUpiIds()
      .then((res) => setIds(res.data))
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : 'Could not load UPI IDs.'),
      );
  }, []);

  useEffect(load, [load]);

  const payeeValid = UPI_RE.test(payee.trim());

  function handlePay() {
    if (!payeeValid) {
      setError('Enter a valid UPI ID like arjun@oksbi.');
      return;
    }
    setError(null);
    onPayTo(payee.trim().toLowerCase());
  }

  async function handleAdd() {
    const upi = newId.trim().toLowerCase();
    if (!UPI_RE.test(upi)) {
      setError('Use the format name@bank (e.g. riya@okhdfcbank).');
      return;
    }
    setAdding(true);
    setError(null);
    try {
      await api.addUpiId(upi);
      setNewId('');
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not add UPI ID.');
    } finally {
      setAdding(false);
    }
  }

  function handleDelete(item: UpiId) {
    Alert.alert('Remove UPI ID?', `${item.upi} will be removed from your account.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            const res = await api.deleteUpiId(item.id);
            setIds(res.data);
          } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Could not remove.');
          }
        },
      },
    ]);
  }

  async function handleDefault(item: UpiId) {
    try {
      const res = await api.setDefaultUpiId(item.id);
      setIds(res.data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update.');
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>UPI ID</Text>

      {/* Pay to any UPI ID */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Pay to any UPI ID</Text>
        <View style={styles.row}>
          <TextInput
            style={styles.input}
            value={payee}
            onChangeText={(v) => {
              setPayee(v.replace(/\s/g, ''));
              setError(null);
            }}
            placeholder="name@bank"
            placeholderTextColor={colors.textSecondary}
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel="Payee UPI ID"
          />
          <Pressable
            style={[styles.goBtn, !payeeValid && styles.goBtnOff]}
            onPress={handlePay}
            disabled={!payeeValid}
          >
            <Text style={styles.goText}>Pay →</Text>
          </Pressable>
        </View>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {/* Own UPI IDs */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Your UPI IDs</Text>
        {ids.map((item) => (
          <View key={item.id} style={styles.idRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.idText}>{item.upi}</Text>
              {item.isDefault ? (
                <View style={{ marginTop: 4 }}>
                  <StatusBadge label="Default" tone="green" />
                </View>
              ) : null}
            </View>
            {!item.isDefault ? (
              <Pressable onPress={() => handleDefault(item)} style={styles.miniBtn}>
                <Text style={styles.miniBtnText}>Set default</Text>
              </Pressable>
            ) : null}
            <Pressable
              onPress={() => handleDelete(item)}
              style={[styles.miniBtn, styles.miniBtnDanger]}
            >
              <Text style={[styles.miniBtnText, { color: colors.red }]}>Remove</Text>
            </Pressable>
          </View>
        ))}

        <View style={styles.row}>
          <TextInput
            style={styles.input}
            value={newId}
            onChangeText={(v) => {
              setNewId(v.replace(/\s/g, ''));
              setError(null);
            }}
            placeholder="add another: name@bank"
            placeholderTextColor={colors.textSecondary}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Pressable
            style={[styles.goBtn, (!UPI_RE.test(newId.trim()) || adding) && styles.goBtnOff]}
            onPress={handleAdd}
            disabled={!UPI_RE.test(newId.trim()) || adding}
          >
            <Text style={styles.goText}>{adding ? '…' : 'Add'}</Text>
          </Pressable>
        </View>
        <Text style={styles.hint}>
          Maximum 5 UPI IDs · one is always kept as your default receiving ID
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
  title: { ...type.title, color: colors.text },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  row: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  input: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  goBtn: {
    backgroundColor: colors.blue,
    borderRadius: radius.full,
    paddingVertical: 12,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
  },
  goBtnOff: { opacity: 0.45 },
  goText: { color: colors.surface, fontWeight: '700', fontSize: 14 },
  idRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  idText: { fontSize: 15, fontWeight: '600', color: colors.text },
  miniBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  miniBtnDanger: { borderColor: colors.redLight, backgroundColor: colors.redLight },
  miniBtnText: { fontSize: 12, fontWeight: '600', color: colors.blue },
  error: { color: colors.red, fontSize: 13 },
  hint: { fontSize: 11, color: colors.textSecondary, lineHeight: 16 },
});
