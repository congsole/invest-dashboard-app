// AccountEvent 공통 타입 정의
// api-spec.md — AccountEvent 섹션 기반 (이슈 008)

export type EventType = 'buy' | 'sell' | 'deposit' | 'withdraw' | 'dividend';
export type AssetType = 'korean_stock' | 'us_stock' | 'crypto' | 'cash';

export interface AccountEvent {
  id: string;
  user_id: string;
  event_type: EventType;
  event_date: string; // YYYY-MM-DD
  asset_type: AssetType | null;
  ticker: string | null;
  name: string | null;
  quantity: number | null;
  price_per_unit: number | null;
  currency: string; // 'KRW' | 'USD' | 코인티커
  fee: number;
  fee_currency: string | null;
  tax: number;
  amount: number;
  fx_rate_at_event: number | null;
  source: 'csv' | 'manual';
  external_ref: string | null;
  created_at: string;
}

// 매수/매도 입력
export interface BuySellEventInput {
  event_type: 'buy' | 'sell';
  event_date: string;
  asset_type: 'korean_stock' | 'us_stock' | 'crypto';
  ticker: string;
  name: string;
  quantity: number;
  price_per_unit: number;
  currency: string;
  fee: number;
  fee_currency: string;
  tax: number;
  amount: number; // 정산금액 (통화 단위)
  fx_rate_at_event?: number | null;
  source: 'manual';
}

// 입금 입력
export interface DepositEventInput {
  event_type: 'deposit';
  event_date: string;
  currency: 'KRW' | 'USD';
  amount: number;
  fx_rate_at_event: number; // 필수
  source: 'manual';
}

// 출금 입력
export interface WithdrawEventInput {
  event_type: 'withdraw';
  event_date: string;
  currency: 'KRW' | 'USD';
  amount: number;
  fx_rate_at_event: number; // 필수
  source: 'manual';
}

// 배당 입력
export interface DividendEventInput {
  event_type: 'dividend';
  event_date: string;
  ticker?: string | null;
  name?: string | null;
  currency: string;
  amount: number; // 세후 금액
  tax: number; // 원천징수 세금
  fx_rate_at_event?: number | null;
  source: 'manual';
}

export type AccountEventInput =
  | BuySellEventInput
  | DepositEventInput
  | WithdrawEventInput
  | DividendEventInput;

// 수정 입력 (모든 필드 optional)
export interface AccountEventUpdateInput {
  event_type?: EventType;
  event_date?: string;
  asset_type?: AssetType | null;
  ticker?: string | null;
  name?: string | null;
  quantity?: number | null;
  price_per_unit?: number | null;
  currency?: string;
  fee?: number;
  fee_currency?: string | null;
  tax?: number;
  amount?: number;
  fx_rate_at_event?: number | null;
  source?: 'csv' | 'manual';
  external_ref?: string | null;
}

// CSV 관련
export interface CsvPreviewRow {
  row: number;
  event_type: EventType;
  event_date: string;
  asset_type: AssetType | null;
  ticker: string | null;
  name: string | null;
  quantity: number | null;
  price_per_unit: number | null;
  currency: string;
  fee: number;
  fee_currency: string | null;
  tax: number;
  amount: number;
  fx_rate_at_event: number | null;
  external_ref: string | null;
}

export interface CsvParseError {
  row: number;
  reason: string;
}

export interface CsvPreviewResult {
  preview: CsvPreviewRow[];
  errors: CsvParseError[];
  total_rows: number;
  parsed_rows: number;
  failed_rows: number;
}

export interface CsvConfirmResult {
  inserted: number;
  skipped: number;
  failed: CsvParseError[];
}

export interface AccountEventFilters {
  event_type?: EventType;
  asset_type?: AssetType;
  ticker?: string;
  from?: string; // YYYY-MM-DD
  to?: string;   // YYYY-MM-DD
}
