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
  loading: boolean;
  historyLoading: boolean;
  error: string | null;
  refetch: () => void;
  fetchHistory: (period: Period) => void;
}

/**
 * 대시보드에 필요한 모든 데이터를 패칭하고 HoldingCardData로 조합하는 훅.
 */
export function useDashboard(assetType: AssetType | null): UseDashboardResult {
  const [holdings, setHoldings] = useState<HoldingCardData[]>([]);
  const [assetHistory, setAssetHistory] = useState<AssetHistoryItem[]>([]);
  const [sectorAllocation, setSectorAllocation] = useState<SectorAllocationItem[]>([]);
  const [exchangeRate, setExchangeRate] = useState<ExchangeRateResponse | null>(null);
  const [totalAssetKrw, setTotalAssetKrw] = useState(0);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // 병렬로 데이터 패칭
      const [summary, sector, rate] = await Promise.all([
        getDashboardPortfolioSummary(assetType),
        getSectorAllocation(),
        getExchangeRate(),
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

        // 원화 환산 현재가
        const currentPriceKrw =
          priceData !== null
            ? isKrw
              ? priceData.price
              : priceData.price * rate.rate
            : null;

        const currentPriceUsd =
          priceData !== null && !isKrw ? priceData.price : null;

        // 평균매수가 원화 환산
        const avgBuyPriceKrw = isKrw
          ? item.avg_buy_price
          : item.avg_buy_price * rate.rate;

        // 평가금액 (원화)
        const evaluatedAmount =
          currentPriceKrw !== null ? currentPriceKrw * item.quantity : null;

        // 수익률
        const profitRate =
          currentPriceKrw !== null && avgBuyPriceKrw > 0
            ? ((currentPriceKrw - avgBuyPriceKrw) / avgBuyPriceKrw) * 100
            : null;

        // 평가손익 (원화)
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

      // 총 자산 (원화 합산)
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
      setLoading(false);
    }
  }, [assetType]);

  const fetchHistory = useCallback(
    async (period: Period) => {
      setHistoryLoading(true);
      try {
        const data = await getAssetHistory(period, assetType);
        setAssetHistory(data);
      } catch (e) {
        // 히스토리 에러는 메인 에러와 분리
        console.warn('히스토리 로드 오류:', e);
      } finally {
        setHistoryLoading(false);
      }
    },
    [assetType],
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
    loading,
    historyLoading,
    error,
    refetch: fetchData,
    fetchHistory,
  };
}
