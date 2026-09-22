export interface Contact {
  id: string;
  name: string;
  upi: string;
  color: string;
}

/** Demo contacts shown on the home screen. */
export const contacts: Contact[] = [
  { id: 'c1', name: 'Aarav Sharma', upi: 'aarav@okaxis', color: '#1a73e8' },
  { id: 'c2', name: 'Diya Patel', upi: 'diya@okhdfcbank', color: '#1e8e3e' },
  { id: 'c3', name: 'Rohan Gupta', upi: 'rohan@okicici', color: '#f9ab00' },
  { id: 'c4', name: 'Meera Iyer', upi: 'meera@oksbi', color: '#d93025' },
  { id: 'c5', name: 'Kabir Singh', upi: 'kabir@okaxis', color: '#7b1fa2' },
  { id: 'c6', name: 'Ananya Rao', upi: 'ananya@okpaytm', color: '#00796b' },
];

export const quickActions = [
  { id: 'qr', label: 'Scan QR', icon: '▣' },
  { id: 'upi', label: 'UPI ID', icon: '@' },
  { id: 'contact', label: 'Contacts', icon: '👤' },
  { id: 'bank', label: 'Bank', icon: '🏦' },
] as const;
