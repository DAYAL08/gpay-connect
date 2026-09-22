import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, SafeAreaView, StyleSheet, View } from 'react-native';
import { api, ApiError } from './src/api/client';
import { maskPhone, session } from './src/auth/session';
import { TabBar } from './src/components/TabBar';
import { ConnectScreen } from './src/screens/ConnectScreen';
import { HistoryScreen } from './src/screens/HistoryScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { OtpScreen } from './src/screens/OtpScreen';
import { PayScreen } from './src/screens/PayScreen';
import { PinSetupScreen } from './src/screens/PinSetupScreen';
import { QrScreen } from './src/screens/QrScreen';
import { UpiPayScreen } from './src/screens/UpiPayScreen';
import { colors } from './src/theme';
import type {
  Balance,
  ConnectedAccount,
  PaymentIntent,
  ScreenName,
} from './src/types';

type Phase = 'boot' | 'login' | 'otp' | 'pin' | 'app';

export default function App() {
  const [phase, setPhase] = useState<Phase>('boot');
  const [screen, setScreen] = useState<ScreenName>('home');

  // auth flow state
  const [phone, setPhone] = useState<string | null>(null);
  const [devOtp, setDevOtp] = useState('');
  const [pinSet, setPinSet] = useState(false);

  // prefill for the Pay screen (from QR scan or UPI ID entry)
  const [payPrefill, setPayPrefill] = useState<{
    upi: string;
    amount?: number;
  } | null>(null);

  // app data
  const [account, setAccount] = useState<ConnectedAccount | null>(null);
  const [balance, setBalance] = useState<Balance | null>(null);
  const [transactions, setTransactions] = useState<PaymentIntent[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorShown, setErrorShown] = useState(false);

  const logout = useCallback(() => {
    session.clear();
    setAccount(null);
    setBalance(null);
    setTransactions([]);
    setPinSet(false);
    setPhase('login');
  }, []);

  // Expired/invalid token anywhere -> bounce to login.
  useEffect(() => {
    session.onExpired(() => {
      setPhase('login');
      Alert.alert('Session expired', 'Please verify your number again.');
    });
    return () => session.onExpired(null);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const acc = await api.getAccount();
      setAccount(acc);
      if (acc && acc.status === 'active') {
        const [bal, intents] = await Promise.all([
          api.getBalance(),
          api.listPaymentIntents(),
        ]);
        setBalance(bal);
        setTransactions(intents.data);
      } else {
        setBalance(null);
        setTransactions([]);
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) return;
      if (!errorShown) {
        setErrorShown(true);
        Alert.alert(
          'Server unreachable',
          `${err instanceof Error ? err.message : 'Unknown error'}\n\n` +
            'Start it with: npm run server',
        );
      }
    } finally {
      setLoading(false);
    }
  }, [errorShown]);

  // Boot: resume an existing session, or go to login.
  useEffect(() => {
    (async () => {
      if (!session.token()) {
        setPhase('login');
        return;
      }
      setPhone(session.phone());
      try {
        const info = await api.getSession();
        setPinSet(info.pinSet);
        setPhase(info.pinSet ? 'app' : 'pin');
        if (info.pinSet) refresh();
      } catch {
        setPhase('login');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleVerified() {
    const raw = session.phone();
    setPhone(raw);
    api
      .getSession()
      .then((info) => {
        setPinSet(info.pinSet);
        if (info.pinSet) {
          setPhase('app');
          refresh();
        } else {
          setPhase('pin');
        }
      })
      .catch(() => setPhase('pin'));
  }

  function handlePaid(intent: PaymentIntent) {
    setTransactions((prev) => [intent, ...prev]);
    refresh();
  }

  /** Jump to Pay with a payee (and optional amount) already filled in. */
  function goPayTo(upi: string, amount?: number) {
    setPayPrefill({ upi, amount });
    setScreen('pay');
  }

  function handleQuickAction(id: string) {
    switch (id) {
      case 'qr':
        setScreen('qr');
        break;
      case 'upi':
        setScreen('upi');
        break;
      case 'contact':
        setScreen('pay');
        break;
      case 'bank':
        // Payout bank details are part of Stripe Connect onboarding.
        setScreen('connect');
        break;
      default:
        Alert.alert('Coming soon', 'This demo focuses on Connect, OTP & payments.');
    }
  }

  function handleLock() {
    Alert.alert('Lock session', 'You will need your OTP again to unlock.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Lock', style: 'destructive', onPress: logout },
    ]);
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" backgroundColor={colors.background} />
      <View style={styles.container}>
        {phase === 'boot' && <View style={styles.container} />}

        {phase === 'login' && (
          <LoginScreen
            onSent={(p, otp) => {
              setPhone(p);
              setDevOtp(otp);
              setPhase('otp');
            }}
          />
        )}

        {phase === 'otp' && phone && (
          <OtpScreen
            phone={phone}
            maskedPhone={maskPhone(phone)}
            devOtp={devOtp}
            onVerified={handleVerified}
            onBack={() => setPhase('login')}
          />
        )}

        {phase === 'pin' && (
          <PinSetupScreen
            onDone={() => {
              setPinSet(true);
              setPhase('app');
              refresh();
            }}
          />
        )}

        {phase === 'app' && (
          <>
            {screen === 'home' && (
              <HomeScreen
                account={account}
                balance={balance}
                transactions={transactions}
                loading={loading}
                phone={phone ? maskPhone(phone) : null}
                pinSet={pinSet}
                onRefresh={refresh}
                navigate={setScreen}
                onQuickAction={handleQuickAction}
                onLock={handleLock}
              />
            )}
            {screen === 'connect' && (
              <ConnectScreen
                account={account}
                onChanged={setAccount}
                onRefresh={refresh}
              />
            )}
            {screen === 'upi' && <UpiPayScreen onPayTo={(u) => goPayTo(u)} />}
            {screen === 'qr' && (
              <QrScreen initialMode="scan" onPayTo={goPayTo} />
            )}
            {screen === 'pay' && (
              <PayScreen
                account={account}
                pinSet={pinSet}
                onPaid={handlePaid}
                navigate={setScreen}
                prefill={payPrefill}
                onPrefillApplied={() => setPayPrefill(null)}
                onOpenQr={() => setScreen('qr')}
              />
            )}
            {screen === 'history' && (
              <HistoryScreen
                transactions={transactions}
                loading={loading}
                onRefresh={refresh}
              />
            )}
            <TabBar
              active={
                screen === 'upi' || screen === 'qr' ? 'pay' : screen
              }
              onChange={setScreen}
            />
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1 },
});
