/**
 * dashboard.ts — 대시보드 서비스 함수
 *
 * API 명세 참조: docs/api/api-spec.md — Dashboard 섹션
 * 현재가/환율 조회는 app/services/market.ts 사용
 */

import { supabase } from '../utils/supabase';
import {
  AssetType,
  Period,
  PortfolioSummaryItem,
  AssetHistoryItem,
  SectorAllocationItem,
} from '../types/dashboard';

// ────────────────────────────────────────────
// 포트폴리오 요약
// ────────────────────────────────────────────

/**
 * 부문별 포트폴리오 요약을 집계한다.
 * @param assetType null이면 전체 부문
 */
export async function getDashboardPortfolioSummary(
  assetType: AssetType | null = null,
): Promise<PortfolioSummaryItem[]> {
  const { data, error } = await supabase.rpc('get_portfolio_summary', {
    p_asset_type: assetType,
  });

  if (error) throw error;
  return (data ?? []) as PortfolioSummaryItem[];
}

// ────────────────────────────────────────────
// 자산 히스토리 그래프 데이터
// ────────────────────────────────────────────

/**
 * 기간 단위별 자산 히스토리를 조회한다.
 */
export async function getAssetHistory(
  period: Period,
  assetType: AssetType | null = null,
): Promise<AssetHistoryItem[]> {
  const { data, error } = await supabase.rpc('get_asset_history', {
    p_period: period,
    p_asset_type: assetType,
  });

  if (error) throw error;
  return (data ?? []) as AssetHistoryItem[];
}

// ────────────────────────────────────────────
// 부문별 비중 파이 차트 데이터
// ────────────────────────────────────────────

/**
 * 부문별 투입 원금 비중을 조회한다.
 */
export async function getSectorAllocation(): Promise<SectorAllocationItem[]> {
  const { data, error } = await supabase.rpc('get_sector_allocation');

  if (error) throw error;
  return (data ?? []) as SectorAllocationItem[];
}

