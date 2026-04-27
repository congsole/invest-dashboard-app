/**
 * corporateActions.ts — 기업 액션 서비스 함수
 *
 * API 명세 참조: docs/api/api-spec.md — CorporateAction 섹션
 * SELECT: 모든 인증 사용자 공개 조회 가능
 * INSERT/UPDATE/DELETE: service_role만 허용 (클라이언트에서는 조회만 사용)
 */

import { supabase } from '../utils/supabase';

// ────────────────────────────────────────────
// 타입
// ────────────────────────────────────────────

export type CorporateActionType = 'split' | 'reverse_split' | 'dividend_stock' | 'merger';
export type CorporateActionAssetType = 'korean_stock' | 'us_stock';

export interface CorporateAction {
  id: string;
  ticker: string;
  asset_type: CorporateActionAssetType;
  action_type: CorporateActionType;
  effective_date: string;                    // YYYY-MM-DD
  ratio: number;                             // 분할 비율 (예: 4:1 → 4)
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface CorporateActionFilters {
  ticker: string;
  asset_type: CorporateActionAssetType;
  from?: string;    // effective_date 필터 시작일 (YYYY-MM-DD)
}

// ────────────────────────────────────────────
// 기업 액션 목록 조회
// ────────────────────────────────────────────

/**
 * 특정 종목의 기업 액션 목록을 조회한다.
 * effective_date 오름차순 정렬.
 */
export async function getCorporateActions(
  filters: CorporateActionFilters,
): Promise<CorporateAction[]> {
  let query = supabase
    .from('corporate_actions')
    .select('*')
    .eq('ticker', filters.ticker)
    .eq('asset_type', filters.asset_type)
    .order('effective_date', { ascending: true });

  if (filters.from) {
    query = query.gte('effective_date', filters.from);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`기업 액션 조회 실패 (${error.code}): ${error.message}`);
  }

  return (data ?? []) as CorporateAction[];
}
