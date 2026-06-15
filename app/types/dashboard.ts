// ────────────────────────────────────────────
// 공통 열거형
// ────────────────────────────────────────────

export type AssetType = 'korean_stock' | 'us_stock' | 'crypto';
/**
 * Period: 이제 "집계 단위"를 나타낸다.
 * - 어느 단위에서든 전체 히스토리를 표시하며, 가로 스크롤로 탐색한다.
 * - 'all'은 제거되었다 (이슈 028).
 */
export type Period = 'day' | 'week' | 'month' | 'year';

/**
 * BucketUnit: 클라이언트 버킷팅에 사용하는 집계 단위 (Period와 동일 범주)
 */
export type BucketUnit = 'day' | 'week' | 'month' | 'year';

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
  /** 이슈 028: 배당 마커(●)만 반환. 출금 마커(▽)는 제거됨. */
  event_type: 'dividend';
  amount_krw: number;
}

// ────────────────────────────────────────────
// 클라이언트 버킷팅 결과
// ────────────────────────────────────────────

/**
 * BucketedSnapshot: 집계 단위로 버킷팅된 스냅샷.
 * 버킷 값은 버킷 내 마지막 스냅샷 값이다.
 */
export interface BucketedSnapshot {
  /** 버킷 대표 날짜 (일별: 해당일, 주별: 주 시작일(월요일), 월별: 월 첫째날, 연별: 연 첫째날) */
  bucket_date: string;
  /** X축 라벨 (일별·주별: MM.DD, 월별·연별: YY.MM 또는 YYYY) */
  x_label: string;
  total_value_krw: number;
  principal_krw: number;
  cash_krw: number;
  cash_usd: number;
  net_profit_krw: number;
  fx_rate_usd: number;
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
  /** 'realtime': 외부 API 성공, 'cached': 내부 캐시 사용 */
  source: 'realtime' | 'cached';
}

export interface MarketPriceFailedItem {
  ticker: string;
  asset_type: AssetType;
  reason: string;
}

export interface MarketPricesResponse {
  prices: MarketPriceItem[];
  /** 조회 실패 종목 목록. 부분 실패 시에도 HTTP 200으로 반환됨. */
  failed: MarketPriceFailedItem[];
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
  /**
   * 현재가 출처.
   * - 'baseline': prices 테이블 저장 종가 (EOD)
   * - 'realtime': 외부 API 실시간 조회 성공
   * - 'cached': Edge Function 내부 캐시 사용
   * - null: 현재가 없음
   */
  price_source: 'baseline' | 'realtime' | 'cached' | null;
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
// 스냅샷 새로고침 쿼터 (snapshot_refresh_quotas)
// ────────────────────────────────────────────

export interface SnapshotRefreshQuota {
  used_count: number;        // 오늘 소진한 횟수 (0~3)
  remaining: number;         // 남은 횟수 (= 3 − used_count)
  last_refreshed_at: string | null; // 마지막 갱신 시각. 오늘 미사용 시 null.
}

export interface RefreshTodaySnapshotResponse {
  snapshot: DailySnapshot;
  quota: SnapshotRefreshQuota;
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
