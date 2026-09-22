import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ScreenName } from '../types';
import { colors, spacing } from '../theme';

interface Props {
  active: ScreenName;
  onChange: (screen: ScreenName) => void;
}

const tabs: { id: ScreenName; label: string; icon: string }[] = [
  { id: 'home', label: 'Home', icon: '⌂' },
  { id: 'connect', label: 'Connect', icon: '🔗' },
  { id: 'pay', label: 'Pay', icon: '₹' },
  { id: 'history', label: 'History', icon: '≡' },
];

/** Bottom tab bar styled after the GPay navigation. */
export function TabBar({ active, onChange }: Props) {
  return (
    <View style={styles.bar}>
      {tabs.map((tab) => {
        const selected = tab.id === active;
        return (
          <Pressable
            key={tab.id}
            style={styles.tab}
            onPress={() => onChange(tab.id)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={tab.label}
          >
            <View
              style={[styles.pill, selected && styles.pillActive]}
            >
              <Text
                style={[styles.icon, selected && styles.iconActive]}
              >
                {tab.icon}
              </Text>
            </View>
            <Text style={[styles.label, selected && styles.labelActive]}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  pill: {
    paddingHorizontal: 16,
    paddingVertical: 3,
    borderRadius: 999,
  },
  pillActive: {
    backgroundColor: colors.blueLight,
  },
  icon: {
    fontSize: 16,
    color: colors.textSecondary,
  },
  iconActive: {
    color: colors.blue,
  },
  label: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  labelActive: {
    color: colors.blue,
    fontWeight: '600',
  },
});
