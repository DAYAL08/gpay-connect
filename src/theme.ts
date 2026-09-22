import { StyleSheet } from 'react-native';

/** GPay-inspired palette. */
export const colors = {
  blue: '#1a73e8',
  blueDark: '#1557b0',
  blueLight: '#e8f0fe',
  green: '#1e8e3e',
  greenLight: '#e6f4ea',
  red: '#d93025',
  redLight: '#fce8e6',
  amber: '#f9ab00',
  amberLight: '#fef7e0',
  text: '#202124',
  textSecondary: '#5f6368',
  textInverse: '#ffffff',
  border: '#dadce0',
  surface: '#ffffff',
  background: '#f8f9fa',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 20,
  full: 999,
};

/** Consistent type scale — keeps the UI looking deliberate, not ad-hoc. */
export const type = {
  display: { fontSize: 34, fontWeight: '700' as const, letterSpacing: -0.5 },
  title: { fontSize: 24, fontWeight: '700' as const, letterSpacing: -0.3 },
  heading: { fontSize: 17, fontWeight: '600' as const },
  body: { fontSize: 15, fontWeight: '400' as const },
  label: { fontSize: 13, fontWeight: '500' as const },
  caption: { fontSize: 12, fontWeight: '400' as const },
};

export const shadow = StyleSheet.create({
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
});
