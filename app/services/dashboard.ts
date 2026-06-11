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
  SnapshotRefreshQuota,
  RefreshTodaySnapshotResponse,
} from '../types/dashboard';

// ────────────────────────────────────────────
// 날짜 유틸
// ────────────────────────────────────────────

/**
 * @deprecated 이슈 028: period는 이제 집계 단위(버킷 크기)를 의미하며 날짜 범위 변환이 불필요하다.
 * 하위 호환을 위해 남겨두되 내부적으로 사용하지 않는다.
 */
export function periodToDateRange(_period: Period): { from: string; to: string } {
  const today = new Date();
  const to = today.toISOString().slice(0, 10);
  return { from: '2000-01-01', to };
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
 * 전체 기간 daily_snapshots를 조회한다.
 * 이슈 028: from/to 파라미터 제거 — 집계 단위 전환은 클라이언트에서 버킷팅으로 처리한다.
 *
 * Supabase REST는 요청당 최대 1,000행만 반환하므로 페이지 단위로 나눠 받는다.
 * (전체 히스토리가 1,000일을 넘으면 단건 조회로는 최근 데이터가 잘린다)
 */
const SNAPSHOT_PAGE_SIZE = 1000;

export async function getDailySnapshots(): Promise<DailySnapshot[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('인증 필요');

  const all: DailySnapshot[] = [];
  for (let offset = 0; ; offset += SNAPSHOT_PAGE_SIZE) {
    const { data, error } = await supabase
      .from('daily_snapshots')
      .select(
        'snapshot_date, total_value_krw, principal_krw, cash_krw, cash_usd, net_profit_krw, fx_rate_usd',
      )
      .eq('user_id', user.id)
      .order('snapshot_date', { ascending: true })
      .range(offset, offset + SNAPSHOT_PAGE_SIZE - 1);

    if (error) throw error;
    const batch = (data ?? []) as DailySnapshot[];
    all.push(...batch);
    if (batch.length < SNAPSHOT_PAGE_SIZE) return all;
  }
}

// ────────────────────────────────────────────
// 이벤트 마커 조회 (get_history_markers RPC)
// ────────────────────────────────────────────

/**
 * 배당 이벤트 마커를 조회한다.
 * 이슈 028: p_from/p_to 파라미터 제거 — 전체 기간 배당 마커를 반환한다.
 * 출금 마커(▽)는 RPC에서 제거되어 배당 마커(●)만 반환된다.
 */
export async function getHistoryMarkers(): Promise<HistoryMarker[]> {
  const { data, error } = await supabase.rpc('get_history_markers', {});

  if (error) throw error;
  return (data ?? []) as HistoryMarker[];
}

// ────────────────────────────────────────────
// 당일 스냅샷 수동 새로고침 (refresh-today-snapshot Edge Function)
// ────────────────────────────────────────────

/**
 * 오늘자 스냅샷을 즉시 재계산·저장한다. 일 3회 제한을 서버에서 강제한다.
 *
 * @param currentPrices get-market-prices Edge Function 응답의 prices 배열
 * @param fxRateUsd     get-exchange-rate Edge Function 응답의 rate 값
 * @returns 갱신된 스냅샷 행과 남은 쿼터
 * @throws 400 — current_prices 비어 있거나 형식 오류, fx_rate_usd <= 0
 * @throws 401 — 인증 토큰 없음 또는 만료
 * @throws 422 — account_events 없음
 * @throws 429 — 일 3회 제한 초과 (횟수 미차감)
 * @throws 502 — 내부 계산·저장 실패 (횟수 미차감)
 */
export async function refreshTodaySnapshot(
  currentPrices: MarketPriceItem[],
  fxRateUsd: number,
): Promise<RefreshTodaySnapshotResponse> {
  const { data, error } = await supabase.functions.invoke<RefreshTodaySnapshotResponse>(
    'refresh-today-snapshot',
    {
      body: {
        current_prices: currentPrices.map((p) => ({
          ticker:     p.ticker,
          asset_type: p.asset_type,
          price:      p.price,
          currency:   p.currency,
        })),
        fx_rate_usd: fxRateUsd,
      },
    },
  );

  if (error) {
    // FunctionsHttpError에는 context.responseBody가 있다
    const body =
      error && typeof (error as { context?: { responseBody?: string } }).context?.responseBody === 'string'
        ? (() => {
            try {
              return JSON.parse(
                (error as { context: { responseBody: string } }).context.responseBody,
              ) as { error?: { code?: string; message?: string } };
            } catch {
              return null;
            }
          })()
        : null;

    const code    = body?.error?.code ?? 'UNKNOWN';
    const message = body?.error?.message ?? error.message;
    const httpStatus = parseInt(code, 10);

    const enriched = new Error(`[refresh-today-snapshot] ${code}: ${message}`);
    (enriched as Error & { status?: number }).status = isNaN(httpStatus) ? undefined : httpStatus;
    throw enriched;
  }

  if (!data) {
    throw new Error('[refresh-today-snapshot] 응답 데이터가 없습니다.');
  }

  return data;
}

// ────────────────────────────────────────────
// 스냅샷 새로고침 쿼터 조회 (snapshot_refresh_quotas REST)
// ────────────────────────────────────────────

/**
 * KST 기준 오늘 날짜 문자열(YYYY-MM-DD)을 반환한다.
 */
export function getTodayKst(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

/**
 * 오늘자 수동 새로고침 남은 횟수를 조회한다.
 * `snapshot_refresh_quotas`에 오늘자 행이 없으면 used_count=0(오늘 미사용)으로 반환한다.
 *
 * @returns SnapshotRefreshQuota — used_count(0~3), remaining(0~3), last_refreshed_at
 * @throws 401 — 인증 토큰 없음 또는 만료
 */
export async function getSnapshotRefreshQuota(): Promise<SnapshotRefreshQuota> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('인증 필요');

  const todayKst = getTodayKst();

  const { data, error } = await supabase
    .from('snapshot_refresh_quotas')
    .select('used_count, last_refreshed_at')
    .eq('user_id', user.id)
    .eq('quota_date', todayKst)
    .maybeSingle();

  if (error) throw error;

  // 행이 없으면 오늘 한 번도 사용하지 않은 것
  if (!data) {
    return { used_count: 0, remaining: 3, last_refreshed_at: null };
  }

  return {
    used_count:        data.used_count,
    remaining:         3 - data.used_count,
    last_refreshed_at: data.last_refreshed_at ?? null,
  };
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
