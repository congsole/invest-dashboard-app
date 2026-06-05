/**
 * sectors.ts — 섹터 마스터 서비스 함수
 *
 * API 명세 참조: docs/api/api-spec.md — Sector 섹션
 * [009] 초기 작성: sectors 테이블 클라이언트 유틸
 * [016] GICS 계층화: getSectors level/parent_id 필터 추가, getSectorBreadcrumb RPC 추가
 */

import { supabase } from '../utils/supabase';
import { Sector, SectorBreadcrumb, SectorLevel } from '../types/sector';

// ────────────────────────────────────────────
// 섹터 목록 조회
//
// GICS 4단계 계층 구조(~273개)를 조회한다.
// level/parent_id 필터로 특정 레벨 또는 특정 부모의 하위 섹터만 조회 가능.
// ────────────────────────────────────────────

export interface GetSectorsParams {
  /** GICS 계층 레벨 필터. 미지정 시 전체 반환. */
  level?: SectorLevel;
  /** 특정 상위 섹터의 직접 하위만 조회. cascading select에서 사용. */
  parent_id?: number;
}

export async function getSectors(params?: GetSectorsParams): Promise<Sector[]> {
  let query = supabase
    .from('sectors')
    .select('id, code, name, name_en, parent_id, level')
    .order('id', { ascending: true });

  if (params?.level !== undefined) {
    query = query.eq('level', params.level);
  }

  if (params?.parent_id !== undefined) {
    query = query.eq('parent_id', params.parent_id);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(
      `[sectors/getSectors] 섹터 목록 조회 실패: ${error.message} (code: ${error.code})`,
    );
  }

  return (data ?? []) as Sector[];
}

// ────────────────────────────────────────────
// 섹터 breadcrumb 조회 (RPC)
//
// 주어진 sector_id(보통 L4)에서 L1까지 조상 경로를 1회 호출로 반환.
// 응답: level 오름차순 정렬 (L1 → L2 → L3 → L4).
// ────────────────────────────────────────────

export async function getSectorBreadcrumb(sectorId: number): Promise<SectorBreadcrumb> {
  const { data, error } = await supabase.rpc('get_sector_breadcrumb', {
    p_sector_id: sectorId,
  });

  if (error) {
    // 404: sector_id 존재하지 않음
    if (error.code === 'no_data_found' || error.message.includes('sector not found')) {
      throw new Error(
        `[sectors/getSectorBreadcrumb] 섹터를 찾을 수 없습니다 (sector_id: ${sectorId}): ${error.message}`,
      );
    }
    throw new Error(
      `[sectors/getSectorBreadcrumb] breadcrumb 조회 실패 (sector_id: ${sectorId}): ${error.message} (code: ${error.code})`,
    );
  }

  return (data ?? []) as SectorBreadcrumb;
}
