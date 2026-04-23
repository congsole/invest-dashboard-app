// TradeEvent 공통 타입 정의
// api-spec.md 기반

export type AssetType = 'korean_stock' | 'us_stock' | 'crypto';
export type TradeType = 'buy' | 'sell';

export interface TradeEvent {
  id: string;
  user_id: string;
  asset_type: AssetType;
  trade_type: TradeType;
  ticker: string;
  name: string;
  trade_date: string; // YYYY-MM-DD
  quantity: number;
  price_per_unit: number;
  currency: string; // 'KRW' | 'USD' | 코인티커
  fee: number;
  fee_currency: string;
  tax: number;
  settlement_amount: number;
  created_at: string;
}

export interface TradeEventInput {
  asset_type: AssetType;
  trade_type: TradeType;
  ticker: string;
  name: string;
  trade_date: string;
  quantity: number;
  price_per_unit: number;
  currency: string;
  fee?: number;
  fee_currency?: string;
  tax?: number;
  settlement_amount: number;
}

export interface TradeEventUpdateInput {
  asset_type?: AssetType;
  trade_type?: TradeType;
  ticker?: string;
  name?: string;
  trade_date?: string;
  quantity?: number;
  price_per_unit?: number;
  currency?: string;
  fee?: number;
  fee_currency?: string;
  tax?: number;
  settlement_amount?: number;
}

export interface TradeEventFilters {
  asset_type?: AssetType;
  trade_type?: TradeType;
  ticker?: string;
  from?: string; // YYYY-MM-DD
  to?: string;   // YYYY-MM-DD
}

export interface CsvPreviewRow {
  row: number;
  asset_type: AssetType;
  trade_type: TradeType;
  ticker: string;
  name: string;
  trade_date: string;
  quantity: number;
  price_per_unit: number;
  currency: string;
  fee: number;
  fee_currency: string;
  tax: number;
  settlement_amount: number;
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
  failed: CsvParseError[];
}
