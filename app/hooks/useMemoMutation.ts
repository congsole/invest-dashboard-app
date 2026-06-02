/**
 * useMemoMutation.ts — 메모 생성/수정/삭제 훅
 */

import { useState, useCallback } from 'react';
import { createMemo, updateMemo, deleteMemo } from '../services/memo';
import { MemoItem, CreateMemoInput, UpdateMemoInput } from '../types/memo';

interface UseMemoMutationReturn {
  loading: boolean;
  error: string | null;
  create: (input: CreateMemoInput) => Promise<MemoItem | null>;
  update: (input: UpdateMemoInput) => Promise<MemoItem | null>;
  remove: (memoId: string) => Promise<boolean>;
}

export function useMemoMutation(): UseMemoMutationReturn {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = useCallback(async (input: CreateMemoInput): Promise<MemoItem | null> => {
    setLoading(true);
    setError(null);
    try {
      const result = await createMemo(input);
      return result;
    } catch (e) {
      setError(e instanceof Error ? e.message : '메모 저장 중 오류가 발생했습니다');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const update = useCallback(async (input: UpdateMemoInput): Promise<MemoItem | null> => {
    setLoading(true);
    setError(null);
    try {
      const result = await updateMemo(input);
      return result;
    } catch (e) {
      setError(e instanceof Error ? e.message : '메모 수정 중 오류가 발생했습니다');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const remove = useCallback(async (memoId: string): Promise<boolean> => {
    setLoading(true);
    setError(null);
    try {
      await deleteMemo(memoId);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : '메모 삭제 중 오류가 발생했습니다');
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  return { loading, error, create, update, remove };
}
