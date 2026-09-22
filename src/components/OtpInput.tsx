import React, { useEffect, useRef } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { colors, radius } from '../theme';

interface Props {
  length?: number;
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  autoFocus?: boolean;
}

/** Segmented OTP code input with auto-advance (works on web + native). */
export function OtpInput({
  length = 6,
  value,
  onChange,
  onComplete,
  autoFocus = true,
}: Props) {
  const refs = useRef<Array<TextInput | null>>([]);
  const digits = value.padEnd(length, ' ').slice(0, length).split('');

  useEffect(() => {
    if (autoFocus) {
      const t = setTimeout(() => refs.current[0]?.focus(), 150);
      return () => clearTimeout(t);
    }
  }, [autoFocus]);

  function handleChange(index: number, raw: string) {
    const typed = raw.replace(/\D/g, '');
    if (!typed) {
      // backspace
      const next = value.slice(0, index) + value.slice(index + 1);
      onChange(next);
      if (index > 0) refs.current[index - 1]?.focus();
      return;
    }
    const merged =
      value.slice(0, index) + typed + value.slice(index + 1 + typed.length - 1);
    const trimmed = merged.replace(/\s/g, '').slice(0, length);
    onChange(trimmed);
    const nextIndex = Math.min(index + typed.length, length - 1);
    refs.current[nextIndex]?.focus();
    if (trimmed.length === length) onComplete?.(trimmed);
  }

  return (
    <View style={styles.row}>
      {digits.map((d, i) => (
        <TextInput
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          style={[styles.box, value.length === i && styles.boxActive]}
          value={value[i] ?? ''}
          onChangeText={(t) => handleChange(i, t)}
          onKeyPress={({ nativeEvent }) => {
            if (nativeEvent.key === 'Backspace' && !value[i] && i > 0) {
              refs.current[i - 1]?.focus();
              onChange(value.slice(0, i - 1));
            }
          }}
          keyboardType="number-pad"
          maxLength={length}
          textContentType="oneTimeCode"
          autoComplete="sms-otp"
          selectTextOnFocus
          accessibilityLabel={`Digit ${i + 1}`}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  box: {
    width: 46,
    height: 56,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    textAlign: 'center',
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
    paddingVertical: 0,
  },
  boxActive: {
    borderColor: colors.blue,
    backgroundColor: colors.blueLight,
  },
});
