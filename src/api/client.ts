import { session } from '../auth/session';
import type {
  AccountLink,
  Balance,
  ConnectedAccount,
  PaymentIntent,
} from '../types';

/**
 * Thin client for the Connect API.
 * Works against the bundled mock server (server/index.js) by default.
 * On a physical device, set the host to your machine's LAN IP.
 */
const HOST = process.env.EXPO_PUBLIC_API_HOST ?? 'http://localhost:4000';
const BASE = `${HOST}/v1`;

/** Error carrying the HTTP status so callers can branch on it. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly type = 'api_error',
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'DELETE';
  body?: unknown;
  idempotencyKey?: string;
  auth?: boolean;
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts.auth !== false) {
    const token = session.token();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  if (opts.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey;

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
  } catch {
    throw new ApiError('Cannot reach server. Is it running on port 4000?', 0, 'network');
  }

  const body = await res.json().catch(() => null);

  if (res.status === 401 && opts.auth !== false) {
    session.clear();
    session.notifyExpired();
  }
  if (!res.ok) {
    const message = body?.error?.message ?? `Request failed (${res.status})`;
    throw new ApiError(message, res.status, body?.error?.type);
  }
  return body as T;
}

export interface OtpChallenge {
  maskedPhone: string;
  expiresIn: number;
  devOtp: string;
  sandbox: boolean;
}

export interface SessionInfo {
  user: { phone: string };
  pinSet: boolean;
  pinLocked: boolean;
  expiresAt: number;
}

export interface SecurityOverview {
  twoFactor: string;
  pinProtectedPayments: boolean;
  pinSet: boolean;
  pinLocked: boolean;
  tokenExpiresAt: number;
  rateLimits: Record<string, number>;
}

export interface UpiId {
  id: string;
  upi: string;
  isDefault: boolean;
}

export const api = {
  /* ---------------------------- auth ---------------------------- */

  sendOtp(phone: string): Promise<OtpChallenge> {
    return request<OtpChallenge>('/auth/otp/send', {
      method: 'POST',
      body: { phone },
      auth: false,
    });
  },

  async verifyOtp(phone: string, otp: string): Promise<SessionInfo> {
    const res = await request<{ token: string } & SessionInfo>(
      '/auth/otp/verify',
      { method: 'POST', body: { phone, otp }, auth: false },
    );
    session.set(res.token, phone);
    return res;
  },

  getSession(): Promise<SessionInfo> {
    return request<SessionInfo>('/auth/session');
  },

  setPin(pin: string, oldPin?: string): Promise<{ pinSet: boolean }> {
    return request('/auth/pin/set', {
      method: 'POST',
      body: { pin, oldPin },
    });
  },

  securityOverview(): Promise<SecurityOverview> {
    return request<SecurityOverview>('/security/overview');
  },

  /* -------------------------- connect --------------------------- */

  /** GET /v1/account — returns null when no account exists yet. */
  async getAccount(): Promise<ConnectedAccount | null> {
    try {
      return await request<ConnectedAccount>('/account');
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) return null;
      throw err;
    }
  },

  createAccount(input: {
    email: string;
    country: string;
    businessType: 'individual' | 'company';
  }): Promise<ConnectedAccount> {
    return request<ConnectedAccount>('/account', {
      method: 'POST',
      body: input,
    });
  },

  completeOnboarding(): Promise<ConnectedAccount> {
    return request<ConnectedAccount>('/account/complete', { method: 'POST' });
  },

  createAccountLink(): Promise<AccountLink> {
    return request<AccountLink>('/account_links', { method: 'POST' });
  },

  /* -------------------------- payments -------------------------- */

  getBalance(): Promise<Balance> {
    return request<Balance>('/balance');
  },

  createPaymentIntent(
    input: { amount: number; description: string; recipient: string; pin: string },
    idempotencyKey: string,
  ): Promise<PaymentIntent> {
    return request<PaymentIntent>('/payment_intents', {
      method: 'POST',
      body: input,
      idempotencyKey,
    });
  },

  listPaymentIntents(): Promise<{ data: PaymentIntent[] }> {
    return request<{ data: PaymentIntent[] }>('/payment_intents');
  },

  /* --------------------------- UPI IDs --------------------------- */

  listUpiIds(): Promise<{ data: UpiId[] }> {
    return request<{ data: UpiId[] }>('/upi_ids');
  },

  addUpiId(upi: string): Promise<UpiId> {
    return request<UpiId>('/upi_ids', { method: 'POST', body: { upi } });
  },

  deleteUpiId(upiId: string): Promise<{ data: UpiId[] }> {
    return request(`/upi_ids/${encodeURIComponent(upiId)}`, { method: 'DELETE' });
  },

  setDefaultUpiId(upiId: string): Promise<{ data: UpiId[] }> {
    return request(`/upi_ids/${encodeURIComponent(upiId)}/default`, {
      method: 'POST',
    });
  },
};
