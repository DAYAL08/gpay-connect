import QRCode from 'qrcode';
import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { colors } from '../theme';

interface Props {
  /** Payload encoded into the QR (e.g. upi://pay?pa=...). */
  value: string;
  /** Rendered size in px (square). */
  dimension?: number;
}

/**
 * QR renderer built from the qrcode matrix — renders as a native view grid,
 * so it works on web, Android and iOS without a native SVG dependency.
 */
export function QrCanvas({ value, dimension = 240 }: Props) {
  const { size, cells } = useMemo(() => {
    try {
      const qr = QRCode.create(value, { errorCorrectionLevel: 'M' });
      return {
        size: qr.modules.size,
        cells: Array.from(qr.modules.data as unknown as Uint8Array),
      };
    } catch {
      // Extremely long payloads can exceed QR capacity — degrade gracefully.
      return { size: 0, cells: [] as number[] };
    }
  }, [value]);

  if (size === 0) {
    return (
      <View style={[styles.box, { width: dimension, height: dimension }]} />
    );
  }

  const cell = Math.max(2, Math.floor(dimension / size));
  const grid = size * cell;

  return (
    <View style={styles.box}>
      <View style={{ width: grid, height: grid, flexDirection: 'row', flexWrap: 'wrap' }}>
        {cells.map((on, i) => (
          <View
            key={i}
            style={{
              width: cell,
              height: cell,
              backgroundColor: on ? colors.text : colors.surface,
            }}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
});
