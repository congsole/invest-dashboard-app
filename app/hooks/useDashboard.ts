import { useCallback, useEffect, useState } from 'react';
import {
  getKpiSummary,
  getDailySnapshots,
  getHistoryMarkers,
  periodToDateRange,
} from '../services/dashboard';
import { getMarketPrices, getExchangeRate } from '../services/market';
import {
  AssetType,
  Period,
  KpiSummary,
  KpiCardData,
  HoldingCardData,
  DailySnapshot,
  HistoryMarker,
  ExchangeRateResponse,
} from '../types/dashboard';

// ────────────────────────────────────────────
// 빈 KPI 기본값
// ────────────────────────────────────────────

const EMPTY_KPI: KpiCardData = {
  totalValueKrw: 0,
  principalKrw: 0,
  netProfitKrw: 0,
  returnRatePct: 0,
  cashKrw: 0,
  cashUsd: 0,
  cashTotalKrw: 0,
  cumulativeDividendKrw: 0,
  cumulativeFeeKrw: 0,
  cumulativeTaxKrw: 0,
};

// ────────────────────────────────────────────
// 훅 결과 타입
// ────────────────────────────────────────────

interface UseDashboardResult {
  kpi: KpiCardData;
  holdings: HoldingCardData[];
  snapshots: DailySnapshot[];
  markers: HistoryMarker[];
  exchangeRate: ExchangeRateResponse | null;
  initialLoading: boolean;
  refreshing: boolean;
  historyLoading: boolean;
  error: string | null;
  refetch: () => void;
  fetchHistory: (period: Period, assetType?: AssetType | null) => void;
}

// ────────────────────────────────────────────
// KpiSummary → KpiCardData 변환
// ────────────────────────────────────────────

function toKpiCardData(summary: KpiSummary): KpiCardData {
  return {
    totalValueKrw: summary.total_value_krw,
    principalKrw: summary.principal_krw,
    netProfitKrw: summary.net_profit_krw,
    returnRatePct: summary.return_rate_pct,
    cashKrw: summary.cash.krw,
    cashUsd: summary.cash.usd,
    cashTotalKrw: summary.cash.total_krw,
    cumulativeDividendKrw: summary.cumulative_dividend_krw,
    cumulativeFeeKrw: summary.cumulative_fee_krw,
    cumulativeTaxKrw: summary.cumulative_tax_krw,
  };
}

// ────────────────────────────────────────────
// KpiHolding + 현재가 → HoldingCardData 변환
// ────────────────────────────────────────────

function buildHoldingCards(
  summary: KpiSummary,
  priceMap: Map<string, { price: number; currency: string; is_cached: boolean; fetched_at: string }>,
  fxRate: number,
): HoldingCardData[] {
  return summary.holdings.map((holding) => {
    const priceData = priceMap.get(holding.ticker) ?? null;
    const isKrw = holding.asset_type === 'korean_stock';

    // 현재가 (원 통화)
    const currentPriceOrig = priceData?.price ?? null;

    // 현재가 (KRW 환산)
    const currentPriceKrw =
      currentPriceOrig !== null
        ? isKrw
          ? currentPriceOrig
          : currentPriceOrig * fxRate
        : null;

    // 평균 매수가 KRW 환산
    const avgBuyPriceKrw = isKrw
      ? holding.avg_buy_price
      : holding.avg_buy_price * fxRate;

    // 평가금액 (KRW)
    const evaluatedAmount =
      currentPriceKrw !== null ? currentPriceKrw * holding.quantity : null;

    // 수익률
    const profitRate =
      currentPriceKrw !== null && avgBuyPriceKrw > 0
        ? ((currentPriceKrw - avgBuyPriceKrw) / avgBuyPriceKrw) * 100
        : null;

    // 평가손익 (KRW): 평가금액 − 투입 원금(avg_buy_price × quantity)
    const costKrw = avgBuyPriceKrw * holding.quantity;
    const profitAmount =
      evaluatedAmount !== null ? evaluatedAmount - costKrw : null;

    return {
      ticker: holding.ticker,
      name: holding.name,
      asset_type: holding.asset_type,
      quantity: holding.quantity,
      avg_buy_price: holding.avg_buy_price,
      avg_buy_price_krw: avgBuyPriceKrw,
      currency: holding.currency,
      current_price: currentPriceKrw,
      current_price_orig: currentPriceOrig,
      evaluated_amount: evaluatedAmount,
      profit_rate: profitRate,
      profit_amount: profitAmount,
      is_price_cached: priceData?.is_cached ?? false,
      price_fetched_at: priceData?.fetched_at ?? null,
    };
  });
}

// ────────────────────────────────────────────
// 훅
// ────────────────────────────────────────────

/**
 * 대시보드에 필요한 모든 데이터를 패칭하고 뷰 모델로 조합하는 훅.
 * - KPI 카드: get_kpi_summary RPC (현재가/환율 포함)
 * - 자산 히스토리: daily_snapshots REST + get_history_markers RPC
 * - 탭 필터링: 클라이언트 사이드로 처리 (holdings 필터), 그래프는 fetchHistory 재호출
 */
export function useDashboard(): UseDashboardResult {
  const [kpi, setKpi] = useState<KpiCardData>(EMPTY_KPI);
  const [holdings, setHoldings] = useState<HoldingCardData[]>([]);
  const [snapshots, setSnapshots] = useState<DailySnapshot[]>([]);
  const [markers, setMarkers] = useState<HistoryMarker[]>([]);
  const [exchangeRate, setExchangeRate] = useState<ExchangeRateResponse | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── KPI + 종목 데이터 패칭 ──
  const fetchData = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setInitialLoading(true);
    }
    setError(null);

    try {
      // 1) 환율 먼저 조회
      const rate = await getExchangeRate().catch((e) => {
        throw new Error(`[환율] ${e?.message}`);
      });
      setExchangeRate(rate);

      // 2) 전체 포트폴리오 기준 KPI 먼저 가져오기
      //    (현재가 없이 1차 호출 → holdings 목록 확보)
      const kpiRaw = await getKpiSummary(null, [], rate.rate).catch((e) => {
        throw new Error(`[KPI] ${e?.message}`);
      });

      if (kpiRaw.holdings.length === 0) {
        setKpi(toKpiCardData(kpiRaw));
        setHoldings([]);
        return;
      }

      // 3) 현재가 조회
      const tickerRequests = kpiRaw.holdings.map((h) => ({
        ticker: h.ticker,
        asset_type: h.asset_type,
      }));
      const { prices } = await getMarketPrices(tickerRequests).catch((e) => {
        throw new Error(`[현재가] ${e?.message}`);
      });

      // 4) 현재가 포함해 KPI 재계산
      const kpiFinal = await getKpiSummary(null, prices, rate.rate).catch((e) => {
        throw new Error(`[KPI 재계산] ${e?.message}`);
      });

      const priceMap = new Map(
        prices.map((p) => [
          p.ticker,
          { price: p.price, currency: p.currency, is_cached: p.is_cached, fetched_at: p.fetched_at },
        ]),
      );

      setKpi(toKpiCardData(kpiFinal));
      setHoldings(buildHoldingCards(kpiFinal, priceMap, rate.rate));
    } catch (e) {
      const msg = e instanceof Error ? e.message : '데이터를 불러오지 못했습니다';
      setError(msg);
    } finally {
      setInitialLoading(false);
      setRefreshing(false);
    }
  }, []);

  // ── 히스토리 그래프 데이터 패칭 ──
  const fetchHistory = useCallback(
    async (period: Period, _assetType: AssetType | null = null) => {
      // 'day' 기간은 daily_snapshots 미사용 (실시간 폴링 데이터)
      if (period === 'day') {
        setSnapshots([]);
        setMarkers([]);
        return;
      }

      setHistoryLoading(true);
      try {
        const { from, to } = periodToDateRange(period);
        const [snapshotData, markerData] = await Promise.all([
          getDailySnapshots(from, to),
          getHistoryMarkers(from, to),
        ]);
        setSnapshots(snapshotData);
        setMarkers(markerData);
      } catch (e) {
        console.warn('히스토리 로드 오류:', e);
      } finally {
        setHistoryLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    fetchHistory('month');
  }, [fetchHistory]);

  return {
    kpi,
    holdings,
    snapshots,
    markers,
    exchangeRate,
    initialLoading,
    refreshing,
    historyLoading,
    error,
    refetch: () => fetchData(true),
    fetchHistory,
  };
}
