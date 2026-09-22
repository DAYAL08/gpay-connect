import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing } from '../theme';

type Tone = 'green' | 'amber' | 'red' | 'neutral';

const toneStyles: Record<Tone, { bg: string; fg: string }> = {
  green: { bg: colors.greenLight, fg: colors.green },
  amber: { bg: colors.amberLight, fg: '#b06000' },
  red: { bg: colors.redLight, fg: colors.red },
  neutral: { bg: colors.blueLight, fg: colors.blue },
};

interface Props {
  label: string;
  tone?: Tone;
}

/** Small pill used for account / payment status. */
export function StatusBadge({ label, tone = 'neutral' }: Props) {
  const t = toneStyles[tone];
  return (
    <View style={[styles.badge, { backgroundColor: t.bg }]}>
      <Text style={[styles.text, { color: t.fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.full,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: 12,
    fontWeight: '600',
  },
});
