export type CashCurrency = 'KRW' | 'USD';

export interface CashBalance {
  id: string;
  user_id: string;
  balance: number;
  currency: CashCurrency;
  recorded_at: string;
}

export interface CashBalanceInput {
  balance: number;
  currency: CashCurrency;
  recorded_at?: string; // ISO 8601, 기본 now()
}
