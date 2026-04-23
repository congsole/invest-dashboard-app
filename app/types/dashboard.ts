// ────────────────────────────────────────────
// 공통 열거형
// ────────────────────────────────────────────

export type AssetType = 'korean_stock' | 'us_stock' | 'crypto';
export type TradeType = 'buy' | 'sell';
export type Period = 'day' | 'week' | 'month' | 'year';

// ────────────────────────────────────────────
// 포트폴리오 요약 (get_portfolio_summary RPC)
// ────────────────────────────────────────────

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

// ────────────────────────────────────────────
// 자산 히스토리 (get_asset_history RPC)
// ────────────────────────────────────────────

export interface AssetHistoryItem {
  bucket: string;           // ISO 8601
  total_invested: number;   // 누적 투입 원금 (KRW 환산)
  total_fee_tax: number;    // 누적 수수료 + 세금 (KRW 환산)
}

// ────────────────────────────────────────────
// 부문별 비중 (get_sector_allocation RPC)
// ────────────────────────────────────────────

export interface SectorAllocationItem {
  asset_type: AssetType;
  total_invested: number;
  ticker_count: number;
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
  current_price_usd: number | null; // 현재가 (USD, 미국주식/코인인 경우)
  evaluated_amount: number | null; // 평가금액 (원화)
  profit_rate: number | null;    // 수익률 (%)
  profit_amount: number | null;  // 평가손익 (원화)
  total_invested: number;
  is_price_cached: boolean;
  price_fetched_at: string | null;
}

// ────────────────────────────────────────────
// 매매 이벤트 입력 (바텀시트 폼)
// ────────────────────────────────────────────

export interface TradeEventInput {
  asset_type: AssetType;
  trade_type: TradeType;
  ticker: string;
  name: string;
  trade_date: string;             // YYYY-MM-DD
  quantity: number;
  price_per_unit: number;
  currency: string;
  fee: number;
  fee_currency: string;
  tax: number;
  settlement_amount: number;
}

export interface TradeEvent extends TradeEventInput {
  id: string;
  user_id: string;
  created_at: string;
}
