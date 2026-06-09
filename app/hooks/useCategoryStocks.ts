/**
 * useCategoryStocks.ts — 카테고리 소속 종목 목록 + 추가/제거 커스텀 훅
 *
 * 이슈 024: 사용자 카테고리 CRUD + 종목 관리
 *
 * 렌더링 최적화:
 * - initialLoading / mutating 상태 분리
 * - useCallback으로 함수 참조 안정화
 */

import { useCallback, useEffect, useState } from 'react';
import {
  listCategoryStocks,
  addCategoryStock,
  removeCategoryStock,
} from '../services/category';
import { UserCategoryStock } from '../types/category';

interface UseCategoryStocksResult {
  stocks: UserCategoryStock[];
  initialLoading: boolean;
  mutating: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  addStock: (stockId: string) => Promise<void>;
  removeStock: (stockId: string) => Promise<void>;
}

export function useCategoryStocks(categoryId: string): UseCategoryStocksResult {
  const [stocks, setStocks] = useState<UserCategoryStock[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [mutating, setMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStocks = useCallback(async () => {
    try {
      const data = await listCategoryStocks(categoryId);
      setStocks(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : '종목 목록을 불러오지 못했습니다');
    }
  }, [categoryId]);

  useEffect(() => {
    setInitialLoading(true);
    fetchStocks().finally(() => setInitialLoading(false));
  }, [fetchStocks]);

  const refresh = useCallback(async () => {
    await fetchStocks();
  }, [fetchStocks]);

  const addStock = useCallback(
    async (stockId: string): Promise<void> => {
      setMutating(true);
      try {
        const added = await addCategoryStock({ category_id: categoryId, stock_id: stockId });
        setStocks((prev) => [...prev, added]);
        setError(null);
      } catch (e) {
        const msg = e instanceof Error ? e.message : '종목 추가 실패';
        setError(msg);
        throw e;
      } finally {
        setMutating(false);
      }
    },
    [categoryId],
  );

  const removeStock = useCallback(
    async (stockId: string): Promise<void> => {
      setMutating(true);
      try {
        await removeCategoryStock(categoryId, stockId);
        setStocks((prev) => prev.filter((s) => s.stock_id !== stockId));
        setError(null);
      } catch (e) {
        const msg = e instanceof Error ? e.message : '종목 제거 실패';
        setError(msg);
        throw e;
      } finally {
        setMutating(false);
      }
    },
    [categoryId],
  );

  return {
    stocks,
    initialLoading,
    mutating,
    error,
    refresh,
    addStock,
    removeStock,
  };
}
