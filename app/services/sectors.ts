/**
 * sectors.ts — 섹터 마스터 서비스 함수
 *
 * API 명세 참조: docs/api/api-spec.md — Sector 섹션
 * 이슈 009: sectors 테이블 클라이언트 유틸
 */

import { supabase } from '../utils/supabase';
import { Sector } from '../types/sector';

// ────────────────────────────────────────────
// 섹터 목록 조회
// GICS 11 + 가상자산 12개 고정 시드를 id 오름차순으로 반환
// ────────────────────────────────────────────

export async function getSectors(): Promise<Sector[]> {
  const { data, error } = await supabase
    .from('sectors')
    .select('*')
    .order('id', { ascending: true });

  if (error) {
    throw new Error(
      `[sectors/getSectors] 섹터 목록 조회 실패: ${error.message} (code: ${error.code})`,
    );
  }

  return (data ?? []) as Sector[];
}
