// Sector / Stock / KrSectorMap 공통 타입 정의
// api-spec.md — Sector / Stock 섹션 기반
// [012] stocks 재설계: asset_type → market, currency/is_active 추가

// ────────────────────────────────────────────
// Sector
// ────────────────────────────────────────────

export type SectorCode =
  | 'IT'
  | 'HEALTHCARE'
  | 'FINANCIALS'
  | 'CONS_DISC'
  | 'CONS_STAPLES'
  | 'COMM'
  | 'INDUSTRIALS'
  | 'MATERIALS'
  | 'ENERGY'
  | 'UTILITIES'
  | 'REAL_ESTATE'
  | 'CRYPTO';

export interface Sector {
  id: number;    // 1~12 고정
  code: SectorCode;
  name: string;  // '정보기술' | '헬스케어' | '금융' | ...
}

// ────────────────────────────────────────────
// Stock
// ────────────────────────────────────────────

/** 시장 구분 (KR / US / CRYPTO) */
export type StockMarket = 'KR' | 'US' | 'CRYPTO';

/**
 * @deprecated 이슈 012에서 market으로 대체됨. 하위 호환 유지용.
 * account_events, corporate_actions 등 별도 테이블에서 여전히 사용.
 */
export type StockAssetType = 'korean_stock' | 'us_stock' | 'crypto';

export interface Stock {
  id: string;               // uuid
  ticker: string;
  name: string;
  market: StockMarket;
  currency: string;         // 'KRW' | 'USD'
  sector_id: number | null;
  is_active: boolean;
  created_at: string;
}

/** stocks.select('*, sectors(id, code, name)') 응답 형태 */
export interface StockWithSector extends Stock {
  sectors: Sector | null;
}

// ────────────────────────────────────────────
// 로컬 종목 검색 응답 (stocks ilike 검색)
// ────────────────────────────────────────────

export interface StockSearchResult {
  id: string;
  ticker: string;
  name: string;
  market: StockMarket;
  currency: string;
  sector_id: number | null;
  is_active: boolean;
  sectors: {
    id: number;
    code: string;
    name: string;
  } | null;
}

// ────────────────────────────────────────────
// get_or_recommend_stock_sector RPC 응답
// (구: upsert_stock_with_sector)
// ────────────────────────────────────────────

export interface GetOrRecommendStockSectorResult {
  id: string;
  ticker: string;
  name: string;
  market: StockMarket;
  currency: string;
  is_active: boolean;
  sector_id: number | null;
  recommended_sector: Sector | null;
  is_new: boolean;
  created_at: string;
}

/**
 * @deprecated 이슈 012에서 GetOrRecommendStockSectorResult로 대체됨.
 * 하위 호환 유지를 위해 alias 유지.
 */
export type UpsertStockResult = GetOrRecommendStockSectorResult;

// ────────────────────────────────────────────
// 종목 섹터 수동 지정 입력
// ────────────────────────────────────────────

export interface StockSectorUpdateInput {
  sector_id: number | null;
}

// ────────────────────────────────────────────
// FastAPI 외부 종목 검색 응답
// FastAPI /stocks/search 엔드포인트 응답 형태
// ────────────────────────────────────────────

export interface ExternalStockSearchResult {
  ticker: string;
  name: string;
  market: StockMarket;
  currency: string;
  /** 한국 주식의 네이버 업종명 (섹터 추천에 사용) */
  naver_industry?: string | null;
  /** 미국 주식의 GICS 섹터 코드 (섹터 추천에 사용) */
  gics_code?: string | null;
}

export interface ExternalStockSearchResponse {
  results: ExternalStockSearchResult[];
  total: number;
}
