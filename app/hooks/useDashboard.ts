import { useCallback, useEffect, useState } from 'react';
import {
  getDashboardPortfolioSummary,
  getAssetHistory,
  getSectorAllocation,
} from '../services/dashboard';
import { getMarketPrices, getExchangeRate } from '../services/market';
import {
  AssetType,
  Period,
  HoldingCardData,
  AssetHistoryItem,
  SectorAllocationItem,
  ExchangeRateResponse,
} from '../types/dashboard';

interface UseDashboardResult {
  holdings: HoldingCardData[];
  assetHistory: AssetHistoryItem[];
  sectorAllocation: SectorAllocationItem[];
  exchangeRate: ExchangeRateResponse | null;
  totalAssetKrw: number;
  initialLoading: boolean;
  refreshing: boolean;
  historyLoading: boolean;
  error: string | null;
  refetch: () => void;
  fetchHistory: (period: Period, assetType?: AssetType | null) => void;
}

/**
 * 대시보드에 필요한 모든 데이터를 패칭하고 HoldingCardData로 조합하는 훅.
 * 항상 전체 데이터를 패칭한다. 탭 필터링은 호출부에서 클라이언트 사이드로 처리한다.
 */
export function useDashboard(): UseDashboardResult {
  const [holdings, setHoldings] = useState<HoldingCardData[]>([]);
  const [assetHistory, setAssetHistory] = useState<AssetHistoryItem[]>([]);
  const [sectorAllocation, setSectorAllocation] = useState<SectorAllocationItem[]>([]);
  const [exchangeRate, setExchangeRate] = useState<ExchangeRateResponse | null>(null);
  const [totalAssetKrw, setTotalAssetKrw] = useState(0);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setInitialLoading(true);
    }
    setError(null);

    try {
      // 병렬로 데이터 패칭 (전체 부문, assetType 필터 없음)
      const [summary, sector, rate] = await Promise.all([
        getDashboardPortfolioSummary(null).catch((e) => { throw new Error(`[portfolio] ${e?.message}`); }),
        getSectorAllocation().catch((e) => { throw new Error(`[sector] ${e?.message}`); }),
        getExchangeRate().catch((e) => { throw new Error(`[exchange-rate] ${e?.message}`); }),
      ]);

      setSectorAllocation(sector);
      setExchangeRate(rate);

      if (summary.length === 0) {
        setHoldings([]);
        setTotalAssetKrw(0);
        return;
      }

      // 현재가 조회
      const tickerRequests = summary.map((item) => ({
        ticker: item.ticker,
        asset_type: item.asset_type,
      }));
      const { prices } = await getMarketPrices(tickerRequests);
      const priceMap = new Map(prices.map((p) => [p.ticker, p]));

      // HoldingCardData 조합
      const holdingCards: HoldingCardData[] = summary.map((item) => {
        const priceData = priceMap.get(item.ticker) ?? null;
        const isKrw = item.asset_type === 'korean_stock';

        const currentPriceKrw =
          priceData !== null
            ? isKrw
              ? priceData.price
              : priceData.price * rate.rate
            : null;

        const currentPriceUsd =
          priceData !== null && !isKrw ? priceData.price : null;

        const avgBuyPriceKrw = isKrw
          ? item.avg_buy_price
          : item.avg_buy_price * rate.rate;

        const evaluatedAmount =
          currentPriceKrw !== null ? currentPriceKrw * item.quantity : null;

        const profitRate =
          currentPriceKrw !== null && avgBuyPriceKrw > 0
            ? ((currentPriceKrw - avgBuyPriceKrw) / avgBuyPriceKrw) * 100
            : null;

        const investedKrw = isKrw
          ? Math.abs(item.total_invested)
          : Math.abs(item.total_invested) * rate.rate;
        const profitAmount =
          evaluatedAmount !== null ? evaluatedAmount - investedKrw : null;

        return {
          ticker: item.ticker,
          name: item.name,
          asset_type: item.asset_type,
          quantity: item.quantity,
          avg_buy_price: item.avg_buy_price,
          avg_buy_price_krw: avgBuyPriceKrw,
          currency: item.currency,
          current_price: currentPriceKrw,
          current_price_usd: currentPriceUsd,
          evaluated_amount: evaluatedAmount,
          profit_rate: profitRate,
          profit_amount: profitAmount,
          total_invested: isKrw
            ? Math.abs(item.total_invested)
            : Math.abs(item.total_invested) * rate.rate,
          is_price_cached: priceData?.is_cached ?? false,
          price_fetched_at: priceData?.fetched_at ?? null,
        };
      });

      // 총 자산 (전체 원화 합산)
      const total = holdingCards.reduce(
        (acc, card) => acc + (card.evaluated_amount ?? card.total_invested),
        0,
      );
      setTotalAssetKrw(total);
      setHoldings(holdingCards);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '데이터를 불러오지 못했습니다';
      setError(msg);
    } finally {
      setInitialLoading(false);
      setRefreshing(false);
    }
  }, []);

  const fetchHistory = useCallback(
    async (period: Period, assetType: AssetType | null = null) => {
      setHistoryLoading(true);
      try {
        const data = await getAssetHistory(period, assetType);
        setAssetHistory(data);
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
    holdings,
    assetHistory,
    sectorAllocation,
    exchangeRate,
    totalAssetKrw,
    initialLoading,
    refreshing,
    historyLoading,
    error,
    refetch: () => fetchData(true),
    fetchHistory,
  };
}
