/**
 * dashboard.ts — 대시보드 서비스 함수
 *
 * API 명세 참조: docs/api/api-spec.md — Dashboard / DailySnapshot 섹션
 * 이슈 008: get_kpi_summary RPC + daily_snapshots REST 기반으로 전면 교체
 */

import { supabase } from '../utils/supabase';
import {
  AssetType,
  Period,
  KpiSummary,
  DailySnapshot,
  HistoryMarker,
  MarketPriceItem,
} from '../types/dashboard';

// ────────────────────────────────────────────
// 날짜 유틸
// ────────────────────────────────────────────

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * period를 from/to 날짜 쌍으로 변환한다.
 * 'day'는 daily_snapshots를 사용하지 않으므로 오늘 날짜만 반환.
 */
export function periodToDateRange(period: Period): { from: string; to: string } {
  const today = new Date();
  const to = toDateStr(today);

  switch (period) {
    case 'day': {
      return { from: to, to };
    }
    case 'week': {
      const from = new Date(today);
      from.setDate(from.getDate() - 7);
      return { from: toDateStr(from), to };
    }
    case 'month': {
      const from = new Date(today);
      from.setMonth(from.getMonth() - 1);
      return { from: toDateStr(from), to };
    }
    case 'year': {
      const from = new Date(today);
      from.setFullYear(from.getFullYear() - 1);
      return { from: toDateStr(from), to };
    }
    case 'all': {
      return { from: '2000-01-01', to };
    }
  }
}

// ────────────────────────────────────────────
// KPI 데이터 조회 (get_kpi_summary RPC)
// ────────────────────────────────────────────

/**
 * KPI 카드 데이터를 집계하여 반환한다.
 * @param assetType null이면 전체 부문
 * @param currentPrices 클라이언트가 조회한 현재가 목록
 * @param fxRateUsd 현재 USD/KRW 환율
 */
export async function getKpiSummary(
  assetType: AssetType | null,
  currentPrices: MarketPriceItem[],
  fxRateUsd: number,
): Promise<KpiSummary> {
  const pricesParam = currentPrices.map((p) => ({
    ticker: p.ticker,
    asset_type: p.asset_type,
    price: p.price,
    currency: p.currency,
  }));

  const { data, error } = await supabase.rpc('get_kpi_summary', {
    p_asset_type: assetType,
    p_current_prices: pricesParam,
    p_fx_rate_usd: fxRateUsd,
  });

  if (error) throw error;
  return data as KpiSummary;
}

// ────────────────────────────────────────────
// 자산 히스토리 그래프 데이터 (daily_snapshots REST)
// ────────────────────────────────────────────

/**
 * 기간 단위별 daily_snapshots를 조회한다.
 */
export async function getDailySnapshots(
  from: string,
  to: string,
): Promise<DailySnapshot[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('인증 필요');

  const { data, error } = await supabase
    .from('daily_snapshots')
    .select(
      'snapshot_date, total_value_krw, principal_krw, cash_krw, cash_usd, net_profit_krw, fx_rate_usd',
    )
    .eq('user_id', user.id)
    .gte('snapshot_date', from)
    .lte('snapshot_date', to)
    .order('snapshot_date', { ascending: true });

  if (error) throw error;
  return (data ?? []) as DailySnapshot[];
}

// ────────────────────────────────────────────
// 이벤트 마커 조회 (get_history_markers RPC)
// ────────────────────────────────────────────

export async function getHistoryMarkers(
  from: string,
  to: string,
): Promise<HistoryMarker[]> {
  const { data, error } = await supabase.rpc('get_history_markers', {
    p_from: from,
    p_to: to,
  });

  if (error) throw error;
  return (data ?? []) as HistoryMarker[];
}

// ────────────────────────────────────────────
// (레거시 — 하위 호환용, 이슈 008 이후 제거 예정)
// ────────────────────────────────────────────

/** @deprecated getKpiSummary 사용 */
export async function getDashboardPortfolioSummary(
  _assetType: AssetType | null = null,
) {
  return [];
}

/** @deprecated getDailySnapshots 사용 */
export async function getAssetHistory(
  _period: Period,
  _assetType: AssetType | null = null,
) {
  return [];
}

/** @deprecated 파이 차트 제거 (이슈 008) */
export async function getSectorAllocation() {
  return [];
}
