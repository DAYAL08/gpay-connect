/**
 * GPay Connect — sandbox API (no real money, no real keys).
 *
 * Security layers:
 *   1. CORS allow-list for the app origin
 *   2. Phone + OTP login with rate limiting and attempt caps
 *   3. HMAC-signed bearer session tokens (24h expiry)
 *   4. 6-digit UPI PIN required for every payment (hashed at rest,
 *      attempt counter with temporary lockout)
 *   5. Idempotency keys on payments (no double charges)
 *   6. HMAC-signed webhook verification (Stripe-style)
 *
 * Stripe Connect-shaped endpoints:
 *   GET/POST /v1/account            connected account
 *   POST     /v1/account/complete   finish simulated onboarding
 *   POST     /v1/account_links      hosted onboarding link
 *   GET      /v1/balance            available + pending balance
 *   POST     /v1/payment_intents    create a payment (auth + PIN)
 *   GET      /v1/payment_intents    list payments
 *   POST     /webhooks              signed webhook receiver
 *
 * Auth endpoints:
 *   POST /v1/auth/otp/send          request OTP
 *   POST /v1/auth/otp/verify        verify OTP -> session token
 *   GET  /v1/auth/session           current session (pinSet, expiry)
 *   POST /v1/auth/pin/set           set / change UPI PIN
 *   GET  /v1/security/overview      security posture of the session
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 4000;

const WEBHOOK_SECRET =
  process.env.STRIPE_WEBHOOK_SECRET || 'whsec_gpay_connect_demo';
const TOKEN_SECRET = process.env.APP_TOKEN_SECRET || 'dev_app_secret_change_me';

const OTP_TTL_MS = 2 * 60 * 1000;
const OTP_MAX_SENDS = 3; // per phone and per IP...
const OTP_WINDOW_MS = 10 * 60 * 1000;
const OTP_MAX_VERIFY_ATTEMPTS = 5;
const PIN_MAX_ATTEMPTS = 5;
const PIN_LOCK_MS = 5 * 60 * 1000;
const TOKEN_TTL_S = 24 * 60 * 60;

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const id = (prefix) => `${prefix}_${crypto.randomBytes(10).toString('hex')}`;
const delay = (ms = 250) => new Promise((r) => setTimeout(r, ms));

/** Stripe-style error envelope. */
function fail(res, status, type, message) {
  res.status(status).json({ error: { type, message } });
}

function safeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function normalizePhone(input) {
  let digits = String(input || '').replace(/[\s()-]/g, '');
  digits = digits.replace(/^\+91/, '').replace(/^0/, '');
  return /^\d{10}$/.test(digits) ? digits : null;
}

const maskPhone = (p) => `${p.slice(0, 2)}******${p.slice(-2)}`;

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

function hashPin(pin, salt) {
  const s = salt || crypto.randomBytes(16).toString('hex');
  return `${s}:${sha256(`${s}:${pin}`)}`;
}

function checkPin(user, pin) {
  if (!user.pinHash) return false;
  const salt = user.pinHash.split(':')[0];
  return safeEqual(hashPin(pin, salt), user.pinHash);
}

/** Sliding-window rate limiter. */
function createLimiter(max, windowMs) {
  const hits = new Map();
  return {
    ok(key) {
      const now = Date.now();
      const list = (hits.get(key) || []).filter((t) => now - t < windowMs);
      list.push(now);
      hits.set(key, list);
      return list.length <= max;
    },
    reset(key) {
      hits.delete(key);
    },
  };
}

const otpSendLimiter = createLimiter(OTP_MAX_SENDS, OTP_WINDOW_MS);
const otpVerifyLimiter = createLimiter(OTP_MAX_VERIFY_ATTEMPTS, OTP_WINDOW_MS);

/* ------------------------------------------------------------------ */
/* Session tokens (compact HMAC-signed JWT-style tokens)               */
/* ------------------------------------------------------------------ */

function signToken(payload) {
  const data = `v1.${Buffer.from(JSON.stringify(payload)).toString('base64url')}`;
  const sig = crypto
    .createHmac('sha256', TOKEN_SECRET)
    .update(data)
    .digest('base64url');
  return `${data}.${sig}`;
}

function verifyToken(token) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== 'v1') return null;
  const data = `${parts[0]}.${parts[1]}`;
  const expected = crypto
    .createHmac('sha256', TOKEN_SECRET)
    .update(data)
    .digest('base64url');
  if (!safeEqual(parts[2], expected)) return null;
  let payload;
  try {
    payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!payload.sub || !payload.exp || payload.exp * 1000 < Date.now()) {
    return null;
  }
  return payload;
}

/** Express middleware: require a valid bearer session token. */
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  const payload = verifyToken(token);
  if (!payload) {
    return fail(
      res,
      401,
      'authentication_error',
      'Session expired. Sign in again with your OTP.',
    );
  }
  req.phone = payload.sub;
  req.tokenPayload = payload;
  next();
}

/* ------------------------------------------------------------------ */
/* CORS (browser apps must be allowed explicitly)                      */
/* ------------------------------------------------------------------ */

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, Idempotency-Key',
  );
  res.setHeader('Access-Control-Max-Age', '86400');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Webhooks need the untouched raw payload for signature verification, so
// capture it before the JSON parser consumes the body stream.
app.use('/webhooks', express.raw({ type: '*/*' }));
app.use(express.json());

app.use((req, _res, next) => {
  if (req.method !== 'OPTIONS') {
    console.log(`${new Date().toISOString()}  ${req.method} ${req.url}`);
  }
  next();
});

/* ------------------------------------------------------------------ */
/* In-memory store (resets when the server restarts)                  */
/* ------------------------------------------------------------------ */

const store = {
  users: new Map(), // phone -> user record
  account: null,
  balance: { available: 0, pending: 0, currency: 'inr' },
  paymentIntents: [],
  idempotency: new Map(), // key -> { phone, intent }
  webhookLog: [],
};

/* Persist to disk so restarts don't wipe accounts, PINs or history. */
const DATA_FILE = path.join(__dirname, 'data.json');

function saveStore() {
  try {
    fs.writeFileSync(
      DATA_FILE,
      JSON.stringify({
        users: Array.from(store.users.entries()),
        account: store.account,
        balance: store.balance,
        paymentIntents: store.paymentIntents,
        idempotency: Array.from(store.idempotency.entries()),
        webhookLog: store.webhookLog.slice(-50),
      }),
    );
  } catch (err) {
    console.error('  ! failed to persist store:', err.message);
  }
}

function loadStore() {
  try {
    if (!fs.existsSync(DATA_FILE)) return;
    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    store.users = new Map(data.users || []);
    store.account = data.account ?? null;
    store.balance = data.balance ?? store.balance;
    store.paymentIntents = data.paymentIntents || [];
    store.idempotency = new Map(data.idempotency || []);
    store.webhookLog = data.webhookLog || [];
    console.log('  ↳ restored state from data.json');
  } catch (err) {
    console.error('  ! failed to load data.json:', err.message);
  }
}

function getUser(phone) {
  let user = store.users.get(phone);
  if (!user) {
    user = {
      phone,
      otp: null, // { code, expiresAt, attempts }
      pinHash: null,
      pinAttempts: 0,
      pinLockedUntil: 0,
      upiIds: [{ id: id('vpa'), upi: `${phone}@okgpay`, isDefault: true }],
      createdAt: Date.now(),
    };
    store.users.set(phone, user);
  }
  if (!user.upiIds || user.upiIds.length === 0) {
    user.upiIds = [{ id: id('vpa'), upi: `${phone}@okgpay`, isDefault: true }];
  }
  return user;
}

function requireAccount(_req, res, next) {
  if (!store.account) {
    return fail(res, 404, 'invalid_request_error', 'No connected account yet.');
  }
  next();
}

/* ------------------------------------------------------------------ */
/* Auth: OTP login                                                     */
/* ------------------------------------------------------------------ */

app.post('/v1/auth/otp/send', (req, res) => {
  const phone = normalizePhone(req.body && req.body.phone);
  if (!phone) {
    return fail(
      res,
      400,
      'invalid_request_error',
      'Enter a valid 10-digit mobile number.',
    );
  }
  const ip = req.ip || 'unknown';
  if (!otpSendLimiter.ok(phone) || !otpSendLimiter.ok(`ip:${ip}`)) {
    return fail(
      res,
      429,
      'rate_limit_error',
      'Too many OTP requests. Try again in 10 minutes.',
    );
  }

  const user = getUser(phone);
  const code = String(crypto.randomInt(100000, 1000000));
  user.otp = { code, expiresAt: Date.now() + OTP_TTL_MS, attempts: 0 };
  otpVerifyLimiter.reset(`verify:${phone}`);
  saveStore();

  console.log(`  → OTP for ${maskPhone(phone)}: ${code} (sandbox delivery)`);
  res.json({
    object: 'otp_challenge',
    maskedPhone: maskPhone(phone),
    expiresIn: OTP_TTL_MS / 1000,
    sandbox: true,
    devOtp: code, // real deployment would send this by SMS only
  });
});

app.post('/v1/auth/otp/verify', (req, res) => {
  const phone = normalizePhone(req.body && req.body.phone);
  const otp = String((req.body && req.body.otp) || '').trim();
  if (!phone || !/^\d{6}$/.test(otp)) {
    return fail(res, 400, 'invalid_request_error', 'Enter the 6-digit OTP.');
  }
  if (!otpVerifyLimiter.ok(`verify:${phone}`)) {
    return fail(
      res,
      429,
      'rate_limit_error',
      'Too many attempts. Request a new OTP.',
    );
  }

  const user = getUser(phone);
  if (!user.otp || user.otp.expiresAt < Date.now()) {
    user.otp = null;
    return fail(res, 400, 'invalid_request_error', 'OTP expired. Request a new one.');
  }
  user.otp.attempts += 1;
  if (!safeEqual(otp, user.otp.code)) {
    const left = Math.max(0, OTP_MAX_VERIFY_ATTEMPTS - user.otp.attempts);
    if (left === 0) user.otp = null;
    return fail(
      res,
      400,
      'invalid_otp',
      `Incorrect OTP.${left ? ` ${left} attempt(s) left.` : ''}`,
    );
  }

  user.otp = null;
  const now = Math.floor(Date.now() / 1000);
  const token = signToken({ sub: phone, iat: now, exp: now + TOKEN_TTL_S });
  saveStore();
  res.json({
    object: 'session',
    token,
    user: { phone: maskPhone(phone) },
    expiresAt: (now + TOKEN_TTL_S) * 1000,
  });
});

app.get('/v1/auth/session', requireAuth, (req, res) => {
  const user = getUser(req.phone);
  res.json({
    object: 'session',
    user: { phone: maskPhone(req.phone) },
    pinSet: !!user.pinHash,
    pinLocked: Date.now() < user.pinLockedUntil,
    expiresAt: req.tokenPayload.exp * 1000,
  });
});

app.post('/v1/auth/pin/set', requireAuth, (req, res) => {
  const user = getUser(req.phone);
  const pin = String((req.body && req.body.pin) || '');
  if (!/^\d{6}$/.test(pin)) {
    return fail(res, 400, 'invalid_request_error', 'PIN must be 6 digits.');
  }
  if (user.pinHash) {
    // Changing an existing PIN requires the current one.
    const oldPin = String((req.body && req.body.oldPin) || '');
    if (!checkPin(user, oldPin)) {
      return fail(res, 403, 'permission_error', 'Current PIN is incorrect.');
    }
  }
  user.pinHash = hashPin(pin);
  user.pinAttempts = 0;
  user.pinLockedUntil = 0;
  saveStore();
  res.json({ object: 'pin', pinSet: true });
});

app.get('/v1/security/overview', requireAuth, (req, res) => {
  const user = getUser(req.phone);
  res.json({
    object: 'security_overview',
    twoFactor: 'sms_otp',
    pinProtectedPayments: true,
    pinSet: !!user.pinHash,
    pinLocked: Date.now() < user.pinLockedUntil,
    tokenExpiresAt: req.tokenPayload.exp * 1000,
    rateLimits: {
      otpSendsPerWindow: OTP_MAX_SENDS,
      otpAttemptsPerWindow: OTP_MAX_VERIFY_ATTEMPTS,
      pinAttemptsBeforeLock: PIN_MAX_ATTEMPTS,
      windowMinutes: OTP_WINDOW_MS / 60000,
    },
  });
});

/* ------------------------------------------------------------------ */
/* UPI IDs (virtual payment addresses)                                */
/* ------------------------------------------------------------------ */

const UPI_RE = /^[a-z0-9._-]{2,64}@[a-z0-9]{2,32}$/i;

app.get('/v1/upi_ids', requireAuth, (req, res) => {
  const user = getUser(req.phone);
  res.json({ object: 'list', data: user.upiIds });
});

app.post('/v1/upi_ids', requireAuth, (req, res) => {
  const user = getUser(req.phone);
  const upi = String((req.body && req.body.upi) || '').toLowerCase().trim();
  if (!UPI_RE.test(upi)) {
    return fail(
      res,
      400,
      'invalid_request_error',
      'Use the format name@bank (e.g. arjun@oksbi).',
    );
  }
  if (user.upiIds.some((v) => v.upi === upi)) {
    return fail(res, 409, 'upi_exists', 'That UPI ID is already on your account.');
  }
  if (user.upiIds.length >= 5) {
    return fail(res, 429, 'limit_reached', 'You can hold at most 5 UPI IDs.');
  }
  const created = { id: id('vpa'), upi, isDefault: false };
  user.upiIds.push(created);
  saveStore();
  res.status(201).json(created);
});

app.post('/v1/upi_ids/:id/default', requireAuth, (req, res) => {
  const user = getUser(req.phone);
  const target = user.upiIds.find((v) => v.id === req.params.id);
  if (!target) return fail(res, 404, 'invalid_request_error', 'UPI ID not found.');
  user.upiIds.forEach((v) => {
    v.isDefault = v.id === target.id;
  });
  saveStore();
  res.json({ object: 'list', data: user.upiIds });
});

app.delete('/v1/upi_ids/:id', requireAuth, (req, res) => {
  const user = getUser(req.phone);
  const index = user.upiIds.findIndex((v) => v.id === req.params.id);
  if (index === -1) {
    return fail(res, 404, 'invalid_request_error', 'UPI ID not found.');
  }
  if (user.upiIds.length === 1) {
    return fail(res, 409, 'last_upi_id', 'You must keep at least one UPI ID.');
  }
  const [removed] = user.upiIds.splice(index, 1);
  if (removed.isDefault) {
    user.upiIds[0].isDefault = true;
  }
  saveStore();
  res.json({ deleted: true, data: user.upiIds });
});

/* ------------------------------------------------------------------ */
/* Accounts (Stripe Connect)                                           */
/* ------------------------------------------------------------------ */

app.get('/v1/account', requireAuth, (req, res) => {
  if (!store.account) {
    return fail(res, 404, 'invalid_request_error', 'No connected account yet.');
  }
  res.json(store.account);
});

app.post('/v1/account', requireAuth, async (req, res) => {
  await delay();
  const { email = '', country = 'IN', businessType = 'individual' } =
    req.body || {};

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return fail(res, 400, 'invalid_request_error', 'A valid email is required.');
  }
  if (!/^[A-Za-z]{2}$/.test(country)) {
    return fail(res, 400, 'invalid_request_error', 'country must be a 2-letter code.');
  }
  if (store.account) {
    // Stripe resumes the existing account when you call create again.
    return res.json(store.account);
  }

  store.account = {
    id: id('acct'),
    businessType,
    email,
    country: country.toUpperCase(),
    status: 'incomplete',
    chargesEnabled: false,
    payoutsEnabled: false,
    defaultCurrency: 'inr',
    createdAt: Date.now(),
  };
  saveStore();
  res.json(store.account);
});

app.post('/v1/account/complete', requireAuth, async (req, res) => {
  await delay(400);
  Object.assign(store.account, {
    status: 'active',
    chargesEnabled: true,
    payoutsEnabled: true,
  });
  if (store.balance.available === 0) {
    store.balance.available = 2500; // sandbox starting balance
  }
  saveStore();
  res.json(store.account);
});

app.post('/v1/account_links', requireAuth, async (req, res) => {
  await delay();
  res.json({
    id: id('link'),
    object: 'account_link',
    url: `http://localhost:${PORT}/onboarding/${store.account.id}`,
    expiresAt: Date.now() + 15 * 60 * 1000,
  });
});

/** Landing page for the simulated hosted onboarding flow. */
app.get('/onboarding/:accountId', (req, res) => {
  const acct =
    store.account && store.account.id === req.params.accountId
      ? store.account
      : null;
  res.type('html').send(`
    <!doctype html>
    <meta charset="utf-8" />
    <title>Stripe Connect Onboarding (Mock)</title>
    <body style="font-family: system-ui, sans-serif; max-width: 480px; margin: 48px auto; color: #202124;">
      <div style="width:48px;height:48px;border-radius:12px;background:#1a73e8;color:#fff;display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:700;">S</div>
      <h1 style="margin-top:16px;">Connect your account</h1>
      <p>This is a <b>mock</b> hosted onboarding page. No real data is collected.</p>
      ${
        acct
          ? `<p>Account: <code>${acct.id}</code><br/>Status: <b>${acct.status}</b></p>
             <p>Return to the app and press <b>Finish setup</b> to activate it.</p>`
          : `<p style="color:#d93025;">Unknown account.</p>`
      }
    </body>
  `);
});

/* ------------------------------------------------------------------ */
/* Balance                                                             */
/* ------------------------------------------------------------------ */

app.get('/v1/balance', requireAuth, requireAccount, (req, res) => {
  res.json(store.balance);
});

/* ------------------------------------------------------------------ */
/* PaymentIntents (auth + UPI PIN + idempotency)                       */
/* ------------------------------------------------------------------ */

app.get('/v1/payment_intents', requireAuth, requireAccount, (req, res) => {
  const data = [...store.paymentIntents].sort((a, b) => b.createdAt - a.createdAt);
  res.json({ object: 'list', data });
});

app.post('/v1/payment_intents', requireAuth, requireAccount, async (req, res) => {
  const user = getUser(req.phone);
  const key = req.headers['idempotency-key'];

  // Replay protection: same key returns the original result.
  if (key) {
    const cached = store.idempotency.get(String(key));
    if (cached && cached.phone === req.phone) {
      res.setHeader('Idempotent-Replay', 'true');
      return res.json(cached.intent);
    }
  }

  const {
    amount,
    description = 'Payment',
    recipient = 'unknown@upi',
    pin,
  } = req.body || {};

  if (!store.account.chargesEnabled) {
    return fail(
      res,
      402,
      'account_unverified',
      'Complete onboarding before accepting payments.',
    );
  }
  if (!Number.isFinite(amount) || amount <= 0 || amount > 100000) {
    return fail(
      res,
      400,
      'invalid_request_error',
      'amount must be between 1 and 100000.',
    );
  }

  // Layer: UPI PIN required for every payment.
  if (!user.pinHash) {
    return fail(res, 409, 'pin_not_set', 'Set your UPI PIN before paying.');
  }
  if (Date.now() < user.pinLockedUntil) {
    const mins = Math.ceil((user.pinLockedUntil - Date.now()) / 60000);
    return fail(
      res,
      429,
      'pin_locked',
      `Too many wrong PIN attempts. Locked for ~${mins} min.`,
    );
  }
  if (!checkPin(user, String(pin || ''))) {
    user.pinAttempts += 1;
    if (user.pinAttempts >= PIN_MAX_ATTEMPTS) {
      user.pinAttempts = 0;
      user.pinLockedUntil = Date.now() + PIN_LOCK_MS;
      saveStore();
      return fail(res, 429, 'pin_locked', 'PIN locked for 5 minutes.');
    }
    const left = PIN_MAX_ATTEMPTS - user.pinAttempts;
    saveStore();
    return fail(res, 403, 'invalid_pin', `Incorrect UPI PIN. ${left} attempt(s) left.`);
  }
  user.pinAttempts = 0;

  await delay(500);
  const intent = {
    id: id('pi'),
    object: 'payment_intent',
    amount: Math.round(amount),
    currency: 'inr',
    status: 'succeeded',
    description: String(description).slice(0, 60),
    recipient: String(recipient).slice(0, 60),
    createdAt: Date.now(),
  };

  store.paymentIntents.push(intent);
  store.balance.available += intent.amount;
  if (key) store.idempotency.set(String(key), { phone: req.phone, intent });
  saveStore();

  res.json(intent);
});

/* ------------------------------------------------------------------ */
/* Webhooks (Stripe-style signature verification)                     */
/* ------------------------------------------------------------------ */

function sign(payload, timestamp) {
  return crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(`${timestamp}.${payload}`)
    .digest('hex');
}

function verifySignature(rawBody, header) {
  if (!header) return false;
  const parts = Object.fromEntries(
    header.split(',').map((kv) => kv.split('=').map((s) => s.trim())),
  );
  const timestamp = Number(parts.t);
  if (!timestamp || Math.abs(Date.now() / 1000 - timestamp) > 300) return false;
  const expected = sign(rawBody, timestamp);
  return safeEqual(parts.v1 || '', expected);
}

app.post('/webhooks', (req, res) => {
  const raw = Buffer.isBuffer(req.body)
    ? req.body.toString('utf8')
    : JSON.stringify(req.body ?? null);
  if (!verifySignature(raw, req.headers['stripe-signature'])) {
    return fail(res, 400, 'signature_verification_error', 'Invalid signature.');
  }
  let event;
  try {
    event = JSON.parse(raw);
  } catch {
    return fail(res, 400, 'invalid_request_error', 'Malformed payload.');
  }
  store.webhookLog.push({ receivedAt: Date.now(), type: event.type });
  console.log(`  ↳ webhook received: ${event.type}`);
  res.json({ received: true });
});

/** Test helper: emit a signed webhook event. */
app.post('/v1/test_webhook', (req, res) => {
  const type = (req.body && req.body.type) || 'account.updated';
  const event = {
    id: id('evt'),
    object: 'event',
    type,
    created: Math.floor(Date.now() / 1000),
    data: { object: store.account },
  };
  const payload = JSON.stringify(event);
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = sign(payload, timestamp);

  fetch(`http://localhost:${PORT}/webhooks`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Stripe-Signature': `t=${timestamp},v1=${signature}`,
    },
    body: payload,
  }).catch(() => {});

  res.json({ queued: true, type });
});

app.get('/v1/test_webhooks', (req, res) => {
  res.json({ data: store.webhookLog.slice(-10).reverse() });
});

/* ------------------------------------------------------------------ */
/* Misc                                                                */
/* ------------------------------------------------------------------ */

app.get('/health', (req, res) => {
  res.json({ ok: true, mode: 'mock', account: store.account?.id ?? null });
});

app.use((req, res) =>
  fail(res, 404, 'invalid_request_error', `No route for ${req.method} ${req.path}`),
);

app.use((err, _req, res, _next) => {
  console.error(err);
  fail(res, 500, 'api_error', err.message || 'Internal error');
});

app.listen(PORT, () => {
  loadStore();
  console.log(`\n  GPay Connect API listening on http://localhost:${PORT}`);
  console.log('  Mode: sandbox (OTP + UPI PIN + signed sessions active)\n');
});
