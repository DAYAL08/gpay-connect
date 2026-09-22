# GPay Connect

A GPay-style mobile payment app with a **Stripe Connect**-flavored API, running entirely in **sandbox/mock mode** — no API keys, no real money.

Built with **Expo / React Native + TypeScript** and a small **Express** backend that mirrors Stripe Connect's endpoint shapes.

## Features

- **GPay-style login** — phone number → OTP verification → session token
- **UPI PIN protection** — every payment requires a 6-digit PIN entered on a GPay-style keypad sheet (hashed at rest, 5 wrong attempts = 5-minute lock)
- **QR payments** — scan UPI QR codes with the camera (BarcodeDetector on web, paste fallback elsewhere) or show your own QR generated from your UPI ID
- **UPI ID management** — pay to any `name@bank` address; add, remove and set defaults across up to 5 of your own UPI IDs
- **GPay-style UI** — polished home dashboard with balance card (hide/show), security status strip, quick actions, people carousel, and recent activity
- **Stripe Connect onboarding** — create a connected account, generate an account link, and step through simulated hosted onboarding until the account is `active`
- **Payments** — PIN-authorized `PaymentIntent`s with idempotency keys (no double charges) and a success receipt
- **Transaction history** — tap any row for a full receipt (txn ID, status, method)
- **Security card** — live session security posture: 2FA, PIN state, token expiry, active rate limits
- **Persistent sandbox state** — accounts, PINs and history survive server restarts (`server/data.json`)
- **Signed webhooks** — Stripe-style `Stripe-Signature` HMAC verification, with a test-event simulator

## Security layers

| Layer | Implementation |
| ----- | -------------- |
| CORS allow-list | Browser origins allowed explicitly; preflight handled |
| OTP login | 6-digit code, 2-min expiry, 3 sends/10 min, 5 verify attempts |
| Session tokens | HMAC-signed bearer tokens, 24-hour expiry, verified in constant time |
| UPI PIN | Salted SHA-256 hash, required on every payment, lockout after 5 wrong tries |
| Idempotency | `Idempotency-Key` header replays the original result instead of recharging |
| Webhook signatures | Stripe-style HMAC over `timestamp.payload`, 5-minute tolerance |

## Project structure

```
gpay-connect/
├── App.tsx                  # App shell: state + tab navigation
├── index.ts                 # Expo entry point
├── src/
│   ├── api/client.ts        # Typed client with token + idempotency handling
│   ├── auth/session.ts      # Signed-token persistence (localStorage-safe)
│   ├── components/          # ActionTile, Button, Card, OtpInput, PinSheet, TabBar
│   ├── data/mock.ts         # Demo contacts & quick actions
│   ├── screens/             # Login, Otp, PinSetup, Home, Connect, Pay, History
│   ├── theme.ts             # GPay-inspired colors, spacing, type scale
│   └── types.ts             # Shared API types
└── server/
    └── index.js             # Mock Stripe Connect API (Express)
```

## Getting started

Requires Node.js 18+.

```bash
# 1. Install app dependencies
npm install

# 2. Install & start the mock API (terminal 1)
cd server && npm install && npm start
# → http://localhost:4000

# 3. Start the app (terminal 2)
npm start
```

Then scan the QR code with the **Expo Go** app (Android/iOS), or press `a` / `i` for an emulator.

### Running on a physical device

The app calls `http://localhost:4000` by default, which won't resolve from a
phone. Point it at your machine's LAN IP:

```bash
EXPO_PUBLIC_API_HOST=http://192.168.1.5:4000 npm start
```

## API reference (mock)

### Auth

| Method | Path                    | Auth | Description                                  |
| ------ | ----------------------- | ---- | -------------------------------------------- |
| POST   | `/v1/auth/otp/send`     | —    | Request OTP (rate-limited, returns `devOtp`) |
| POST   | `/v1/auth/otp/verify`   | —    | Verify OTP → session token                   |
| GET    | `/v1/auth/session`      | token| Session state (`pinSet`, expiry)             |
| POST   | `/v1/auth/pin/set`      | token| Set (or change) the 6-digit UPI PIN          |
| GET    | `/v1/security/overview` | token | Security posture + active rate limits      |
| GET    | `/v1/upi_ids`           | token | List your UPI IDs (one is default)         |
| POST   | `/v1/upi_ids`           | token | Add a UPI ID (max 5, format validated)     |
| POST   | `/v1/upi_ids/:id/default` | token | Make a UPI ID the default               |
| DELETE | `/v1/upi_ids/:id`       | token | Remove a UPI ID (last one is protected)    |

### Connect / payments

| Method | Path                     | Auth                        | Description                    |
| ------ | ------------------------ | --------------------------- | ------------------------------ |
| GET    | `/v1/account`            | token                       | Connected account (404 if none)|
| POST   | `/v1/account`            | token                       | Create connected account       |
| POST   | `/v1/account/complete`   | token                       | Finish onboarding → `active`   |
| POST   | `/v1/account_links`      | token                       | Hosted onboarding link         |
| GET    | `/v1/balance`            | token                       | Available + pending balance    |
| POST   | `/v1/payment_intents`    | token + PIN + `Idempotency-Key` | Create a payment         |
| GET    | `/v1/payment_intents`    | token                       | List payments                  |
| POST   | `/webhooks`              | HMAC signature              | Receive signed Stripe events   |
| GET    | `/health`                | —                           | Liveness check                 |

### Demo flow

1. **Login** → enter any 10-digit number → tap the sandbox OTP hint → verified
2. **Create UPI PIN** → enter 6 digits twice on the keypad
3. **Connect** tab → *Connect account* → step through onboarding → *Finish setup*
4. **Pay** tab → pick a contact → enter an amount → **Pay** → enter your UPI PIN → receipt
5. **QR** tile → *Scan code* (camera or paste `upi://pay?pa=…`) / *My QR code* → pay flow is prefilled
6. **UPI ID** tile → pay to any `name@bank`, or manage your own UPI IDs
7. **Home** / **History** → balance and transactions update; tap a row for its receipt; **Lock** signs you out

## Going to real Stripe later

The server intentionally keeps Stripe's shapes (`acct_…`, `pi_…`,
`account_links`, signed webhooks). To go live:

1. `npm install stripe` in `server/`
2. Replace the in-memory store calls with `stripe.accounts.*`,
   `stripe.accountLinks.create`, `stripe.paymentIntents.create`
3. Set `STRIPE_SECRET_KEY` and verify webhooks with
   `stripe.webhooks.constructEvent` instead of the local HMAC helper

No app-side changes are required beyond the base URL.

## Resetting state

The backend stores everything in memory — restart `npm run server` to reset the
account, balance, and transaction history.
