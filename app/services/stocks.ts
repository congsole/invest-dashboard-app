/**
 * stocks.ts — 종목 마스터 서비스 함수
 *
 * API 명세 참조: docs/api/api-spec.md — Stock 섹션
 * [009] 초기 작성: 종목 단건 조회, upsert + 섹터 추천 RPC, 섹터 수동 지정
 * [012] 재설계: asset_type → market, 로컬 검색 추가, FastAPI 외부 검색 연동 추가
 */

import { supabase } from '../utils/supabase';
import {
  StockMarket,
  StockWithSector,
  StockSearchResult,
  GetOrRecommendStockSectorResult,
  ExternalStockSearchResponse,
} from '../types/sector';

// ────────────────────────────────────────────
// 로컬 종목 검색 (Supabase ilike)
//
// stocks 테이블에서 ticker 또는 name으로 ilike 검색.
// 검색어 2자 이상부터 호출, 디바운스 300ms 권장.
// 결과 0건이면 외부 FastAPI 검색으로 전환.
// ────────────────────────────────────────────

export interface SearchStocksParams {
  q: string;
  market?: StockMarket;
  limit?: number;
}

export async function searchStocksLocal(
  params: SearchStocksParams,
): Promise<StockSearchResult[]> {
  const { q, market, limit = 30 } = params;

  if (q.length < 2) {
    return [];
  }

  let query = supabase
    .from('stocks')
    .select('id, ticker, name, market, currency, sector_id, is_active, sectors(id, code, name)')
    .or(`ticker.ilike.%${q}%,name.ilike.%${q}%`)
    .eq('is_active', true)
    .order('name', { ascending: true })
    .limit(limit);

  if (market) {
    query = query.eq('market', market);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(
      `[stocks/searchStocksLocal] 로컬 종목 검색 실패 (q="${q}"): ${error.message} (code: ${error.code})`,
    );
  }

  return (data ?? []) as unknown as StockSearchResult[];
}

// ────────────────────────────────────────────
// 종목 단건 조회
// ticker + market 조합으로 조회. 없으면 null 반환.
// ────────────────────────────────────────────

export async function getStock(
  ticker: string,
  market: StockMarket,
): Promise<StockWithSector | null> {
  const { data, error } = await supabase
    .from('stocks')
    .select('*, sectors(id, code, name)')
    .eq('ticker', ticker)
    .eq('market', market)
    .maybeSingle();

  if (error) {
    throw new Error(
      `[stocks/getStock] 종목 조회 실패 (${ticker}/${market}): ${error.message} (code: ${error.code})`,
    );
  }

  return data as StockWithSector | null;
}

// ────────────────────────────────────────────
// 종목 등록 또는 조회 + 섹터 자동 추천 (RPC)
//
// 실제 upsert는 FastAPI(service_role) 경유.
// 이 함수는 기존 종목 조회 또는 섹터 추천 결과만 반환.
//
// - CRYPTO: CRYPTO 섹터 고정
// - KR: kr_sector_map → GICS 변환 (naver_industry 필요)
// - US: GICS 코드를 naver_industry에 직접 전달 (선택)
// ────────────────────────────────────────────

export interface GetOrRecommendStockSectorInput {
  ticker: string;
  market: StockMarket;
  name: string;
  currency: string;
  /** KR: 네이버 업종명. US: GICS 코드(선택). CRYPTO: 불필요. */
  naver_industry?: string | null;
}

export async function getOrRecommendStockSector(
  input: GetOrRecommendStockSectorInput,
): Promise<GetOrRecommendStockSectorResult> {
  const { data, error } = await supabase.rpc('get_or_recommend_stock_sector', {
    p_ticker:          input.ticker,
    p_market:          input.market,
    p_name:            input.name,
    p_currency:        input.currency,
    p_naver_industry:  input.naver_industry ?? null,
  });

  if (error) {
    throw new Error(
      `[stocks/getOrRecommendStockSector] RPC 실패 (${input.ticker}/${input.market}): ${error.message} (code: ${error.code})`,
    );
  }

  return data as GetOrRecommendStockSectorResult;
}

// ────────────────────────────────────────────
// FastAPI 외부 종목 검색
//
// 로컬 검색 결과가 0건일 때 호출.
// FastAPI /stocks/search 엔드포인트 경유.
// FASTAPI_BASE_URL은 환경변수에서 읽는다.
// ────────────────────────────────────────────

export interface SearchStocksExternalParams {
  q: string;
  market?: StockMarket;
  limit?: number;
}

export async function searchStocksExternal(
  params: SearchStocksExternalParams,
): Promise<ExternalStockSearchResponse> {
  const { q, market, limit = 30 } = params;

  // Supabase 세션에서 JWT 취득
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !session) {
    throw new Error(
      `[stocks/searchStocksExternal] 인증 세션 없음: ${sessionError?.message ?? '세션을 찾을 수 없습니다'}`,
    );
  }

  const baseUrl = process.env.EXPO_PUBLIC_FASTAPI_BASE_URL;
  if (!baseUrl) {
    throw new Error(
      '[stocks/searchStocksExternal] EXPO_PUBLIC_FASTAPI_BASE_URL 환경변수가 설정되지 않았습니다',
    );
  }

  const url = new URL(`${baseUrl}/stocks/search`);
  url.searchParams.set('q', q);
  if (market) url.searchParams.set('market', market);
  url.searchParams.set('limit', String(limit));

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(
      `[stocks/searchStocksExternal] FastAPI 요청 실패 (status: ${response.status}): ${body}`,
    );
  }

  const json = (await response.json()) as ExternalStockSearchResponse;
  return json;
}

// ────────────────────────────────────────────
// 통합 종목 검색
//
// 로컬 → 결과 없으면 외부(FastAPI) 순서로 검색.
// 검색어 2자 미만이면 빈 배열 반환.
// ────────────────────────────────────────────

export type StockSearchSource = 'local' | 'external';

export interface UnifiedStockSearchResult {
  source: StockSearchSource;
  localResults: StockSearchResult[];
  externalResults: ExternalStockSearchResponse | null;
}

export async function searchStocks(
  params: SearchStocksParams,
): Promise<UnifiedStockSearchResult> {
  if (params.q.length < 2) {
    return { source: 'local', localResults: [], externalResults: null };
  }

  const localResults = await searchStocksLocal(params);

  if (localResults.length > 0) {
    return { source: 'local', localResults, externalResults: null };
  }

  // 로컬 결과 없으면 외부 검색 시도
  const externalResults = await searchStocksExternal(params).catch((err: Error) => {
    // 외부 검색 실패는 치명적이지 않으므로 로깅 후 null 반환
    console.warn('[stocks/searchStocks] 외부 검색 실패:', err.message);
    return null;
  });

  return { source: 'external', localResults: [], externalResults };
}

// ────────────────────────────────────────────
// 종목 섹터 수동 지정/변경
//
// stocks 쓰기는 service_role 전용이므로 FastAPI를 통해 호출.
// 클라이언트에서 직접 호출 시 RLS에 의해 403 차단됨.
// 이 함수는 FastAPI PATCH /stocks/{id}/sector 를 경유한다.
// ────────────────────────────────────────────

export interface UpdateStockSectorParams {
  stockId: string;
  sectorId: number | null;
}

export async function updateStockSector(
  params: UpdateStockSectorParams,
): Promise<StockWithSector> {
  const { stockId, sectorId } = params;

  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !session) {
    throw new Error(
      `[stocks/updateStockSector] 인증 세션 없음: ${sessionError?.message ?? '세션을 찾을 수 없습니다'}`,
    );
  }

  const baseUrl = process.env.EXPO_PUBLIC_FASTAPI_BASE_URL;
  if (!baseUrl) {
    throw new Error(
      '[stocks/updateStockSector] EXPO_PUBLIC_FASTAPI_BASE_URL 환경변수가 설정되지 않았습니다',
    );
  }

  const response = await fetch(`${baseUrl}/stocks/${stockId}/sector`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ sector_id: sectorId }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(
      `[stocks/updateStockSector] FastAPI 요청 실패 (stockId: ${stockId}, status: ${response.status}): ${body}`,
    );
  }

  const updated = (await response.json()) as StockWithSector;
  return updated;
}
