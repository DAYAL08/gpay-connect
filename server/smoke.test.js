/**
 * Zero-dependency smoke test for the GPay Connect API.
 * Boots the server on an isolated port with a temp data file, exercises the
 * full security + payments flow, then reports PASS/FAIL (exit 1 on failure).
 *
 * Run: node smoke.test.js
 */

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PORT = process.env.SMOKE_PORT || 4310;
const BASE = `http://localhost:${PORT}`;
const PHONE = '7000000001';
const PIN = '482916';

let pass = 0;
let fail = 0;

function check(name, cond, extra) {
  if (cond) {
    pass += 1;
    console.log(`PASS  ${name}`);
  } else {
    fail += 1;
    console.log(`FAIL  ${name}${extra ? ` — ${extra}` : ''}`);
  }
}

async function req(pathname, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  try {
    const res = await fetch(`${BASE}${pathname}`, {
      method: opts.method || 'GET',
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
    const json = await res.json().catch(() => null);
    return { status: res.status, body: json };
  } catch (err) {
    return { status: 0, body: null, error: String(err) };
  }
}

async function waitForServer() {
  for (let i = 0; i < 50; i++) {
    const r = await req('/health');
    if (r.status === 200) return true;
    await new Promise((r2) => setTimeout(r2, 300));
  }
  return false;
}

async function main() {
  const dataFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gpay-')), 'data.json');
  const server = spawn(process.execPath, [path.join(__dirname, 'index.js')], {
    env: { ...process.env, PORT: String(PORT), DATA_FILE: dataFile },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', () => {});
  server.stderr.on('data', (d) => process.stderr.write(d));

  try {
    if (!(await waitForServer())) {
      console.error('server did not start');
      process.exit(1);
    }

    // --- health & CORS
    const h = await req('/health');
    check('health', h.status === 200 && h.body.ok === true);

    const pre = await fetch(`${BASE}/v1/balance`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:8081',
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'authorization',
      },
    });
    check(
      'CORS preflight',
      pre.status === 204 &&
        pre.headers.get('access-control-allow-origin') === 'http://localhost:8081',
    );

    // --- auth
    const unauth = await req('/v1/balance');
    check('unauthorized -> 401', unauth.status === 401);

    const otpSend = await req('/v1/auth/otp/send', {
      method: 'POST',
      body: { phone: PHONE },
    });
    check(
      'OTP send',
      otpSend.status === 200 && /^\d{6}$/.test(otpSend.body.devOtp),
    );

    const wrong = await req('/v1/auth/otp/verify', {
      method: 'POST',
      body: { phone: PHONE, otp: '000000' },
    });
    check('wrong OTP -> 400', wrong.status === 400);

    const verify = await req('/v1/auth/otp/verify', {
      method: 'POST',
      body: { phone: PHONE, otp: otpSend.body.devOtp },
    });
    const token = verify.body && verify.body.token;
    check('OTP verify -> token', verify.status === 200 && !!token);
    const auth = { Authorization: `Bearer ${token}` };

    const tampered = await req('/v1/balance', {
      headers: { Authorization: `Bearer ${token}x` },
    });
    check('tampered token -> 401', tampered.status === 401);

    const session = await req('/v1/auth/session', { headers: auth });
    check('session pinSet=false', session.status === 200 && session.body.pinSet === false);

    const sec = await req('/v1/security/overview', { headers: auth });
    check('security overview', sec.status === 200 && sec.body.twoFactor === 'sms_otp');

    // --- UPI IDs
    const ids = await req('/v1/upi_ids', { headers: auth });
    check(
      'default UPI ID seeded',
      ids.status === 200 &&
        ids.body.data.length === 1 &&
        ids.body.data[0].upi === `${PHONE}@okgpay` &&
        ids.body.data[0].isDefault,
    );

    const added = await req('/v1/upi_ids', {
      method: 'POST',
      headers: auth,
      body: { upi: 'smoke@testbank' },
    });
    check('add UPI ID', added.status === 201 && added.body.upi === 'smoke@testbank');

    const dup = await req('/v1/upi_ids', {
      method: 'POST',
      headers: auth,
      body: { upi: 'smoke@testbank' },
    });
    check('duplicate UPI -> 409', dup.status === 409);

    const badUpi = await req('/v1/upi_ids', {
      method: 'POST',
      headers: auth,
      body: { upi: 'not a upi!' },
    });
    check('invalid UPI -> 400', badUpi.status === 400);

    const del = await req(`/v1/upi_ids/${added.body.id}`, {
      method: 'DELETE',
      headers: auth,
    });
    check(
      'delete UPI + default reassigned',
      del.status === 200 && del.body.data.length === 1 && del.body.data[0].isDefault,
    );

    // --- Stripe Connect
    const acct = await req('/v1/account', {
      method: 'POST',
      headers: auth,
      body: { email: 'smoke@example.com', country: 'IN', businessType: 'individual' },
    });
    check('create account', acct.status === 200 && /^acct_/.test(acct.body.id));

    const done = await req('/v1/account/complete', { method: 'POST', headers: auth });
    check('onboarding complete', done.status === 200 && done.body.status === 'active');

    // --- payments
    const noPin = await req('/v1/payment_intents', {
      method: 'POST',
      headers: auth,
      body: { amount: 100, pin: '123456', recipient: 'a@b' },
    });
    check('payment without PIN -> 409', noPin.status === 409);

    const pinSet = await req('/v1/auth/pin/set', {
      method: 'POST',
      headers: auth,
      body: { pin: PIN },
    });
    check('set UPI PIN', pinSet.status === 200 && pinSet.body.pinSet === true);

    const wrongPin = await req('/v1/payment_intents', {
      method: 'POST',
      headers: auth,
      body: { amount: 100, pin: '000000', recipient: 'a@b' },
    });
    check('wrong PIN -> 403', wrongPin.status === 403);

    const bigAmount = await req('/v1/payment_intents', {
      method: 'POST',
      headers: auth,
      body: { amount: 999999, pin: PIN, recipient: 'a@b' },
    });
    check('oversized amount -> 400', bigAmount.status === 400);

    const idemHeaders = { ...auth, 'Idempotency-Key': 'smoke_ik_1' };
    const pay = await req('/v1/payment_intents', {
      method: 'POST',
      headers: idemHeaders,
      body: { amount: 250, pin: PIN, recipient: 'aarav@okaxis', description: 'Smoke' },
    });
    check('payment succeeds', pay.status === 200 && pay.body.status === 'succeeded');

    const replay = await req('/v1/payment_intents', {
      method: 'POST',
      headers: idemHeaders,
      body: { amount: 250, pin: PIN, recipient: 'aarav@okaxis' },
    });
    check('idempotent replay', replay.status === 200 && replay.body.id === pay.body.id);

    const bal = await req('/v1/balance', { headers: auth });
    check('balance = 2500 + 250', bal.status === 200 && bal.body.available === 2750);

    const list = await req('/v1/payment_intents', { headers: auth });
    check('history lists payment', list.status === 200 && list.body.data.length >= 1);

    // --- webhooks
    const hook = await req('/v1/test_webhook', {
      method: 'POST',
      body: { type: 'account.updated' },
    });
    await new Promise((r) => setTimeout(r, 800));
    const hooks = await req('/v1/test_webhooks');
    check(
      'signed webhook received',
      hook.status === 200 &&
        hooks.status === 200 &&
        hooks.body.data.some((e) => e.type === 'account.updated'),
    );

    const badHook = await fetch(`${BASE}/webhooks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'forged' }),
    });
    check('forged webhook -> 400', badHook.status === 400);
  } finally {
    server.kill();
  }

  console.log(`\n===== ${pass} passed, ${fail} failed =====`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
