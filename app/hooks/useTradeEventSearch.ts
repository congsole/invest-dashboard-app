/**
 * useTradeEventSearch.ts — 매매이벤트 선택 모달용 검색 훅
 *
 * [026] 신규: 메모 측 매매이벤트 연결 UI
 *
 * - buy/sell 이벤트만 대상
 * - 텍스트 검색 디바운스 300ms
 * - 기간 필터 (from/to)
 * - 필터 변경 시 클라이언트 필터 우선 (이미 패칭된 데이터) → 서버 재호출은
 *   텍스트 검색 변경 시에만 (기간 필터는 클라이언트에서)
 *
 * CLAUDE.md 렌더링 최적화 준수:
 * - initialLoading / searching 상태 분리
 * - allEvents(전체 마스터) + filteredEvents(파생, useMemo) 구분
 * - 기간 필터는 클라이언트 사이드 필터 (서버 재호출 없음)
 * - 텍스트 검색만 서버 재호출 (데이터량 제한, 디바운스)
 */

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { getTradeEvents } from '../services/accountEvents';
import { AccountEvent } from '../types/accountEvent';

interface UseTradeEventSearchReturn {
  allEvents: AccountEvent[];
  filteredEvents: AccountEvent[];
  initialLoading: boolean;
  searching: boolean;
  error: string | null;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  filterFrom: string;
  setFilterFrom: (from: string) => void;
  filterTo: string;
  setFilterTo: (to: string) => void;
  reload: () => Promise<void>;
}

export function useTradeEventSearch(initialQuery?: string): UseTradeEventSearchReturn {
  const [allEvents, setAllEvents] = useState<AccountEvent[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 텍스트 검색어 (서버로 전달)
  const [searchQuery, setSearchQuery] = useState(initialQuery ?? '');
  // 기간 필터 (클라이언트 필터)
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');

  // 디바운스용 ref
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 직전 검색어 추적 (초기 마운트 시 effect 2가 이중 패치를 일으키는 것을 방지)
  const prevSearchQueryRef = useRef(initialQuery ?? '');

  const fetchEvents = useCallback(async (q: string, isInitial: boolean) => {
    if (isInitial) {
      setInitialLoading(true);
    } else {
      setSearching(true);
    }
    setError(null);
    try {
      const data = await getTradeEvents({ q: q || undefined });
      setAllEvents(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : '매매이벤트를 불러오지 못했습니다');
    } finally {
      setInitialLoading(false);
      setSearching(false);
    }
  }, []);

  // 초기 로드
  useEffect(() => {
    fetchEvents(initialQuery ?? '', true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // searchQuery 변경 시 디바운스 재조회
  // prevSearchQueryRef로 실제 변경 여부를 판단하여 초기 마운트 시 이중 패치를 방지한다.
  useEffect(() => {
    if (searchQuery === prevSearchQueryRef.current) return;
    prevSearchQueryRef.current = searchQuery;

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      fetchEvents(searchQuery, false);
    }, 300);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [searchQuery, fetchEvents]);

  const reload = useCallback(async () => {
    await fetchEvents(searchQuery, false);
  }, [searchQuery, fetchEvents]);

  // 기간 필터는 클라이언트 사이드
  const filteredEvents = useMemo(() => {
    let result = allEvents;
    if (filterFrom) {
      result = result.filter((e) => e.event_date >= filterFrom);
    }
    if (filterTo) {
      result = result.filter((e) => e.event_date <= filterTo);
    }
    return result;
  }, [allEvents, filterFrom, filterTo]);

  return {
    allEvents,
    filteredEvents,
    initialLoading,
    searching,
    error,
    searchQuery,
    setSearchQuery,
    filterFrom,
    setFilterFrom,
    filterTo,
    setFilterTo,
    reload,
  };
}
