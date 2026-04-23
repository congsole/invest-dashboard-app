/**
 * market.ts — 외부 시장 데이터 서비스 함수
 *
 * API 명세 참조: docs/api/api-spec.md — Market 섹션
 */

import { supabase } from '../utils/supabase';
import { AssetType, MarketPricesResponse, ExchangeRateResponse } from '../types/dashboard';

// ────────────────────────────────────────────
// 현재가 조회 (Edge Function: get-market-prices)
// ────────────────────────────────────────────

/**
 * 종목 목록의 현재가를 조회한다.
 * 한국주식·미국주식은 Twelve Data, 코인은 CoinGecko API를 사용한다.
 */
export async function getMarketPrices(
  tickers: Array<{ ticker: string; asset_type: AssetType }>,
): Promise<MarketPricesResponse> {
  const { data, error } = await supabase.functions.invoke('get-market-prices', {
    body: { tickers },
  });

  if (error) throw error;
  return data as MarketPricesResponse;
}

// ────────────────────────────────────────────
// 환율 조회 (Edge Function: get-exchange-rate)
// ────────────────────────────────────────────

/**
 * USD/KRW 환율을 조회한다.
 * ExchangeRate-API 사용, 1시간 캐시.
 */
export async function getExchangeRate(
  from = 'USD',
  to = 'KRW',
): Promise<ExchangeRateResponse> {
  const { data, error } = await supabase.functions.invoke('get-exchange-rate', {
    body: { from, to },
  });

  if (error) throw error;
  return data as ExchangeRateResponse;
}
