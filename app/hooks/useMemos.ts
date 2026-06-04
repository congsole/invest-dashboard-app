/**
 * useMemos.ts — 메모 목록 조회 훅
 *
 * 렌더링 최적화 원칙 준수:
 * - initialLoading / refreshing 분리
 * - 필터는 클라이언트 사이드 useMemo로 처리 (서버 재호출 최소화)
 * - 달력형/리스트형 모두 동일 데이터 소스 사용
 */

import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { listMemos } from '../services/memo';
import {
  MemoItem,
  ListMemosParams,
  MemoFilterState,
  DayMemoSummary,
  EntityType,
} from '../types/memo';

interface UseMemosReturn {
  allMemos: MemoItem[];
  calendarSummary: Map<string, DayMemoSummary>;
  totalCount: number;
  initialLoading: boolean;
  refreshing: boolean;
  loadingMore: boolean;
  error: string | null;
  fetch: (params?: ListMemosParams) => Promise<void>;
  refresh: () => Promise<void>;
  loadMore: () => Promise<void>;
  hasMore: boolean;
}

const PAGE_SIZE = 20;

// 메모 아이템에서 엔티티 타입 추출 (중복 제거, 우선순위 순)
function extractEntityTypes(memo: MemoItem): EntityType[] {
  const types: EntityType[] = [];
  if (memo.stocks.length > 0) types.push('stock');
  if (memo.trade_events.length > 0) types.push('trade_event');
  if (memo.news.length > 0) types.push('news');
  if (memo.sectors.length > 0) types.push('sector');
  if (types.length === 0) types.push('none');
  return types.slice(0, 4);
}

// 날짜 문자열 추출 (YYYY-MM-DD)
function toDateString(isoString: string): string {
  return isoString.slice(0, 10);
}

// 달력형 요약 맵 생성
function buildCalendarSummary(memos: MemoItem[]): Map<string, DayMemoSummary> {
  const map = new Map<string, DayMemoSummary>();
  for (const memo of memos) {
    const date = toDateString(memo.created_at);
    const existing = map.get(date);
    const entityTypes = extractEntityTypes(memo);

    if (existing) {
      // 타입 중복 제거 유지
      const mergedSet = new Set([...existing.entityTypes, ...entityTypes]);
      const merged = Array.from(mergedSet).slice(0, 4) as EntityType[];
      existing.entityTypes = merged;
      existing.memoIds.push(memo.id);
    } else {
      map.set(date, {
        date,
        entityTypes,
        memoIds: [memo.id],
      });
    }
  }
  return map;
}

export function useMemos(initialParams: ListMemosParams = {}): UseMemosReturn {
  const [allMemos, setAllMemos] = useState<MemoItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [initialLoading, setInitialLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const paramsRef = useRef<ListMemosParams>(initialParams);
  const offsetRef = useRef(0);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  const fetch = useCallback(async (params: ListMemosParams = {}) => {
    paramsRef.current = { ...params };
    offsetRef.current = 0;
    setInitialLoading(true);
    setError(null);
    try {
      const result = await listMemos({
        ...paramsRef.current,
        p_limit: PAGE_SIZE,
        p_offset: 0,
      });
      if (!isMounted.current) return;
      setAllMemos(result.memos);
      setTotalCount(result.total_count);
      offsetRef.current = result.memos.length;
    } catch (e) {
      if (!isMounted.current) return;
      setError(e instanceof Error ? e.message : '메모 목록을 불러오지 못했습니다');
    } finally {
      if (isMounted.current) setInitialLoading(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    offsetRef.current = 0;
    setRefreshing(true);
    setError(null);
    try {
      const result = await listMemos({
        ...paramsRef.current,
        p_limit: PAGE_SIZE,
        p_offset: 0,
      });
      if (!isMounted.current) return;
      setAllMemos(result.memos);
      setTotalCount(result.total_count);
      offsetRef.current = result.memos.length;
    } catch (e) {
      if (!isMounted.current) return;
      setError(e instanceof Error ? e.message : '새로고침 중 오류가 발생했습니다');
    } finally {
      if (isMounted.current) setRefreshing(false);
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (loadingMore || allMemos.length >= totalCount) return;
    setLoadingMore(true);
    try {
      const result = await listMemos({
        ...paramsRef.current,
        p_limit: PAGE_SIZE,
        p_offset: offsetRef.current,
      });
      if (!isMounted.current) return;
      setAllMemos((prev) => [...prev, ...result.memos]);
      setTotalCount(result.total_count);
      offsetRef.current += result.memos.length;
    } catch (e) {
      if (!isMounted.current) return;
      setError(e instanceof Error ? e.message : '더 불러오기 중 오류가 발생했습니다');
    } finally {
      if (isMounted.current) setLoadingMore(false);
    }
  }, [loadingMore, allMemos.length, totalCount]);

  const calendarSummary = useMemo(() => buildCalendarSummary(allMemos), [allMemos]);
  const hasMore = allMemos.length < totalCount;

  return {
    allMemos,
    calendarSummary,
    totalCount,
    initialLoading,
    refreshing,
    loadingMore,
    error,
    fetch,
    refresh,
    loadMore,
    hasMore,
  };
}
