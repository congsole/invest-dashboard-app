// category.ts — 사용자 카테고리 도메인 공통 타입 정의
// api-spec.md UserCategory 도메인 기반
// 이슈 024: 사용자 카테고리 CRUD + 종목 관리

import { Stock } from './sector';

// ── 카테고리 마스터 ──

export interface UserCategory {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

// 목록 조회 시 소속 종목 수 포함
export interface UserCategoryWithCount extends UserCategory {
  user_category_stocks: Array<{ count: number }>;
}

// ── 카테고리 종목 매핑 ──

export interface UserCategoryStock {
  category_id: string;
  stock_id: string;
  created_at: string;
  stocks: Stock;
}

// ── 입력 타입 ──

export interface CreateCategoryInput {
  user_id: string;
  name: string;
}

export interface UpdateCategoryInput {
  name: string;
}

export interface AddCategoryStockInput {
  category_id: string;
  stock_id: string;
}
