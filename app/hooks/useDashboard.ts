import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getKpiSummary,
  getDailySnapshots,
  getHistoryMarkers,
} from '../services/dashboard';
import { getMarketPrices, getBaselinePrices, getExchangeRate } from '../services/market';
import {
  AssetType,
  KpiSummary,
  KpiCardData,
  HoldingCardData,
  DailySnapshot,
  HistoryMarker,
  ExchangeRateResponse,
  MarketPriceItem,
} from '../types/dashboard';

// ────────────────────────────────────────────
// 상수
// ────────────────────────────────────────────

/** 미국주식 청크당 최대 종목 수 (Twelve Data 분당 8크레딧 제약) */
const US_STOCK_CHUNK_SIZE = 8;

/** 청크 사이 대기 시간 (ms) */
const CHUNK_DELAY_MS = 60_000;

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
  /** 전체 기간 스냅샷 원본 데이터 (클라이언트 버킷팅에 사용) */
  snapshots: DailySnapshot[];
  markers: HistoryMarker[];
  exchangeRate: ExchangeRateResponse | null;
  initialLoading: boolean;
  refreshing: boolean;
  historyLoading: boolean;
  /** 실시간 가격 청크 로딩 중 여부 */
  priceUpdating: boolean;
  error: string | null;
  refetch: () => void;
  /** @deprecated 이슈 028: period는 집계 단위로 변경됨. 호출 불필요 — 버킷팅은 컴포넌트에서 처리. */
  fetchHistory: (assetType?: AssetType | null) => void;
}

// ────────────────────────────────────────────
// priceMap 타입
// ────────────────────────────────────────────

type PriceMapValue = {
  price: number;
  currency: string;
  is_cached: boolean;
  fetched_at: string;
  /** 가격 출처: baseline = 저장 종가, realtime = 실시간 조회, cached = 엣지 함수 캐시 */
  source: 'baseline' | 'realtime' | 'cached';
};

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
  priceMap: Map<string, PriceMapValue>,
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
      price_source: priceData?.source ?? null,
    };
  });
}

// ────────────────────────────────────────────
// priceMap 병합 헬퍼
// ────────────────────────────────────────────

/**
 * 응답 prices + failed 배열을 기존 priceMap에 병합한다.
 * - 성공 종목: 실시간 가격으로 덮어씀
 * - failed 종목: 기존 baseline/cached 값을 유지 (빈칸 금지)
 */
function mergePriceMap(
  base: Map<string, PriceMapValue>,
  prices: MarketPriceItem[],
): Map<string, PriceMapValue> {
  const next = new Map(base);
  for (const p of prices) {
    next.set(p.ticker, {
      price: p.price,
      currency: p.currency,
      is_cached: p.is_cached,
      fetched_at: p.fetched_at,
      source: p.source,
    });
  }
  return next;
}

// ────────────────────────────────────────────
// delay 헬퍼
// ────────────────────────────────────────────

/**
 * ms 밀리초 대기한다. signal.cancelled가 true면 즉시 reject한다.
 * 언마운트/refetch 시 clearTimeout으로 타이머를 즉시 해제한다.
 * signal 객체에 cancel() 핸들러를 등록하여 외부에서 즉시 취소가 가능하도록 한다.
 */
function delay(
  ms: number,
  signal: { cancelled: boolean; cancelDelay?: () => void },
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.cancelled) {
      reject(new Error('cancelled'));
      return;
    }
    const timerId = setTimeout(resolve, ms);
    // 외부에서 signal.cancelDelay()를 호출하면 타이머를 즉시 해제하고 reject한다
    signal.cancelDelay = () => {
      clearTimeout(timerId);
      reject(new Error('cancelled'));
    };
  });
}

// ────────────────────────────────────────────
// 청크 분할 헬퍼
// ────────────────────────────────────────────

/**
 * 보유 종목을 청크 배열로 분할한다.
 *
 * 청크 전략:
 * - 첫 청크: 한국주식 전체 + 코인 전체 + 미국주식 최대 8개
 * - 2번째 청크부터: 미국주식 잔여분을 8개씩
 */
function buildChunks(
  holdings: Array<{ ticker: string; asset_type: AssetType }>,
): Array<Array<{ ticker: string; asset_type: AssetType }>> {
  const korean = holdings.filter((h) => h.asset_type === 'korean_stock');
  const crypto = holdings.filter((h) => h.asset_type === 'crypto');
  const usStocks = holdings.filter((h) => h.asset_type === 'us_stock');

  const chunks: Array<Array<{ ticker: string; asset_type: AssetType }>> = [];

  // 첫 청크: 한국주식 + 코인 + 미국주식 첫 8개
  const firstChunk = [
    ...korean,
    ...crypto,
    ...usStocks.slice(0, US_STOCK_CHUNK_SIZE),
  ];
  if (firstChunk.length > 0) {
    chunks.push(firstChunk);
  }

  // 나머지 미국주식 청크
  for (let i = US_STOCK_CHUNK_SIZE; i < usStocks.length; i += US_STOCK_CHUNK_SIZE) {
    chunks.push(usStocks.slice(i, i + US_STOCK_CHUNK_SIZE));
  }

  return chunks;
}

// ────────────────────────────────────────────
// 훅
// ────────────────────────────────────────────

/**
 * 대시보드에 필요한 모든 데이터를 패칭하고 뷰 모델로 조합하는 훅.
 *
 * 현재가 로딩 전략 (이슈 20260615-market-price-loading-fe):
 * 1단계 — baseline: prices 테이블 종가를 즉시 표시 (전체 스피너 없음)
 * 2단계 — 실시간 점진 갱신: 청크 순차 호출, 60초 대기, 각 청크 도착 시 즉시 갱신
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
  const [priceUpdating, setPriceUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * 진행 중인 청크 루프를 취소하기 위한 ref.
   * refetch 또는 언마운트 시 cancelled = true 설정 + cancelDelay() 호출로 즉시 취소한다.
   */
  const chunkCancelRef = useRef<{ cancelled: boolean; cancelDelay?: () => void }>({ cancelled: false });

  // ── KPI + 종목 데이터 패칭 ──
  const fetchData = useCallback(async (isRefresh = false) => {
    // 이전 청크 루프가 실행 중이면 취소한다 (delay 타이머도 즉시 해제)
    chunkCancelRef.current.cancelled = true;
    chunkCancelRef.current.cancelDelay?.();
    const cancelSignal: { cancelled: boolean; cancelDelay?: () => void } = { cancelled: false };
    chunkCancelRef.current = cancelSignal;

    if (isRefresh) {
      setRefreshing(true);
    }
    // 초기 마운트 시에도 baseline 즉시 표시를 위해 initialLoading은
    // baseline 완료 후에 false로 전환한다 (기존처럼 true로 시작하되
    // getKpiSummary 1차 완료 시점에 해제)
    if (!isRefresh) {
      setInitialLoading(true);
    }
    setError(null);

    try {
      // ── 1) 환율 먼저 조회 ──
      const rate = await getExchangeRate().catch((e: Error) => {
        throw new Error(`[환율] ${e?.message}`);
      });
      setExchangeRate(rate);

      // ── 2) KPI 1차: holdings 목록 확보 (현재가 없이) ──
      const kpiRaw = await getKpiSummary(null, [], rate.rate).catch((e: Error) => {
        throw new Error(`[KPI] ${e?.message}`);
      });

      if (kpiRaw.holdings.length === 0) {
        setKpi(toKpiCardData(kpiRaw));
        setHoldings([]);
        setInitialLoading(false);
        setRefreshing(false);
        return;
      }

      const tickerRequests = kpiRaw.holdings.map((h) => ({
        ticker: h.ticker,
        asset_type: h.asset_type,
      }));

      // ── 3) 1단계 — baseline: prices 테이블에서 최신 종가 즉시 표시 ──
      let priceMap = new Map<string, PriceMapValue>();

      try {
        const baselineItems = await getBaselinePrices(tickerRequests);

        // ticker+asset_type 쌍 기준 date MAX 행만 사용
        for (const item of baselineItems) {
          const existing = priceMap.get(item.ticker);
          if (!existing || item.date > (existing.fetched_at.slice(0, 10))) {
            priceMap.set(item.ticker, {
              price: item.close,
              currency: item.currency,
              is_cached: true,
              fetched_at: item.updated_at,
              source: 'baseline',
            });
          }
        }
      } catch (baselineErr) {
        // baseline 실패 시 빈 priceMap으로 계속 진행 (에러 표시하지 않음)
        console.warn('[baseline] 저장 종가 조회 실패:', baselineErr);
      }

      // baseline priceMap으로 KPI 재계산 및 즉시 렌더링
      const baselinePricesForKpi: MarketPriceItem[] = Array.from(priceMap.entries()).map(
        ([ticker, v]) => ({
          ticker,
          asset_type: kpiRaw.holdings.find((h) => h.ticker === ticker)?.asset_type ?? 'korean_stock',
          price: v.price,
          currency: v.currency,
          fetched_at: v.fetched_at,
          is_cached: v.is_cached,
          source: v.source === 'baseline' ? 'cached' : v.source,
        }),
      );

      const kpiBaseline = await getKpiSummary(null, baselinePricesForKpi, rate.rate).catch(
        (e: Error) => {
          throw new Error(`[KPI baseline 재계산] ${e?.message}`);
        },
      );

      // baseline 완료 → 화면 즉시 렌더링 (전체 스피너 해제)
      setKpi(toKpiCardData(kpiBaseline));
      setHoldings(buildHoldingCards(kpiBaseline, priceMap, rate.rate));
      setInitialLoading(false);
      setRefreshing(false);

      // 취소됐으면 청크 루프 진입하지 않음
      if (cancelSignal.cancelled) return;

      // ── 4) 2단계 — 실시간 점진 갱신 (청크 순차 호출) ──
      const chunks = buildChunks(tickerRequests);
      if (chunks.length === 0) return;

      setPriceUpdating(true);

      // kpiBaseline을 청크 갱신 루프에서 재사용한다
      // (보유수량·평균매수가 등 정적 정보는 kpiBaseline에서 가져옴)
      let latestKpiForChunks = kpiBaseline;

      for (let chunkIdx = 0; chunkIdx < chunks.length; chunkIdx++) {
        if (cancelSignal.cancelled) break;

        // 첫 청크 이후에는 60초 대기
        if (chunkIdx > 0) {
          try {
            await delay(CHUNK_DELAY_MS, cancelSignal);
          } catch {
            // delay가 취소되면 루프 종료
            break;
          }
        }

        if (cancelSignal.cancelled) break;

        try {
          const { prices, failed } = await getMarketPrices(chunks[chunkIdx], chunkIdx);

          // failed 종목 로깅 (baseline 유지)
          if (failed.length > 0) {
            console.warn(
              `[청크 ${chunkIdx}] 실패 종목:`,
              failed.map((f) => `${f.ticker}(${f.reason})`).join(', '),
            );
          }

          // priceMap 병합: 성공 종목만 갱신, failed는 기존 baseline 유지
          priceMap = mergePriceMap(priceMap, prices);

          if (cancelSignal.cancelled) break;

          // 갱신된 priceMap으로 KPI 재계산
          const updatedPricesForKpi: MarketPriceItem[] = Array.from(priceMap.entries()).map(
            ([ticker, v]) => ({
              ticker,
              asset_type:
                latestKpiForChunks.holdings.find((h) => h.ticker === ticker)?.asset_type ??
                'korean_stock',
              price: v.price,
              currency: v.currency,
              fetched_at: v.fetched_at,
              is_cached: v.is_cached,
              source: v.source === 'baseline' ? 'cached' : v.source,
            }),
          );

          const kpiUpdated = await getKpiSummary(null, updatedPricesForKpi, rate.rate).catch(
            (e: Error) => {
              console.warn(`[청크 ${chunkIdx} KPI 재계산 실패]`, e);
              return null;
            },
          );

          if (cancelSignal.cancelled) break;

          if (kpiUpdated) {
            latestKpiForChunks = kpiUpdated;
            setKpi(toKpiCardData(kpiUpdated));
            setHoldings(buildHoldingCards(kpiUpdated, priceMap, rate.rate));
          } else {
            // KPI 재계산 실패 시 holdings만 갱신 (priceMap은 이미 최신)
            setHoldings(buildHoldingCards(latestKpiForChunks, priceMap, rate.rate));
          }
        } catch (chunkErr) {
          // 개별 청크 실패 시 로그만 남기고 계속 진행 (baseline 유지됨)
          console.warn(`[청크 ${chunkIdx}] 실시간 조회 실패:`, chunkErr);
        }
      }

      if (!cancelSignal.cancelled) {
        setPriceUpdating(false);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : '데이터를 불러오지 못했습니다';
      setError(msg);
      setInitialLoading(false);
      setRefreshing(false);
      setPriceUpdating(false);
    }
  }, []);

  // ── 히스토리 그래프 데이터 패칭 ──
  // 이슈 028: 전체 기간 1회 조회 후 클라이언트에서 버킷팅 처리.
  // 집계 단위 전환 시 서버 재호출 없음.
  const fetchHistory = useCallback(
    async (_assetType: AssetType | null = null) => {
      setHistoryLoading(true);
      try {
        const [snapshotData, markerData] = await Promise.all([
          getDailySnapshots(),
          getHistoryMarkers(),
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

    return () => {
      // 언마운트 시 진행 중인 청크 루프 취소 (delay 타이머도 즉시 해제)
      chunkCancelRef.current.cancelled = true;
      chunkCancelRef.current.cancelDelay?.();
    };
  }, [fetchData]);

  useEffect(() => {
    fetchHistory();
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
    priceUpdating,
    error,
    refetch: () => fetchData(true),
    fetchHistory,
  };
}
