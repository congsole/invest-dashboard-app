/**
 * useMemoDetail.ts — 메모 상세 조회 훅
 */

import { useState, useCallback } from 'react';
import { getMemo } from '../services/memo';
import { MemoDetail } from '../types/memo';

interface UseMemoDetailReturn {
  memo: MemoDetail | null;
  loading: boolean;
  error: string | null;
  fetch: (memoId: string) => Promise<void>;
}

export function useMemoDetail(): UseMemoDetailReturn {
  const [memo, setMemo] = useState<MemoDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async (memoId: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await getMemo(memoId);
      setMemo(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : '메모를 불러오지 못했습니다');
    } finally {
      setLoading(false);
    }
  }, []);

  return { memo, loading, error, fetch };
}
