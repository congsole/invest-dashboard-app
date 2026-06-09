/**
 * useCategories.ts — 사용자 카테고리 목록 + CRUD 커스텀 훅
 *
 * 이슈 024: 사용자 카테고리 CRUD + 종목 관리
 *
 * 렌더링 최적화:
 * - initialLoading / saving 상태 분리 (초기 로드 vs 저장 중)
 * - 카테고리 추가/수정/삭제는 낙관적 업데이트 없이 서버 응답 기준
 * - useCallback으로 함수 참조 안정화
 */

import { useCallback, useEffect, useState } from 'react';
import {
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} from '../services/category';
import { UserCategoryWithCount } from '../types/category';

interface UseCategoriesResult {
  categories: UserCategoryWithCount[];
  initialLoading: boolean;
  saving: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  addCategory: (name: string) => Promise<UserCategoryWithCount>;
  renameCategory: (categoryId: string, newName: string) => Promise<void>;
  removeCategory: (categoryId: string) => Promise<void>;
}

export function useCategories(userId: string | null): UseCategoriesResult {
  const [categories, setCategories] = useState<UserCategoryWithCount[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCategories = useCallback(async () => {
    if (!userId) {
      setCategories([]);
      setInitialLoading(false);
      return;
    }
    try {
      const data = await listCategories(userId);
      setCategories(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : '카테고리 목록을 불러오지 못했습니다');
    }
  }, [userId]);

  // 초기 로드
  useEffect(() => {
    setInitialLoading(true);
    fetchCategories().finally(() => setInitialLoading(false));
  }, [fetchCategories]);

  const refresh = useCallback(async () => {
    await fetchCategories();
  }, [fetchCategories]);

  const addCategory = useCallback(
    async (name: string): Promise<UserCategoryWithCount> => {
      if (!userId) throw new Error('로그인이 필요합니다');
      setSaving(true);
      try {
        const created = await createCategory({ user_id: userId, name });
        setCategories((prev) => [...prev, created]);
        setError(null);
        return created;
      } catch (e) {
        const msg = e instanceof Error ? e.message : '카테고리 생성 실패';
        setError(msg);
        throw e;
      } finally {
        setSaving(false);
      }
    },
    [userId],
  );

  const renameCategory = useCallback(
    async (categoryId: string, newName: string): Promise<void> => {
      setSaving(true);
      try {
        const updated = await updateCategory(categoryId, { name: newName });
        setCategories((prev) =>
          prev.map((c) => (c.id === categoryId ? updated : c)),
        );
        setError(null);
      } catch (e) {
        const msg = e instanceof Error ? e.message : '카테고리 수정 실패';
        setError(msg);
        throw e;
      } finally {
        setSaving(false);
      }
    },
    [],
  );

  const removeCategory = useCallback(async (categoryId: string): Promise<void> => {
    setSaving(true);
    try {
      await deleteCategory(categoryId);
      setCategories((prev) => prev.filter((c) => c.id !== categoryId));
      setError(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '카테고리 삭제 실패';
      setError(msg);
      throw e;
    } finally {
      setSaving(false);
    }
  }, []);

  return {
    categories,
    initialLoading,
    saving,
    error,
    refresh,
    addCategory,
    renameCategory,
    removeCategory,
  };
}
