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
 * 한국주식은 네이버, 미국주식은 Twelve Data, 코인은 CoinGecko API를 사용한다.
 *
 * @param tickers 이번 청크에서 조회할 종목 목록. 미국주식은 최대 8개.
 * @param chunk_index 0-based 청크 번호 (로깅용, 기본 0).
 *
 * 청크 분할 호출은 클라이언트(FE) 책임이다:
 * - 첫 청크: 한국주식 전체 + 코인 전체 + 미국주식 최대 8개
 * - 미국주식 9개 이상: 잔여분을 60초 간격으로 순차 호출
 */
export async function getMarketPrices(
  tickers: Array<{ ticker: string; asset_type: AssetType }>,
  chunk_index = 0,
): Promise<MarketPricesResponse> {
  const { data, error } = await supabase.functions.invoke('get-market-prices', {
    body: { tickers, chunk_index },
  });

  if (error) {
    const context = (error as { context?: { status?: number; text?: () => Promise<string> } }).context;
    if (context) {
      const text = (await context.text?.()) ?? '';
      throw new Error(
        `get-market-prices 호출 실패 [chunk_index=${chunk_index}]: ${error.message} | status: ${context.status} | body: ${text}`,
      );
    }
    throw new Error(`get-market-prices 호출 실패 [chunk_index=${chunk_index}]: ${error.message}`);
  }

  return data as MarketPricesResponse;
}

// ────────────────────────────────────────────
// 저장 종가 baseline 조회 (prices 테이블 REST)
// ────────────────────────────────────────────

export interface BaselinePriceItem {
  ticker: string;
  asset_type: AssetType;
  date: string;        // YYYY-MM-DD (종가 날짜, 전 거래일)
  close: number;       // 종가
  currency: string;    // 'KRW' | 'USD' 등
  updated_at: string;  // 갱신 시각 (ISO 8601)
}

/**
 * `prices` 테이블에서 보유 종목별 최신 종가(EOD)를 읽어 즉시 렌더링에 사용한다.
 * 화면 진입 시 실시간 조회 전에 먼저 호출하여 카드/KPI에 잠정치를 채운다.
 *
 * `prices` 테이블 PK는 (ticker, asset_type, date) 복합키이므로 ticker+asset_type 쌍으로
 * 각 종목을 특정한다. 동일 ticker+asset_type에 여러 날짜 행이 반환될 수 있으므로
 * 호출자가 date MAX 행만 사용해야 한다.
 */
export async function getBaselinePrices(
  holdings: Array<{ ticker: string; asset_type: AssetType }>,
): Promise<BaselinePriceItem[]> {
  if (holdings.length === 0) return [];

  const tickers = holdings.map((h) => h.ticker);
  const assetTypes = [...new Set(holdings.map((h) => h.asset_type))];

  const { data, error } = await supabase
    .from('prices')
    .select('ticker, asset_type, date, close, currency, updated_at')
    .in('ticker', tickers)
    .in('asset_type', assetTypes)
    .order('date', { ascending: false });

  if (error) {
    throw new Error(
      `getBaselinePrices 실패 [tickers=${tickers.join(',')}]: ${error.message} | code: ${error.code}`,
    );
  }

  return (data ?? []) as BaselinePriceItem[];
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

  if (error) {
    const context = (error as { context?: { status?: number; text?: () => Promise<string> } }).context;
    if (context) {
      const text = (await context.text?.()) ?? '';
      throw new Error(`get-exchange-rate 호출 실패: ${error.message} | status: ${context.status} | body: ${text}`);
    }
    throw new Error(`get-exchange-rate 호출 실패: ${error.message}`);
  }
  return data as ExchangeRateResponse;
}
