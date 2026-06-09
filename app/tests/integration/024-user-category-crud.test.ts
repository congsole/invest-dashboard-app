/**
 * [024] 사용자 카테고리 CRUD + 종목 관리 통합 테스트
 *
 * 테스트 범위:
 *   1. user_categories CRUD (생성, 목록 조회, 수정, 삭제)
 *   2. user_categories UNIQUE(user_id, name) 제약 검증
 *   3. user_category_stocks (종목 추가, 목록 조회, 종목 제거)
 *   4. user_category_stocks 복합 PK 중복 방지
 *   5. RLS 검증 — 다른 사용자의 카테고리 접근 불가
 *   6. CASCADE 삭제 — 카테고리 삭제 시 user_category_stocks 연쇄 삭제
 *   7. memo_categories 테이블 존재 확인
 *
 * 필요 환경변수 (app/.env.test):
 *   SUPABASE_URL          — Supabase 프로젝트 URL
 *   SUPABASE_ANON_KEY     — anon/publishable key
 *   SUPABASE_SERVICE_KEY  — service_role key (RLS 우회 데이터 정리 + 유저 생성)
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env.test') });

import { createClient, SupabaseClient } from '@supabase/supabase-js';

jest.setTimeout(30000);

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;

const RUN_ID = Date.now();

let adminClient: SupabaseClient;
let userAClient: SupabaseClient;
let userBClient: SupabaseClient;

let userAId: string;
let userBId: string;

const USER_A_EMAIL = `cat-a-${RUN_ID}@example.com`;
const USER_B_EMAIL = `cat-b-${RUN_ID}@example.com`;
const TEST_PASSWORD = 'TestPassword123!';

// 테스트 중 생성된 데이터 추적
const createdCategoryIds: string[] = [];
const createdStockIds: string[] = [];

// ────────────────────────────────────────────
// 전역 Setup / Teardown
// ────────────────────────────────────────────

beforeAll(async () => {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_KEY) {
    throw new Error('SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_KEY 환경변수가 필요합니다.');
  }

  adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });

  // 유저 A 생성 및 로그인
  const { data: uA, error: eA } = await adminClient.auth.admin.createUser({
    email: USER_A_EMAIL,
    password: TEST_PASSWORD,
    email_confirm: true,
  });
  if (eA) throw new Error(`유저 A 생성 실패: ${eA.message}`);
  userAId = uA.user.id;

  userAClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  const { error: signInA } = await userAClient.auth.signInWithPassword({
    email: USER_A_EMAIL,
    password: TEST_PASSWORD,
  });
  if (signInA) throw new Error(`유저 A 로그인 실패: ${signInA.message}`);

  // 유저 B 생성 및 로그인
  const { data: uB, error: eB } = await adminClient.auth.admin.createUser({
    email: USER_B_EMAIL,
    password: TEST_PASSWORD,
    email_confirm: true,
  });
  if (eB) throw new Error(`유저 B 생성 실패: ${eB.message}`);
  userBId = uB.user.id;

  userBClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  const { error: signInB } = await userBClient.auth.signInWithPassword({
    email: USER_B_EMAIL,
    password: TEST_PASSWORD,
  });
  if (signInB) throw new Error(`유저 B 로그인 실패: ${signInB.message}`);
});

afterAll(async () => {
  // 카테고리 삭제 (cascade로 user_category_stocks 정리됨)
  if (createdCategoryIds.length > 0) {
    await adminClient.from('user_categories').delete().in('id', createdCategoryIds);
  }

  // 종목 삭제
  if (createdStockIds.length > 0) {
    await adminClient.from('stocks').delete().in('id', createdStockIds);
  }

  // 테스트 유저 삭제
  if (userAId) await adminClient.auth.admin.deleteUser(userAId);
  if (userBId) await adminClient.auth.admin.deleteUser(userBId);

  await userAClient?.auth.signOut();
  await userBClient?.auth.signOut();
});

// ────────────────────────────────────────────
// 헬퍼
// ────────────────────────────────────────────

async function createTestStock(suffix: string): Promise<string> {
  const { data, error } = await adminClient
    .from('stocks')
    .insert({
      ticker: `CAT_${suffix}_${RUN_ID}`,
      name: `카테고리테스트종목_${suffix}_${RUN_ID}`,
      market: 'KR',
      currency: 'KRW',
      sector_id: 1,
    })
    .select('id')
    .single();

  if (error) throw new Error(`종목 생성 실패: ${error.message}`);
  createdStockIds.push(data.id);
  return data.id;
}

// ════════════════════════════════════════════
// 1. user_categories CRUD
// ════════════════════════════════════════════

describe('user_categories CRUD', () => {
  let categoryId: string;

  // ──────────────────────────────────────────
  // 1-1. 카테고리 생성
  // ──────────────────────────────────────────
  it('유효한 이름으로 카테고리를 생성하면 id와 name이 반환된다', async () => {
    const { data, error } = await userAClient
      .from('user_categories')
      .insert({ user_id: userAId, name: `2차전지_${RUN_ID}` })
      .select('*, user_category_stocks(count)')
      .single();

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data.id).toBeDefined();
    expect(data.name).toBe(`2차전지_${RUN_ID}`);
    expect(data.user_id).toBe(userAId);
    expect(data.user_category_stocks).toHaveLength(1);
    expect(data.user_category_stocks[0].count).toBe(0);

    categoryId = data.id;
    createdCategoryIds.push(categoryId);
  });

  // ──────────────────────────────────────────
  // 1-2. 카테고리 목록 조회
  // ──────────────────────────────────────────
  it('카테고리 목록 조회 시 본인 카테고리가 포함된다', async () => {
    const { data, error } = await userAClient
      .from('user_categories')
      .select('*, user_category_stocks(count)')
      .eq('user_id', userAId)
      .order('created_at', { ascending: true });

    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
    const ids = data!.map((c: any) => c.id);
    expect(ids).toContain(categoryId);
  });

  // ──────────────────────────────────────────
  // 1-3. 카테고리 수정
  // ──────────────────────────────────────────
  it('카테고리 이름을 수정하면 변경된 이름이 반환된다', async () => {
    const newName = `AI반도체_${RUN_ID}`;
    const { data, error } = await userAClient
      .from('user_categories')
      .update({ name: newName, updated_at: new Date().toISOString() })
      .eq('id', categoryId)
      .select('*, user_category_stocks(count)')
      .maybeSingle();

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data!.name).toBe(newName);
    expect(data!.id).toBe(categoryId);
  });

  // ──────────────────────────────────────────
  // 1-4. 카테고리 삭제
  // ──────────────────────────────────────────
  it('카테고리를 삭제하면 목록에서 사라진다', async () => {
    // 삭제용 카테고리 별도 생성
    const { data: created, error: createErr } = await userAClient
      .from('user_categories')
      .insert({ user_id: userAId, name: `삭제대상_${RUN_ID}` })
      .select('id')
      .single();

    expect(createErr).toBeNull();
    const deleteId = created!.id;

    const { error: delErr, count } = await userAClient
      .from('user_categories')
      .delete({ count: 'exact' })
      .eq('id', deleteId);

    expect(delErr).toBeNull();
    expect(count).toBe(1);

    // 삭제 후 조회 시 없음
    const { data: afterData } = await adminClient
      .from('user_categories')
      .select('id')
      .eq('id', deleteId);

    expect(afterData).toHaveLength(0);
  });
});

// ════════════════════════════════════════════
// 2. UNIQUE(user_id, name) 제약
// ════════════════════════════════════════════

describe('UNIQUE(user_id, name) 제약', () => {
  const dupName = `중복테스트_${RUN_ID}`;
  let firstId: string;

  it('동일 사용자가 같은 이름으로 두 번 생성하면 23505 에러가 반환된다', async () => {
    const { data: first, error: e1 } = await userAClient
      .from('user_categories')
      .insert({ user_id: userAId, name: dupName })
      .select('id')
      .single();

    expect(e1).toBeNull();
    firstId = first!.id;
    createdCategoryIds.push(firstId);

    const { error: e2 } = await userAClient
      .from('user_categories')
      .insert({ user_id: userAId, name: dupName })
      .select('id')
      .single();

    expect(e2).not.toBeNull();
    expect(e2!.code).toBe('23505');
  });

  it('다른 사용자는 동일한 이름으로 카테고리를 생성할 수 있다', async () => {
    const { data, error } = await userBClient
      .from('user_categories')
      .insert({ user_id: userBId, name: dupName })
      .select('id')
      .single();

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    createdCategoryIds.push(data!.id);
  });
});

// ════════════════════════════════════════════
// 3. user_category_stocks — 종목 추가/목록 조회/제거
// ════════════════════════════════════════════

describe('user_category_stocks CRUD', () => {
  let categoryId: string;
  let stockId: string;

  beforeAll(async () => {
    // 카테고리 생성
    const { data, error } = await userAClient
      .from('user_categories')
      .insert({ user_id: userAId, name: `종목관리_${RUN_ID}` })
      .select('id')
      .single();

    if (error) throw new Error(`카테고리 생성 실패: ${error.message}`);
    categoryId = data!.id;
    createdCategoryIds.push(categoryId);

    // 종목 생성
    stockId = await createTestStock('STOCK1');
  });

  // ──────────────────────────────────────────
  // 3-1. 종목 추가
  // ──────────────────────────────────────────
  it('카테고리에 종목을 추가하면 stocks 조인 결과가 반환된다', async () => {
    const { data, error } = await userAClient
      .from('user_category_stocks')
      .insert({ category_id: categoryId, stock_id: stockId })
      .select('*, stocks(*)')
      .single();

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data!.category_id).toBe(categoryId);
    expect(data!.stock_id).toBe(stockId);
    expect(data!.stocks).not.toBeNull();
    expect(data!.stocks.id).toBe(stockId);
  });

  // ──────────────────────────────────────────
  // 3-2. 종목 목록 조회
  // ──────────────────────────────────────────
  it('카테고리 종목 목록 조회 시 추가한 종목이 포함된다', async () => {
    const { data, error } = await userAClient
      .from('user_category_stocks')
      .select('*, stocks(*)')
      .eq('category_id', categoryId);

    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
    expect(data!.length).toBeGreaterThanOrEqual(1);

    const stockIds = data!.map((s: any) => s.stock_id);
    expect(stockIds).toContain(stockId);
  });

  // ──────────────────────────────────────────
  // 3-3. 종목 제거
  // ──────────────────────────────────────────
  it('카테고리에서 종목을 제거하면 목록에서 사라진다', async () => {
    const { error, count } = await userAClient
      .from('user_category_stocks')
      .delete({ count: 'exact' })
      .eq('category_id', categoryId)
      .eq('stock_id', stockId);

    expect(error).toBeNull();
    expect(count).toBe(1);

    // 제거 후 조회
    const { data: afterData } = await adminClient
      .from('user_category_stocks')
      .select('stock_id')
      .eq('category_id', categoryId)
      .eq('stock_id', stockId);

    expect(afterData).toHaveLength(0);
  });

  // ──────────────────────────────────────────
  // 3-4. 목록 카운트 반영 확인
  // ──────────────────────────────────────────
  it('종목 추가 후 카테고리 목록의 종목 수(count)가 1 증가한다', async () => {
    const stock2Id = await createTestStock('STOCK2');

    // 추가 전 count
    const { data: before } = await userAClient
      .from('user_categories')
      .select('*, user_category_stocks(count)')
      .eq('id', categoryId)
      .single();

    const beforeCount = before!.user_category_stocks[0].count;

    // 종목 추가
    await userAClient
      .from('user_category_stocks')
      .insert({ category_id: categoryId, stock_id: stock2Id });

    // 추가 후 count
    const { data: after } = await userAClient
      .from('user_categories')
      .select('*, user_category_stocks(count)')
      .eq('id', categoryId)
      .single();

    const afterCount = after!.user_category_stocks[0].count;
    expect(afterCount).toBe(beforeCount + 1);

    // 정리
    await adminClient
      .from('user_category_stocks')
      .delete()
      .eq('category_id', categoryId)
      .eq('stock_id', stock2Id);
  });
});

// ════════════════════════════════════════════
// 4. 복합 PK 중복 방지
// ════════════════════════════════════════════

describe('user_category_stocks 복합 PK 중복 방지', () => {
  let categoryId: string;
  let stockId: string;

  beforeAll(async () => {
    const { data } = await userAClient
      .from('user_categories')
      .insert({ user_id: userAId, name: `중복종목_${RUN_ID}` })
      .select('id')
      .single();

    categoryId = data!.id;
    createdCategoryIds.push(categoryId);
    stockId = await createTestStock('DUPSTOCK');

    // 첫 번째 삽입
    await userAClient
      .from('user_category_stocks')
      .insert({ category_id: categoryId, stock_id: stockId });
  });

  it('동일 category_id + stock_id를 다시 추가하면 23505 에러가 반환된다', async () => {
    const { error } = await userAClient
      .from('user_category_stocks')
      .insert({ category_id: categoryId, stock_id: stockId });

    expect(error).not.toBeNull();
    expect(error!.code).toBe('23505');
  });
});

// ════════════════════════════════════════════
// 5. RLS 검증
// ════════════════════════════════════════════

describe('RLS 검증', () => {
  let catAId: string;

  beforeAll(async () => {
    // 유저 A 카테고리 생성
    const { data } = await userAClient
      .from('user_categories')
      .insert({ user_id: userAId, name: `RLS테스트_${RUN_ID}` })
      .select('id')
      .single();

    catAId = data!.id;
    createdCategoryIds.push(catAId);
  });

  // ──────────────────────────────────────────
  // 5-1. 미인증 사용자 차단
  // ──────────────────────────────────────────
  it('미인증 사용자는 user_categories SELECT 불가 (빈 배열 반환)', async () => {
    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
    });

    const { data, error } = await anonClient
      .from('user_categories')
      .select('*');

    // RLS: 빈 배열 반환 또는 에러
    const isBlocked = !!error || (Array.isArray(data) && data.length === 0);
    expect(isBlocked).toBe(true);
  });

  it('미인증 사용자는 user_categories INSERT 불가', async () => {
    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
    });

    const { error } = await anonClient
      .from('user_categories')
      .insert({ user_id: userAId, name: `미인증삽입_${RUN_ID}` });

    expect(error).not.toBeNull();
  });

  // ──────────────────────────────────────────
  // 5-2. 다른 사용자의 카테고리 접근 불가
  // ──────────────────────────────────────────
  it('유저 B는 유저 A의 카테고리를 조회할 수 없다', async () => {
    const { data, error } = await userBClient
      .from('user_categories')
      .select('*')
      .eq('id', catAId);

    expect(error).toBeNull(); // RLS는 에러 없이 빈 배열 반환
    expect(data).toHaveLength(0);
  });

  it('유저 B는 유저 A의 카테고리를 수정할 수 없다', async () => {
    const { data, error } = await userBClient
      .from('user_categories')
      .update({ name: `B가수정시도_${RUN_ID}` })
      .eq('id', catAId)
      .select()
      .maybeSingle();

    expect(error).toBeNull(); // RLS: 에러 없이 0 rows
    expect(data).toBeNull();
  });

  it('유저 B는 유저 A의 카테고리를 삭제할 수 없다', async () => {
    const { error, count } = await userBClient
      .from('user_categories')
      .delete({ count: 'exact' })
      .eq('id', catAId);

    expect(error).toBeNull();
    expect(count).toBe(0);

    // 실제로 삭제되지 않았는지 adminClient로 확인
    const { data } = await adminClient
      .from('user_categories')
      .select('id')
      .eq('id', catAId);

    expect(data).toHaveLength(1);
  });

  // ──────────────────────────────────────────
  // 5-3. user_category_stocks RLS
  // ──────────────────────────────────────────
  it('유저 B는 유저 A 카테고리의 종목을 조회할 수 없다', async () => {
    // 종목 추가 (유저 A 소유 카테고리)
    const stockId = await createTestStock('RLSSTOCK');
    await adminClient
      .from('user_category_stocks')
      .insert({ category_id: catAId, stock_id: stockId });

    const { data, error } = await userBClient
      .from('user_category_stocks')
      .select('*')
      .eq('category_id', catAId);

    expect(error).toBeNull();
    expect(data).toHaveLength(0);

    // 정리
    await adminClient
      .from('user_category_stocks')
      .delete()
      .eq('category_id', catAId)
      .eq('stock_id', stockId);
  });

  it('유저 B는 유저 A 카테고리에 종목을 추가할 수 없다', async () => {
    const stockId = await createTestStock('RLSINS');

    const { error } = await userBClient
      .from('user_category_stocks')
      .insert({ category_id: catAId, stock_id: stockId });

    expect(error).not.toBeNull();

    // 종목 정리 (삽입 실패이므로 category_stock 정리 불필요)
  });
});

// ════════════════════════════════════════════
// 6. CASCADE 삭제
// ════════════════════════════════════════════

describe('CASCADE 삭제', () => {
  it('카테고리 삭제 시 user_category_stocks 레코드가 cascade 삭제된다', async () => {
    // 카테고리 생성
    const { data: cat } = await userAClient
      .from('user_categories')
      .insert({ user_id: userAId, name: `CASCADE_${RUN_ID}` })
      .select('id')
      .single();

    const catId = cat!.id;
    const stockId = await createTestStock('CASCADE');

    // 종목 추가
    await userAClient
      .from('user_category_stocks')
      .insert({ category_id: catId, stock_id: stockId });

    // user_category_stocks 레코드 존재 확인
    const { data: before } = await adminClient
      .from('user_category_stocks')
      .select('stock_id')
      .eq('category_id', catId);

    expect(before).toHaveLength(1);

    // 카테고리 삭제
    const { error: delErr } = await userAClient
      .from('user_categories')
      .delete()
      .eq('id', catId);

    expect(delErr).toBeNull();

    // user_category_stocks cascade 삭제 확인
    const { data: after } = await adminClient
      .from('user_category_stocks')
      .select('stock_id')
      .eq('category_id', catId);

    expect(after).toHaveLength(0);
  });
});

// ════════════════════════════════════════════
// 7. memo_categories 테이블 존재 확인
// ════════════════════════════════════════════

describe('memo_categories 테이블 존재 확인', () => {
  it('memo_categories 테이블에 SELECT 쿼리가 성공한다 (빈 결과 허용)', async () => {
    // 이슈 025에서 상세 검증 예정 — 여기서는 테이블 존재 + RLS 동작만 확인
    const { data, error } = await userAClient
      .from('memo_categories')
      .select('*')
      .limit(1);

    // RLS 활성화 상태에서 빈 배열 또는 에러 없이 반환되어야 함
    // (본인 메모가 없으므로 빈 배열 예상)
    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
  });

  it('memo_categories에 잘못된 FK로 INSERT 시 에러가 반환된다', async () => {
    const fakeUUID = '00000000-0000-0000-0000-000000000000';
    const { error } = await userAClient
      .from('memo_categories')
      .insert({ memo_id: fakeUUID, category_id: fakeUUID });

    // FK 위반(23503) 또는 RLS 차단 에러 예상
    expect(error).not.toBeNull();
  });
});
