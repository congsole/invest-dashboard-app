/**
 * useStockSearch.ts — 종목 검색 훅
 *
 * 이슈 013: 종목 검색 UI 컴포넌트
 *
 * 동작:
 * - 검색어 2자 이상부터 로컬 DB 검색 시작 (디바운스 300ms)
 * - 로컬 결과 0건이면 자동으로 외부 FastAPI 검색 전환
 * - source로 현재 결과가 로컬인지 외부인지 구분 가능
 *
 * CLAUDE.md 렌더링 최적화 원칙:
 * - 검색 결과를 allResults(마스터)로 관리
 * - 로딩 상태: localLoading (로컬+외부 통합 검색 중 표시)
 * - 불필요한 리렌더링 방지 (useCallback)
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { searchStocks, SearchStocksParams, StockSearchSource } from '../services/stocks';
import { StockSearchResult, ExternalStockSearchResult, StockMarket } from '../types/sector';

export interface StockSearchState {
  localResults: StockSearchResult[];
  externalResults: ExternalStockSearchResult[];
  source: StockSearchSource | null;  // null = 검색 전
  localLoading: boolean;
  error: string | null;
}

interface UseStockSearchReturn extends StockSearchState {
  query: string;
  setQuery: (q: string) => void;
  reset: () => void;
}

const INITIAL_STATE: StockSearchState = {
  localResults: [],
  externalResults: [],
  source: null,
  localLoading: false,
  error: null,
};

export function useStockSearch(market?: StockMarket): UseStockSearchReturn {
  const [query, setQuery] = useState('');
  const [state, setState] = useState<StockSearchState>(INITIAL_STATE);

  // debounce 타이머 ref
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  // 검색어 변경 시 디바운스 300ms 후 검색 실행
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);

    const trimmed = query.trim();

    if (trimmed.length < 2) {
      setState(INITIAL_STATE);
      return;
    }

    // 로딩 시작 표시 (기존 결과 유지, 로딩 오버레이)
    setState((prev) => ({ ...prev, localLoading: true, error: null }));

    timerRef.current = setTimeout(async () => {
      if (!isMounted.current) return;

      const params: SearchStocksParams = { q: trimmed, market };

      try {
        const result = await searchStocks(params);
        if (!isMounted.current) return;

        if (result.source === 'local') {
          setState({
            localResults: result.localResults,
            externalResults: [],
            source: 'local',
            localLoading: false,
            error: null,
          });
        } else {
          // 외부 검색 결과
          setState({
            localResults: [],
            externalResults: result.externalResults?.results ?? [],
            source: 'external',
            localLoading: false,
            error: null,
          });
        }
      } catch (e) {
        if (!isMounted.current) return;
        setState((prev) => ({
          ...prev,
          localLoading: false,
          error: e instanceof Error ? e.message : '종목 검색 중 오류가 발생했습니다',
        }));
      }
    }, 300);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [query, market]);

  const reset = useCallback(() => {
    setQuery('');
    setState(INITIAL_STATE);
  }, []);

  return {
    query,
    setQuery,
    reset,
    ...state,
  };
}
