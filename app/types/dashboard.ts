// ────────────────────────────────────────────
// 공통 열거형
// ────────────────────────────────────────────

export type AssetType = 'korean_stock' | 'us_stock' | 'crypto';
export type Period = 'day' | 'week' | 'month' | 'year' | 'all';

// ────────────────────────────────────────────
// KPI 데이터 (get_kpi_summary RPC)
// ────────────────────────────────────────────

export interface KpiHolding {
  ticker: string;
  name: string;
  asset_type: AssetType;
  quantity: number;
  avg_buy_price: number;
  currency: string;
  total_fee: number;
  total_tax: number;
}

export interface KpiSummary {
  // 1차 행 KPI
  total_value_krw: number;
  principal_krw: number;
  net_profit_krw: number;
  return_rate_pct: number;

  // 2차 행 KPI
  cash: {
    krw: number;
    usd: number;
    total_krw: number;
  };
  cumulative_dividend_krw: number;
  cumulative_fee_krw: number;
  cumulative_tax_krw: number;

  // 종목별 집계
  holdings: KpiHolding[];
}

// ────────────────────────────────────────────
// 자산 히스토리 (daily_snapshots REST)
// ────────────────────────────────────────────

export interface DailySnapshot {
  snapshot_date: string; // YYYY-MM-DD
  total_value_krw: number;
  principal_krw: number;
  cash_krw: number;
  cash_usd: number;
  net_profit_krw: number;
  fx_rate_usd: number;
}

export interface HistoryMarker {
  event_date: string; // YYYY-MM-DD
  event_type: 'dividend' | 'withdraw';
  amount_krw: number;
}

// ────────────────────────────────────────────
// 현재가 (get-market-prices Edge Function)
// ────────────────────────────────────────────

export interface MarketPriceItem {
  ticker: string;
  asset_type: AssetType;
  price: number;
  currency: string;
  fetched_at: string;
  is_cached: boolean;
}

export interface MarketPricesResponse {
  prices: MarketPriceItem[];
}

// ────────────────────────────────────────────
// 환율 (get-exchange-rate Edge Function)
// ────────────────────────────────────────────

export interface ExchangeRateResponse {
  from: string;
  to: string;
  rate: number;
  fetched_at: string;
  is_cached: boolean;
}

// ────────────────────────────────────────────
// 종목 카드 뷰 모델 (현재가, 수익률 계산 후)
// ────────────────────────────────────────────

export interface HoldingCardData {
  ticker: string;
  name: string;
  asset_type: AssetType;
  quantity: number;
  avg_buy_price: number;
  avg_buy_price_krw: number;     // 원화 환산 평균 매수가
  currency: string;
  current_price: number | null;  // 현재가 (원화)
  current_price_orig: number | null; // 현재가 (원 통화: USD 또는 KRW)
  evaluated_amount: number | null; // 평가금액 (원화)
  profit_rate: number | null;    // 수익률 (%)
  profit_amount: number | null;  // 평가손익 (원화)
  is_price_cached: boolean;
  price_fetched_at: string | null;
}

// ────────────────────────────────────────────
// KPI 카드 표시용 뷰 모델
// ────────────────────────────────────────────

export interface KpiCardData {
  totalValueKrw: number;
  principalKrw: number;
  netProfitKrw: number;
  returnRatePct: number;
  cashKrw: number;
  cashUsd: number;
  cashTotalKrw: number;
  cumulativeDividendKrw: number;
  cumulativeFeeKrw: number;
  cumulativeTaxKrw: number;
}

// ────────────────────────────────────────────
// (레거시 — 하위 호환용, 점진적 제거 예정)
// ────────────────────────────────────────────

/** @deprecated 이슈 008 이후 KpiHolding 사용 */
export interface PortfolioSummaryItem {
  ticker: string;
  name: string;
  asset_type: AssetType;
  quantity: number;
  avg_buy_price: number;
  currency: string;
  total_invested: number;
  total_fee: number;
  total_tax: number;
}

/** @deprecated 이슈 008 이후 DailySnapshot 사용 */
export interface AssetHistoryItem {
  bucket: string;
  total_invested: number;
  total_fee_tax: number;
}

/** @deprecated 이슈 008 이후 제거 */
export interface SectorAllocationItem {
  asset_type: AssetType;
  total_invested: number;
  ticker_count: number;
}

/** @deprecated 이슈 008에서 accountEvent 타입으로 이동 */
export type TradeType = 'buy' | 'sell';

/** @deprecated 이슈 008에서 accountEvent 타입으로 이동 */
export interface TradeEventInput {
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

/** @deprecated 이슈 008에서 accountEvent 타입으로 이동 */
export interface TradeEvent extends TradeEventInput {
  id: string;
  user_id: string;
  created_at: string;
}
