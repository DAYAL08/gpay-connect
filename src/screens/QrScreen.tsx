import React, { useEffect, useRef, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { api, ApiError } from '../api/client';
import { QrCanvas } from '../components/QrCanvas';
import { colors, radius, spacing, type } from '../theme';

interface Props {
  initialMode?: 'scan' | 'my';
  onPayTo: (upi: string, amount?: number) => void;
}

/** Extract payee + amount from a UPI payload or bare UPI ID. */
export function parseUpiPayload(raw: string): {
  upi: string;
  amount?: number;
  note?: string;
} | null {
  const text = raw.trim();
  if (!text) return null;

  if (text.toLowerCase().startsWith('upi://')) {
    try {
      const qs = text.slice(text.indexOf('?') + 1);
      const params = new URLSearchParams(qs);
      const pa = (params.get('pa') || '').toLowerCase();
      if (!/^[a-z0-9._-]{2,64}@[a-z0-9]{2,32}$/i.test(pa)) return null;
      const am = Number(params.get('am'));
      return {
        upi: pa,
        amount: Number.isFinite(am) && am > 0 ? am : undefined,
        note: params.get('tn') || undefined,
      };
    } catch {
      return null;
    }
  }

  if (/^[a-z0-9._-]{2,64}@[a-z0-9]{2,32}$/i.test(text)) {
    return { upi: text.toLowerCase() };
  }
  return null;
}

const SAMPLE =
  'upi://pay?pa=surface@oksbi&pn=Corner%20Cafe&am=199&tn=Tea%20%26%20snacks';

/** QR feature: camera scanning (web) with paste fallback + own QR code. */
export function QrScreen({ initialMode = 'scan', onPayTo }: Props) {
  const [mode, setMode] = useState<'scan' | 'my'>(initialMode);
  const [myUpi, setMyUpi] = useState<{ upi: string; name: string } | null>(null);
  const [paste, setPaste] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [camStatus, setCamStatus] = useState<string>('Starting camera…');
  const [copied, setCopied] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load my default UPI ID for the "My code" tab.
  useEffect(() => {
    if (mode !== 'my' || myUpi) return;
    api
      .listUpiIds()
      .then((res) => {
        const def = res.data.find((v) => v.isDefault) ?? res.data[0];
        if (def) {
          setMyUpi({ upi: def.upi, name: 'GPay Connect user' });
        }
      })
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : 'Could not load UPI ID.'),
      );
  }, [mode, myUpi]);

  const payload = myUpi
    ? `upi://pay?pa=${encodeURIComponent(myUpi.upi)}&pn=${encodeURIComponent(myUpi.name)}`
    : '';

  function handleDetected(value: string) {
    const parsed = parseUpiPayload(value);
    stopCamera();
    if (!parsed) {
      setError('That QR is not a valid UPI payment code.');
      return;
    }
    onPayTo(parsed.upi, parsed.amount);
  }

  async function startCamera() {
    setError(null);
    if (Platform.OS !== 'web') {
      setCamStatus('Camera scanning runs on web here — paste the code below.');
      return;
    }
    const w = window as unknown as {
      BarcodeDetector?: new (o: { formats: string[] }) => {
        detect: (src: HTMLVideoElement) => Promise<{ rawValue: string }[]>;
      };
      MediaRecorder?: unknown;
    };
    if (!navigator.mediaDevices?.getUserMedia) {
      setCamStatus('Camera unavailable — paste the QR content below.');
      return;
    }
    if (!w.BarcodeDetector) {
      setCamStatus(
        'This browser can’t detect QR codes automatically — paste the QR content below.',
      );
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      streamRef.current = stream;
      const video = document.createElement('video');
      video.srcObject = stream;
      video.autoplay = true;
      video.playsInline = true;
      video.muted = true;
      video.style.width = '100%';
      video.style.borderRadius = '12px';
      videoRef.current = video;
      document.getElementById('qr-cam-slot')?.appendChild(video);
      await video.play();

      const detector = new w.BarcodeDetector({ formats: ['qr_code'] });
      setCamStatus('Point the camera at a UPI QR code');
      timerRef.current = setInterval(async () => {
        try {
          const codes = await detector.detect(video);
          if (codes[0]?.rawValue) handleDetected(codes[0].rawValue);
        } catch {
          /* frame not ready */
        }
      }, 500);
    } catch {
      setCamStatus('Camera permission denied — paste the QR content below.');
    }
  }

  function stopCamera() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    videoRef.current?.remove();
    videoRef.current = null;
  }

  useEffect(() => {
    if (mode === 'scan') startCamera();
    else stopCamera();
    return stopCamera;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  function handlePaste() {
    const parsed = parseUpiPayload(paste);
    if (!parsed) {
      setError('Enter a UPI ID (name@bank) or an upi://pay… link.');
      return;
    }
    setError(null);
    onPayTo(parsed.upi, parsed.amount);
  }

  function copyPayload() {
    if (!payload) return;
    try {
      navigator.clipboard?.writeText(payload);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>QR payments</Text>

      <View style={styles.segment}>
        {(['scan', 'my'] as const).map((m) => (
          <Pressable
            key={m}
            style={[styles.segmentItem, mode === m && styles.segmentActive]}
            onPress={() => setMode(m)}
          >
            <Text style={[styles.segmentText, mode === m && styles.segmentTextActive]}>
              {m === 'scan' ? 'Scan code' : 'My QR code'}
            </Text>
          </Pressable>
        ))}
      </View>

      {mode === 'scan' ? (
        <View style={styles.card}>
          <View id="qr-cam-slot" style={styles.camSlot}>
            <Text style={styles.camHint}>📷 {camStatus}</Text>
          </View>

          <Text style={styles.or}>— or paste the code —</Text>
          <TextInput
            style={styles.input}
            value={paste}
            onChangeText={(v) => {
              setPaste(v);
              setError(null);
            }}
            placeholder="upi://pay?pa=name@bank or name@bank"
            placeholderTextColor={colors.textSecondary}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Pressable style={styles.sample} onPress={() => setPaste(SAMPLE)}>
            <Text style={styles.sampleText}>Insert sample QR payload</Text>
          </Pressable>
          <Pressable style={styles.primaryBtn} onPress={handlePaste}>
            <Text style={styles.primaryText}>Proceed to pay</Text>
          </Pressable>
        </View>
      ) : (
        <View style={[styles.card, styles.myCard]}>
          {payload ? (
            <QrCanvas value={payload} dimension={232} />
          ) : (
            <Text style={styles.camHint}>Loading your UPI ID…</Text>
          )}
          <Text style={styles.upiBig}>{myUpi?.upi ?? ''}</Text>
          <Text style={styles.upiSub}>
            Show this code to receive money into your account
          </Text>
          <Pressable style={styles.primaryBtn} onPress={copyPayload}>
            <Text style={styles.primaryText}>
              {copied ? 'Copied ✓' : 'Copy UPI link'}
            </Text>
          </Pressable>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
  title: { ...type.title, color: colors.text },
  segment: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.full,
    padding: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  segmentItem: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: radius.full,
    alignItems: 'center',
  },
  segmentActive: { backgroundColor: colors.blue },
  segmentText: { fontSize: 14, fontWeight: '600', color: colors.textSecondary },
  segmentTextActive: { color: colors.surface },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  myCard: { alignItems: 'center' },
  camSlot: {
    minHeight: 180,
    borderRadius: radius.md,
    backgroundColor: '#101315',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  camHint: { color: '#c9d1d9', fontSize: 13, textAlign: 'center', padding: spacing.sm },
  or: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
    marginVertical: 4,
  },
  input: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  error: { color: colors.red, fontSize: 13 },
  sample: { alignItems: 'center', paddingVertical: 4 },
  sampleText: { color: colors.blue, fontSize: 13, fontWeight: '600' },
  primaryBtn: {
    backgroundColor: colors.blue,
    borderRadius: radius.full,
    paddingVertical: 13,
    alignItems: 'center',
    alignSelf: 'stretch',
  },
  primaryText: { color: colors.surface, fontSize: 15, fontWeight: '700' },
  upiBig: { fontSize: 18, fontWeight: '700', color: colors.text, marginTop: spacing.sm },
  upiSub: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
});
