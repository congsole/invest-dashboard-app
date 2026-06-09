/**
 * category.ts — 사용자 카테고리 서비스 함수
 *
 * API 명세 참조: docs/api/api-spec.md — UserCategory 섹션
 * 이슈 024: 사용자 카테고리 CRUD + 종목 관리
 *
 * 구현 방식: REST (Supabase PostgREST auto-generated)
 * Edge Function / RPC 없음
 */

import { supabase } from '../utils/supabase';
import {
  UserCategoryWithCount,
  UserCategoryStock,
  CreateCategoryInput,
  UpdateCategoryInput,
  AddCategoryStockInput,
} from '../types/category';

// ────────────────────────────────────────────
// 카테고리 CRUD
// ────────────────────────────────────────────

/**
 * 사용자의 카테고리 목록을 소속 종목 수와 함께 조회한다.
 * 생성순(created_at asc)으로 반환한다.
 */
export async function listCategories(userId: string): Promise<UserCategoryWithCount[]> {
  const { data, error } = await supabase
    .from('user_categories')
    .select('*, user_category_stocks(count)')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (error) {
    throw Object.assign(
      new Error(`카테고리 목록 조회 실패: ${error.message}`),
      { code: error.code, details: error.details, hint: error.hint },
    );
  }

  return (data ?? []) as UserCategoryWithCount[];
}

/**
 * 새 카테고리를 생성한다.
 * 같은 사용자 내 동일 이름은 UNIQUE 제약(23505)으로 차단된다.
 */
export async function createCategory(input: CreateCategoryInput): Promise<UserCategoryWithCount> {
  const { data, error } = await supabase
    .from('user_categories')
    .insert({ user_id: input.user_id, name: input.name })
    .select('*, user_category_stocks(count)')
    .single();

  if (error) {
    const status = error.code === '23505' ? 409 : undefined;
    throw Object.assign(
      new Error(`카테고리 생성 실패 [${status ?? error.code}]: ${error.message}`),
      { code: error.code, status, details: error.details, hint: error.hint },
    );
  }

  return data as UserCategoryWithCount;
}

/**
 * 카테고리 이름을 변경한다.
 * RLS: 본인 카테고리만 수정 가능 (다른 사용자 시도 시 0 rows 반환 → 404로 처리).
 */
export async function updateCategory(
  categoryId: string,
  input: UpdateCategoryInput,
): Promise<UserCategoryWithCount> {
  const { data, error } = await supabase
    .from('user_categories')
    .update({ name: input.name, updated_at: new Date().toISOString() })
    .eq('id', categoryId)
    .select('*, user_category_stocks(count)')
    .maybeSingle();

  if (error) {
    const status = error.code === '23505' ? 409 : undefined;
    throw Object.assign(
      new Error(`카테고리 수정 실패 [${status ?? error.code}]: ${error.message}`),
      { code: error.code, status, details: error.details, hint: error.hint },
    );
  }

  if (!data) {
    throw Object.assign(
      new Error(`카테고리 수정 실패 [404]: 카테고리를 찾을 수 없음 (id=${categoryId})`),
      { status: 404 },
    );
  }

  return data as UserCategoryWithCount;
}

/**
 * 카테고리를 삭제한다.
 * user_category_stocks, memo_categories는 cascade 삭제된다. 메모 본체는 유지.
 * RLS: 본인 카테고리만 삭제 가능 (다른 사용자 시도 시 0 rows 반환 → 404로 처리).
 */
export async function deleteCategory(categoryId: string): Promise<null> {
  const { error, count } = await supabase
    .from('user_categories')
    .delete({ count: 'exact' })
    .eq('id', categoryId);

  if (error) {
    throw Object.assign(
      new Error(`카테고리 삭제 실패 [${error.code}]: ${error.message}`),
      { code: error.code, details: error.details, hint: error.hint },
    );
  }

  if (count === 0) {
    throw Object.assign(
      new Error(`카테고리 삭제 실패 [404]: 카테고리를 찾을 수 없음 (id=${categoryId})`),
      { status: 404 },
    );
  }

  return null;
}

// ────────────────────────────────────────────
// 카테고리 종목 관리
// ────────────────────────────────────────────

/**
 * 카테고리에 속한 종목 목록을 종목 상세 정보와 함께 조회한다.
 */
export async function listCategoryStocks(categoryId: string): Promise<UserCategoryStock[]> {
  const { data, error } = await supabase
    .from('user_category_stocks')
    .select('*, stocks(*)')
    .eq('category_id', categoryId);

  if (error) {
    throw Object.assign(
      new Error(`카테고리 종목 목록 조회 실패 [${error.code}]: ${error.message}`),
      { code: error.code, details: error.details, hint: error.hint },
    );
  }

  return (data ?? []) as UserCategoryStock[];
}

/**
 * 카테고리에 종목을 추가한다.
 * 이미 추가된 종목은 PK 중복(23505)으로 차단된다.
 */
export async function addCategoryStock(input: AddCategoryStockInput): Promise<UserCategoryStock> {
  const { data, error } = await supabase
    .from('user_category_stocks')
    .insert({ category_id: input.category_id, stock_id: input.stock_id })
    .select('*, stocks(*)')
    .single();

  if (error) {
    const status = error.code === '23505' ? 400 : error.code === '23503' ? 404 : undefined;
    throw Object.assign(
      new Error(`카테고리 종목 추가 실패 [${status ?? error.code}]: ${error.message}`),
      { code: error.code, status, details: error.details, hint: error.hint },
    );
  }

  return data as UserCategoryStock;
}

/**
 * 카테고리에서 종목을 제거한다.
 * 종목 자체 및 카테고리는 유지된다.
 * 존재하지 않는 연결 제거 시 0 rows 반환 → 404로 처리.
 */
export async function removeCategoryStock(
  categoryId: string,
  stockId: string,
): Promise<null> {
  const { error, count } = await supabase
    .from('user_category_stocks')
    .delete({ count: 'exact' })
    .eq('category_id', categoryId)
    .eq('stock_id', stockId);

  if (error) {
    throw Object.assign(
      new Error(`카테고리 종목 제거 실패 [${error.code}]: ${error.message}`),
      { code: error.code, details: error.details, hint: error.hint },
    );
  }

  if (count === 0) {
    throw Object.assign(
      new Error(
        `카테고리 종목 제거 실패 [404]: 연결이 존재하지 않음 (category_id=${categoryId}, stock_id=${stockId})`,
      ),
      { status: 404 },
    );
  }

  return null;
}
