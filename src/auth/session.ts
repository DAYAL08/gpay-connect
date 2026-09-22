/** Persists the signed session token + phone across reloads (web-safe). */

interface StoredSession {
  token: string;
  phone: string; // raw 10-digit number
}

const KEY = 'gpayconnect.session';

function read(): StoredSession | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSession;
    return parsed?.token && parsed?.phone ? parsed : null;
  } catch {
    return null;
  }
}

let current: StoredSession | null = read();

/** Called by the API client whenever the server answers 401. */
let onExpired: (() => void) | null = null;

export const session = {
  get(): StoredSession | null {
    return current;
  },
  token(): string | null {
    return current?.token ?? null;
  },
  phone(): string | null {
    return current?.phone ?? null;
  },
  set(token: string, phone: string) {
    current = { token, phone };
    try {
      localStorage?.setItem(KEY, JSON.stringify(current));
    } catch {
      /* private mode — memory only */
    }
  },
  clear() {
    current = null;
    try {
      localStorage?.removeItem(KEY);
    } catch {
      /* ignore */
    }
  },
  onExpired(fn: (() => void) | null) {
    onExpired = fn;
  },
  /** Notify listener that the token is no longer valid. */
  notifyExpired() {
    onExpired?.();
  },
};

/** 9876543210 -> 98******10 */
export function maskPhone(phone: string): string {
  if (phone.length < 4) return phone;
  return `${phone.slice(0, 2)}******${phone.slice(-2)}`;
}
