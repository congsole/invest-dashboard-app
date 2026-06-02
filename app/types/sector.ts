// Sector / Stock / KrSectorMap 공통 타입 정의
// api-spec.md — Sector / Stock 섹션 기반 (이슈 009)

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

export type StockAssetType = 'korean_stock' | 'us_stock' | 'crypto';

export interface Stock {
  id: string;          // uuid
  ticker: string;
  asset_type: StockAssetType;
  name: string;
  sector_id: number | null;
  created_at: string;
}

/** stocks.select('*, sectors(id, code, name)') 응답 형태 */
export interface StockWithSector extends Stock {
  sectors: Sector | null;
}

// ────────────────────────────────────────────
// upsert_stock_with_sector RPC 응답
// ────────────────────────────────────────────

export interface UpsertStockResult {
  id: string;
  ticker: string;
  asset_type: StockAssetType;
  name: string;
  sector_id: number | null;
  recommended_sector: Sector | null;
  is_new: boolean;
  created_at: string;
}

// ────────────────────────────────────────────
// 종목 섹터 수동 지정 입력
// ────────────────────────────────────────────

export interface StockSectorUpdateInput {
  sector_id: number | null;
}
