/**
 * useMemos.ts — 메모 목록 조회 훅
 *
 * 렌더링 최적화 원칙 준수:
 * - initialLoading / refreshing 분리
 * - 필터 변경은 서버 재호출로 처리 (페이지네이션 포함 전체 데이터 수신 불가)
 * - 달력형/리스트형 모두 동일 데이터 소스 사용
 */

import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {listMemos} from '../services/memo';
import {DayMemoSummary, EntityType, ListMemosParams, MemoItem,} from '../types/memo';

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
  // [025] 카테고리 타입 추가
  if (memo.categories.length > 0) types.push('category');
  if (types.length === 0) types.push('none');
  return types.slice(0, 4);
}

// 날짜 문자열 추출 (YYYY-MM-DD)
function toDateString(isoString: string): string {
  return isoString.slice(0, 10);
}

// id 기준 중복 제거 (먼저 등장한 항목 유지)
// offset 페이지네이션 경계에서 같은 메모가 두 페이지에 걸쳐 들어와도
// FlatList 중복 키 경고가 발생하지 않도록 방어한다.
function dedupeById(memos: MemoItem[]): MemoItem[] {
  const seen = new Set<string>();
  const result: MemoItem[] = [];
  for (const memo of memos) {
    if (seen.has(memo.id)) continue;
    seen.add(memo.id);
    result.push(memo);
  }
  return result;
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
      existing.entityTypes = Array.from(mergedSet).slice(0, 4) as EntityType[];
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
  const totalCountRef = useRef(0);
  const loadingMoreRef = useRef(false);
  const isMounted = useRef(true);
  const hasFetchedRef = useRef(false);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  const fetch = useCallback(async (params: ListMemosParams = {}) => {
    paramsRef.current = { ...params };
    offsetRef.current = 0;

    // initialLoading은 최초 fetch에만 — 이후 재조회는 기존 데이터를 유지
    const isInitial = !hasFetchedRef.current;
    if (isInitial) setInitialLoading(true);
    setError(null);

    try {
      const result = await listMemos({
        ...paramsRef.current,
        p_limit: PAGE_SIZE,
        p_offset: 0,
      });
      if (!isMounted.current) return;
      hasFetchedRef.current = true;
      setAllMemos(result.memos);
      setTotalCount(result.total_count);
      totalCountRef.current = result.total_count;
      offsetRef.current = result.memos.length;
    } catch (e) {
      if (!isMounted.current) return;
      setError(e instanceof Error ? e.message : '메모 목록을 불러오지 못했습니다');
    } finally {
      if (isMounted.current && isInitial) setInitialLoading(false);
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
      totalCountRef.current = result.total_count;
      offsetRef.current = result.memos.length;
    } catch (e) {
      if (!isMounted.current) return;
      setError(e instanceof Error ? e.message : '새로고침 중 오류가 발생했습니다');
    } finally {
      if (isMounted.current) setRefreshing(false);
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || offsetRef.current >= totalCountRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const result = await listMemos({
        ...paramsRef.current,
        p_limit: PAGE_SIZE,
        p_offset: offsetRef.current,
      });
      if (!isMounted.current) return;
      setAllMemos((prev) => dedupeById([...prev, ...result.memos]));
      setTotalCount(result.total_count);
      totalCountRef.current = result.total_count;
      offsetRef.current += result.memos.length;
    } catch (e) {
      if (!isMounted.current) return;
      setError(e instanceof Error ? e.message : '더 불러오기 중 오류가 발생했습니다');
    } finally {
      loadingMoreRef.current = false;
      if (isMounted.current) setLoadingMore(false);
    }
  }, []);

  const calendarSummary = useMemo(() => buildCalendarSummary(allMemos), [allMemos]);
  const hasMore = offsetRef.current < totalCount;

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
