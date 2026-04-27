/**
 * dailySnapshots.ts — 일별 스냅샷 서비스 함수
 *
 * API 명세 참조: docs/api/api-spec.md — DailySnapshot 섹션
 */

import { supabase } from '../utils/supabase';
import { DailySnapshot } from '../types/dashboard';

// ────────────────────────────────────────────
// 스냅샷 목록 조회 (그래프용)
// ────────────────────────────────────────────

/**
 * 기간 필터로 daily_snapshots를 조회한다.
 * @param from 조회 시작일 (YYYY-MM-DD)
 * @param to 조회 종료일 (YYYY-MM-DD)
 */
export async function getDailySnapshots(
  from: string,
  to: string,
): Promise<DailySnapshot[]> {
  const { data: userResult } = await supabase.auth.getUser();
  const user = userResult?.user;
  if (!user) {
    throw new Error('인증 필요: 로그인 후 다시 시도하세요.');
  }

  const { data, error } = await supabase
    .from('daily_snapshots')
    .select(
      'snapshot_date, total_value_krw, principal_krw, cash_krw, cash_usd, net_profit_krw, fx_rate_usd',
    )
    .eq('user_id', user.id)
    .gte('snapshot_date', from)
    .lte('snapshot_date', to)
    .order('snapshot_date', { ascending: true });

  if (error) {
    throw new Error(`daily_snapshots 조회 실패 (${error.code}): ${error.message}`);
  }

  return (data ?? []) as DailySnapshot[];
}

// ────────────────────────────────────────────
// 가장 최근 스냅샷 단건 조회
// ────────────────────────────────────────────

/**
 * 가장 최근 daily_snapshot 1건을 반환한다.
 * 스냅샷이 없으면 null 반환.
 */
export async function getLatestSnapshot(): Promise<DailySnapshot | null> {
  const { data: userResult } = await supabase.auth.getUser();
  const user = userResult?.user;
  if (!user) {
    throw new Error('인증 필요: 로그인 후 다시 시도하세요.');
  }

  const { data, error } = await supabase
    .from('daily_snapshots')
    .select(
      'snapshot_date, total_value_krw, principal_krw, cash_krw, cash_usd, net_profit_krw, fx_rate_usd',
    )
    .eq('user_id', user.id)
    .order('snapshot_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`최근 스냅샷 조회 실패 (${error.code}): ${error.message}`);
  }

  return data as DailySnapshot | null;
}
