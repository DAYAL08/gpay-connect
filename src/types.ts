/** Shared types mirroring the Stripe Connect-style API. */

export type AccountStatus = 'not_created' | 'incomplete' | 'active';

export interface ConnectedAccount {
  id: string;
  businessType: 'individual' | 'company';
  email: string;
  country: string;
  status: AccountStatus;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  defaultCurrency: string;
  createdAt: number;
}

export interface AccountLink {
  id: string;
  url: string;
  expiresAt: number;
}

export interface Balance {
  available: number;
  pending: number;
  currency: string;
}

export type PaymentIntentStatus =
  | 'requires_payment_method'
  | 'processing'
  | 'succeeded'
  | 'canceled';

export interface PaymentIntent {
  id: string;
  amount: number;
  currency: string;
  status: PaymentIntentStatus;
  description: string;
  recipient: string;
  createdAt: number;
}

export interface ApiError {
  error: {
    type: string;
    message: string;
  };
}

export type ScreenName = 'home' | 'connect' | 'pay' | 'history' | 'upi' | 'qr';
