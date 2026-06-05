// Sector / Stock 공통 타입 정의
// api-spec.md — Sector / Stock 섹션 기반
// [012] stocks 재설계: asset_type → market, currency/is_active 추가
// [016] GICS 계층화: Sector에 name_en/parent_id/level 추가, SectorBreadcrumb 추가

// ────────────────────────────────────────────
// Sector
// ────────────────────────────────────────────

export type SectorCode = string;

/** GICS 계층 레벨 (1=Sector, 2=Industry Group, 3=Industry, 4=Sub-Industry) */
export type SectorLevel = 1 | 2 | 3 | 4;

export interface Sector {
  id: number;
  code: SectorCode;
  name: string;           // 한글명 (예: '정보기술', '반도체제조')
  name_en: string | null; // 영문명 (예: 'Information Technology', 'Semiconductor Manufacturing')
  parent_id: number | null; // L1은 null, L2~L4는 상위 섹터 ID
  level: SectorLevel;     // 1~4
}

/**
 * get_sector_breadcrumb RPC 응답의 단일 항목.
 * level 오름차순 정렬 (L1 → L2 → L3 → L4).
 */
export interface SectorBreadcrumbItem {
  id: number;
  code: SectorCode;
  name: string;
  name_en: string | null;
  level: SectorLevel;
}

/** getSectorBreadcrumb 반환 타입 */
export type SectorBreadcrumb = SectorBreadcrumbItem[];

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
  sector_id: number | null; // 가능한 한 GICS L4(Sub-Industry), 매핑 실패 시 최하위 레벨
  is_active: boolean;
  created_at: string;
}

/** stocks.select('*, sectors(id, code, name, name_en, parent_id, level)') 응답 형태 */
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
    name_en: string | null;
    parent_id: number | null;
    level: SectorLevel;
  } | null;
}

// ────────────────────────────────────────────
// get_or_recommend_stock_sector RPC 응답
// (이슈 016: p_naver_industry → p_yfinance_sector/p_yfinance_industry)
// ────────────────────────────────────────────

export interface RecommendedSector {
  id: number;
  code: SectorCode;
  name: string;
  name_en: string | null;
  level: SectorLevel;
}

export interface GetOrRecommendStockSectorResult {
  id: string;
  ticker: string;
  name: string;
  market: StockMarket;
  currency: string;
  is_active: boolean;
  sector_id: number | null;
  recommended_sector: RecommendedSector | null;
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
  /** yfinance sector 반환값 (예: "Technology"). 섹터 L1 추천에 사용. */
  yfinance_sector?: string | null;
  /** yfinance industry 반환값 (예: "Semiconductor Manufacturing"). 섹터 L4 추천에 사용. */
  yfinance_industry?: string | null;
}

export interface ExternalStockSearchResponse {
  results: ExternalStockSearchResult[];
  total: number;
}
