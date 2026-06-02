/**
 * stocks.ts — 종목 마스터 서비스 함수
 *
 * API 명세 참조: docs/api/api-spec.md — Stock 섹션
 * 이슈 009: stocks 테이블 클라이언트 유틸 + upsert_stock_with_sector RPC
 */

import { supabase } from '../utils/supabase';
import {
  StockAssetType,
  StockWithSector,
  UpsertStockResult,
} from '../types/sector';

// ────────────────────────────────────────────
// 종목 단건 조회
// ticker + asset_type 조합으로 조회. 없으면 null 반환.
// ────────────────────────────────────────────

export async function getStock(
  ticker: string,
  assetType: StockAssetType,
): Promise<StockWithSector | null> {
  const { data, error } = await supabase
    .from('stocks')
    .select('*, sectors(id, code, name)')
    .eq('ticker', ticker)
    .eq('asset_type', assetType)
    .maybeSingle();

  if (error) {
    throw new Error(
      `[stocks/getStock] 종목 조회 실패 (${ticker}/${assetType}): ${error.message} (code: ${error.code})`,
    );
  }

  return data as StockWithSector | null;
}

// ────────────────────────────────────────────
// 종목 등록 또는 조회 + 섹터 자동 추천 (RPC)
//
// - crypto: CRYPTO 섹터 고정
// - korean_stock: kr_sector_map 통해 GICS 변환 (naver_industry 필요)
// - us_stock: p_naver_industry에 GICS code 직접 전달 시 매핑, 없으면 null
// ────────────────────────────────────────────

export interface UpsertStockInput {
  ticker: string;
  asset_type: StockAssetType;
  name: string;
  /** 한국 주식: 네이버 업종명. 미국 주식: GICS 코드(선택). */
  naver_industry?: string | null;
}

export async function upsertStockWithSector(
  input: UpsertStockInput,
): Promise<UpsertStockResult> {
  const { data, error } = await supabase.rpc('upsert_stock_with_sector', {
    p_ticker:          input.ticker,
    p_asset_type:      input.asset_type,
    p_name:            input.name,
    p_naver_industry:  input.naver_industry ?? null,
  });

  if (error) {
    throw new Error(
      `[stocks/upsertStockWithSector] 종목 등록 실패 (${input.ticker}/${input.asset_type}): ${error.message} (code: ${error.code})`,
    );
  }

  return data as UpsertStockResult;
}

// ────────────────────────────────────────────
// 종목 섹터 수동 지정/변경
// 자동 추천 결과가 맞지 않을 때 보정에 사용
// sector_id: null 이면 섹터 해제(미분류)
// ────────────────────────────────────────────

export async function updateStockSector(
  stockId: string,
  sectorId: number | null,
): Promise<StockWithSector> {
  const { data, error } = await supabase
    .from('stocks')
    .update({ sector_id: sectorId })
    .eq('id', stockId)
    .select('*, sectors(id, code, name)')
    .single();

  if (error) {
    throw new Error(
      `[stocks/updateStockSector] 섹터 수정 실패 (stockId: ${stockId}): ${error.message} (code: ${error.code})`,
    );
  }

  if (!data) {
    throw new Error(
      `[stocks/updateStockSector] 종목을 찾을 수 없습니다 (stockId: ${stockId})`,
    );
  }

  return data as StockWithSector;
}
