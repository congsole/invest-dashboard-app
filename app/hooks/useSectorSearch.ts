/**
 * useSectorSearch.ts — 섹터 키워드 검색 훅
 *
 * [023] CascadingSectorPicker 검색 기능 추가
 *
 * 동작:
 * - 전체 섹터(~273개)를 getAllSectorsWithCache()로 1회 로드
 * - 검색어 2글자 이상부터 클라이언트 사이드 필터링 (디바운스 300ms)
 * - 매칭 조건: name(한글명) + name_en(영문명) 부분 일치, 공백 무시, 대소문자 무시
 * - 결과에 breadcrumb(L1→L4 경로) 포함
 * - 결과 정렬: 레벨 오름차순 → 이름 가나다순
 *
 * CLAUDE.md 렌더링 최적화:
 * - 마스터 데이터(allSectors)와 파생 데이터(results) 명확히 분리
 * - 디바운스로 과도한 필터링 방지
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { getAllSectorsWithCache } from '../services/sectors';
import { Sector } from '../types/sector';

// ────────────────────────────────────────────
// 타입
// ────────────────────────────────────────────

export interface SectorSearchResult {
  sector: Sector;
  /** L1부터 해당 섹터까지의 경로 (해당 섹터 포함). 예: [L1, L2, L3, L4] */
  breadcrumb: Sector[];
}

export interface UseSectorSearchReturn {
  query: string;
  setQuery: (q: string) => void;
  clearQuery: () => void;
  /** 검색어 2글자 미만이면 빈 배열 */
  results: SectorSearchResult[];
  /** 전체 섹터 초기 로드 중 */
  loading: boolean;
  /** 전체 섹터 로드 실패 */
  error: string | null;
  /** 검색어 2글자 이상이면 true (검색 모드 판단용) */
  isSearchMode: boolean;
}

// ────────────────────────────────────────────
// 내부 유틸
// ────────────────────────────────────────────

function buildBreadcrumb(sector: Sector, sectorMap: Map<number, Sector>): Sector[] {
  const path: Sector[] = [sector];
  let current = sector;
  while (current.parent_id !== null) {
    const parent = sectorMap.get(current.parent_id);
    if (!parent) break;
    path.unshift(parent);
    current = parent;
  }
  return path; // [L1, L2?, L3?, L4?] 순서
}

function filterSectors(
  query: string,
  allSectors: Sector[],
  sectorMap: Map<number, Sector>,
): SectorSearchResult[] {
  const normalized = query.replace(/\s/g, '').toLowerCase();
  if (normalized.length < 2) return [];

  const matched = allSectors.filter((sector) => {
    const nameMatch = sector.name.replace(/\s/g, '').toLowerCase().includes(normalized);
    const nameEnMatch = sector.name_en
      ? sector.name_en.replace(/\s/g, '').toLowerCase().includes(normalized)
      : false;
    return nameMatch || nameEnMatch;
  });

  // 레벨 오름차순 → 이름 가나다순 정렬
  matched.sort((a, b) => {
    if (a.level !== b.level) return a.level - b.level;
    return a.name.localeCompare(b.name, 'ko');
  });

  return matched.map((sector) => ({
    sector,
    breadcrumb: buildBreadcrumb(sector, sectorMap),
  }));
}

// ────────────────────────────────────────────
// 훅
// ────────────────────────────────────────────

export function useSectorSearch(): UseSectorSearchReturn {
  const [query, setQueryState] = useState('');
  const [results, setResults] = useState<SectorSearchResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 마스터 데이터
  const allSectorsRef = useRef<Sector[]>([]);
  const sectorMapRef = useRef<Map<number, Sector>>(new Map());
  const isMounted = useRef(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // 전체 섹터 초기 로드
  useEffect(() => {
    setLoading(true);
    getAllSectorsWithCache()
      .then((sectors) => {
        if (!isMounted.current) return;
        allSectorsRef.current = sectors;
        const map = new Map<number, Sector>();
        sectors.forEach((s) => map.set(s.id, s));
        sectorMapRef.current = map;
        setError(null);
      })
      .catch((e) => {
        if (!isMounted.current) return;
        setError(e instanceof Error ? e.message : '섹터 목록 로드 실패');
      })
      .finally(() => {
        if (isMounted.current) setLoading(false);
      });
  }, []);

  const setQuery = useCallback((q: string) => {
    setQueryState(q);

    if (timerRef.current) clearTimeout(timerRef.current);

    const trimmed = q.trim();
    if (trimmed.replace(/\s/g, '').length < 2) {
      setResults([]);
      return;
    }

    timerRef.current = setTimeout(() => {
      if (!isMounted.current) return;
      const filtered = filterSectors(trimmed, allSectorsRef.current, sectorMapRef.current);
      setResults(filtered);
    }, 300);
  }, []);

  const clearQuery = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setQueryState('');
    setResults([]);
  }, []);

  const isSearchMode = query.trim().replace(/\s/g, '').length >= 2;

  return {
    query,
    setQuery,
    clearQuery,
    results,
    loading,
    error,
    isSearchMode,
  };
}
