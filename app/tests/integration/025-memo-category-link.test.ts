/**
 * [025] 메모-카테고리 연결 통합 테스트
 *
 * 테스트 범위:
 *   1. create_memo_with_links — p_category_ids로 카테고리 연결된 메모 생성, 응답에 categories 포함
 *   2. create_memo_with_links — 타인 카테고리 연결 시도 시 에러
 *   3. update_memo_with_links — p_category_ids로 카테고리 변경/추가/제거
 *   4. update_memo_with_links — null=변경없음, 빈배열=전체해제
 *   5. list_memos — p_category_ids 필터: 직접 연결 경로 (memo_categories)
 *   6. list_memos — p_category_ids 필터: 종목 경로 (user_category_stocks → memo_stocks)
 *   7. list_memos — p_no_links=true일 때 카테고리만 연결된 메모는 제외
 *   8. 메모 상세 조회 시 memo_categories join 확인
 *   9. CASCADE — 카테고리 삭제 시 memo_categories 연쇄 삭제
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

const USER_A_EMAIL = `mc-a-${RUN_ID}@example.com`;
const USER_B_EMAIL = `mc-b-${RUN_ID}@example.com`;
const TEST_PASSWORD = 'TestPassword123!';

// 정리 대상 추적
const createdMemoIds: string[] = [];
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
  // 메모 삭제 (cascade로 memo_categories 정리됨)
  if (createdMemoIds.length > 0) {
    await adminClient.from('memos').delete().in('id', createdMemoIds);
  }

  // 카테고리 삭제 (cascade로 memo_categories, user_category_stocks 정리됨)
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

async function createTestCategory(client: SupabaseClient, userId: string, nameSuffix: string): Promise<string> {
  const { data, error } = await client
    .from('user_categories')
    .insert({ user_id: userId, name: `MC_${nameSuffix}_${RUN_ID}` })
    .select('id')
    .single();

  if (error) throw new Error(`카테고리 생성 실패: ${error.message}`);
  createdCategoryIds.push(data.id);
  return data.id;
}

async function createTestStock(suffix: string): Promise<string> {
  const { data, error } = await adminClient
    .from('stocks')
    .insert({
      ticker: `MC_${suffix}_${RUN_ID}`,
      name: `MC테스트종목_${suffix}_${RUN_ID}`,
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

async function createMemoViaRpc(client: SupabaseClient, body: string, categoryIds: string[] | null = null): Promise<any> {
  const { data, error } = await client.rpc('create_memo_with_links', {
    p_body: body,
    p_stocks: [],
    p_trade_event_ids: [],
    p_news_ids: [],
    p_sector_ids: [],
    p_category_ids: categoryIds,
  });

  if (error) throw new Error(`메모 생성 실패: ${error.message}`);
  if (data?.id) createdMemoIds.push(data.id);
  return data;
}

// ════════════════════════════════════════════
// 1. create_memo_with_links — 카테고리 연결 생성
// ════════════════════════════════════════════

describe('create_memo_with_links — 카테고리 연결', () => {
  let catId1: string;
  let catId2: string;

  beforeAll(async () => {
    catId1 = await createTestCategory(userAClient, userAId, 'CREATE1');
    catId2 = await createTestCategory(userAClient, userAId, 'CREATE2');
  });

  it('p_category_ids 없이 메모 생성 시 categories는 빈 배열이다', async () => {
    const data = await createMemoViaRpc(userAClient, `카테고리없는메모_${RUN_ID}`);

    expect(data).not.toBeNull();
    expect(data.id).toBeDefined();
    expect(Array.isArray(data.categories)).toBe(true);
    expect(data.categories).toHaveLength(0);
  });

  it('p_category_ids로 카테고리 1개 연결 시 응답 categories에 포함된다', async () => {
    const data = await createMemoViaRpc(
      userAClient,
      `카테고리1개연결메모_${RUN_ID}`,
      [catId1],
    );

    expect(data.id).toBeDefined();
    expect(Array.isArray(data.categories)).toBe(true);
    expect(data.categories).toHaveLength(1);
    expect(data.categories[0].category_id).toBe(catId1);
    expect(typeof data.categories[0].name).toBe('string');
  });

  it('p_category_ids로 카테고리 2개 연결 시 응답 categories에 모두 포함된다', async () => {
    const data = await createMemoViaRpc(
      userAClient,
      `카테고리2개연결메모_${RUN_ID}`,
      [catId1, catId2],
    );

    expect(data.id).toBeDefined();
    expect(Array.isArray(data.categories)).toBe(true);
    expect(data.categories).toHaveLength(2);

    const returnedIds = data.categories.map((c: any) => c.category_id);
    expect(returnedIds).toContain(catId1);
    expect(returnedIds).toContain(catId2);
  });

  it('p_category_ids에 빈 배열 전달 시 categories는 빈 배열이다', async () => {
    const data = await createMemoViaRpc(
      userAClient,
      `카테고리빈배열메모_${RUN_ID}`,
      [],
    );

    expect(data.id).toBeDefined();
    expect(Array.isArray(data.categories)).toBe(true);
    expect(data.categories).toHaveLength(0);
  });
});

// ════════════════════════════════════════════
// 2. create_memo_with_links — 타인 카테고리 연결 시도
// ════════════════════════════════════════════

describe('create_memo_with_links — 타인 카테고리 연결 시 에러', () => {
  let catBId: string;

  beforeAll(async () => {
    // 유저 B의 카테고리 생성
    catBId = await createTestCategory(userBClient, userBId, 'OTHERUSER');
  });

  it('유저 A가 유저 B의 카테고리 ID로 메모 생성 시 에러가 반환된다', async () => {
    const { data, error } = await userAClient.rpc('create_memo_with_links', {
      p_body: `타인카테고리연결시도_${RUN_ID}`,
      p_stocks: [],
      p_trade_event_ids: [],
      p_news_ids: [],
      p_sector_ids: [],
      p_category_ids: [catBId],
    });

    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });

  it('타인 카테고리 연결 실패 시 메모 자체도 생성되지 않는다', async () => {
    const memoBody = `타인카테고리롤백확인_${RUN_ID}`;

    await userAClient.rpc('create_memo_with_links', {
      p_body: memoBody,
      p_stocks: [],
      p_trade_event_ids: [],
      p_news_ids: [],
      p_sector_ids: [],
      p_category_ids: [catBId],
    });

    // 메모 본체가 생성되지 않았는지 확인
    const { data: memos } = await adminClient
      .from('memos')
      .select('id, body')
      .eq('body', memoBody)
      .eq('user_id', userAId);

    expect(memos).toHaveLength(0);
  });
});

// ════════════════════════════════════════════
// 3. update_memo_with_links — 카테고리 변경/추가/제거
// ════════════════════════════════════════════

describe('update_memo_with_links — 카테고리 변경', () => {
  let memoId: string;
  let catId1: string;
  let catId2: string;
  let catId3: string;

  beforeAll(async () => {
    catId1 = await createTestCategory(userAClient, userAId, 'UPD1');
    catId2 = await createTestCategory(userAClient, userAId, 'UPD2');
    catId3 = await createTestCategory(userAClient, userAId, 'UPD3');

    // 초기 메모 생성 (cat1 연결)
    const data = await createMemoViaRpc(
      userAClient,
      `업데이트테스트메모_${RUN_ID}`,
      [catId1],
    );
    memoId = data.id;
  });

  it('p_category_ids로 카테고리를 교체하면 응답에 새 카테고리만 포함된다', async () => {
    const { data, error } = await userAClient.rpc('update_memo_with_links', {
      p_memo_id: memoId,
      p_body: null,
      p_stocks: null,
      p_trade_event_ids: null,
      p_news_ids: null,
      p_sector_ids: null,
      p_category_ids: [catId2, catId3],
    });

    expect(error).toBeNull();
    expect(Array.isArray(data.categories)).toBe(true);
    expect(data.categories).toHaveLength(2);

    const returnedIds = data.categories.map((c: any) => c.category_id);
    expect(returnedIds).not.toContain(catId1);
    expect(returnedIds).toContain(catId2);
    expect(returnedIds).toContain(catId3);
  });

  it('p_category_ids에 카테고리 1개만 전달하면 나머지는 제거된다', async () => {
    const { data, error } = await userAClient.rpc('update_memo_with_links', {
      p_memo_id: memoId,
      p_body: null,
      p_stocks: null,
      p_trade_event_ids: null,
      p_news_ids: null,
      p_sector_ids: null,
      p_category_ids: [catId1],
    });

    expect(error).toBeNull();
    expect(data.categories).toHaveLength(1);
    expect(data.categories[0].category_id).toBe(catId1);
  });
});

// ════════════════════════════════════════════
// 4. update_memo_with_links — null=변경없음, 빈배열=전체해제
// ════════════════════════════════════════════

describe('update_memo_with_links — null vs 빈배열 동작', () => {
  let memoId: string;
  let catId: string;

  beforeAll(async () => {
    catId = await createTestCategory(userAClient, userAId, 'NULLTEST');

    const data = await createMemoViaRpc(
      userAClient,
      `null빈배열테스트메모_${RUN_ID}`,
      [catId],
    );
    memoId = data.id;
  });

  it('p_category_ids=null 전달 시 기존 카테고리 연결이 유지된다', async () => {
    const { data, error } = await userAClient.rpc('update_memo_with_links', {
      p_memo_id: memoId,
      p_body: `업데이트된본문_null_${RUN_ID}`,
      p_stocks: null,
      p_trade_event_ids: null,
      p_news_ids: null,
      p_sector_ids: null,
      p_category_ids: null,  // null = 변경 없음
    });

    expect(error).toBeNull();
    expect(Array.isArray(data.categories)).toBe(true);
    // 기존 카테고리가 유지되어야 함
    expect(data.categories).toHaveLength(1);
    expect(data.categories[0].category_id).toBe(catId);
  });

  it('p_category_ids=[] (빈 배열) 전달 시 모든 카테고리 연결이 해제된다', async () => {
    const { data, error } = await userAClient.rpc('update_memo_with_links', {
      p_memo_id: memoId,
      p_body: null,
      p_stocks: null,
      p_trade_event_ids: null,
      p_news_ids: null,
      p_sector_ids: null,
      p_category_ids: [],  // 빈 배열 = 전체 해제
    });

    expect(error).toBeNull();
    expect(Array.isArray(data.categories)).toBe(true);
    expect(data.categories).toHaveLength(0);

    // DB에서도 실제 삭제 확인
    const { data: mc } = await adminClient
      .from('memo_categories')
      .select('category_id')
      .eq('memo_id', memoId);

    expect(mc).toHaveLength(0);
  });
});

// ════════════════════════════════════════════
// 5. list_memos — 직접 연결 경로 (memo_categories) 필터
// ════════════════════════════════════════════

describe('list_memos — p_category_ids 직접 연결 경로 필터', () => {
  let catId: string;
  let memoWithCatId: string;
  let memoNoCatId: string;

  beforeAll(async () => {
    catId = await createTestCategory(userAClient, userAId, 'LISTFILTER');

    // 카테고리 연결된 메모
    const m1 = await createMemoViaRpc(
      userAClient,
      `카테고리필터메모연결_${RUN_ID}`,
      [catId],
    );
    memoWithCatId = m1.id;

    // 카테고리 미연결 메모
    const m2 = await createMemoViaRpc(
      userAClient,
      `카테고리필터메모미연결_${RUN_ID}`,
      null,
    );
    memoNoCatId = m2.id;
  });

  it('p_category_ids 필터로 해당 카테고리에 직접 연결된 메모만 반환된다', async () => {
    const { data, error } = await userAClient.rpc('list_memos', {
      p_from: null,
      p_to: null,
      p_stock_ids: null,
      p_trade_events_only: false,
      p_news_only: false,
      p_sector_ids: null,
      p_category_ids: [catId],
      p_no_links: false,
      p_limit: 20,
      p_offset: 0,
    });

    expect(error).toBeNull();
    expect(data).not.toBeNull();

    const memoIds = data.memos.map((m: any) => m.id);
    expect(memoIds).toContain(memoWithCatId);
    expect(memoIds).not.toContain(memoNoCatId);
  });

  it('필터된 메모 응답에 categories 배열이 포함된다', async () => {
    const { data, error } = await userAClient.rpc('list_memos', {
      p_from: null,
      p_to: null,
      p_stock_ids: null,
      p_trade_events_only: false,
      p_news_only: false,
      p_sector_ids: null,
      p_category_ids: [catId],
      p_no_links: false,
      p_limit: 20,
      p_offset: 0,
    });

    expect(error).toBeNull();
    const targetMemo = data.memos.find((m: any) => m.id === memoWithCatId);
    expect(targetMemo).toBeDefined();
    expect(Array.isArray(targetMemo.categories)).toBe(true);
    expect(targetMemo.categories).toHaveLength(1);
    expect(targetMemo.categories[0].category_id).toBe(catId);
  });

  it('p_category_ids=null이면 카테고리 필터를 적용하지 않는다 (전체 반환)', async () => {
    const { data, error } = await userAClient.rpc('list_memos', {
      p_from: null,
      p_to: null,
      p_stock_ids: null,
      p_trade_events_only: false,
      p_news_only: false,
      p_sector_ids: null,
      p_category_ids: null,
      p_no_links: false,
      p_limit: 100,
      p_offset: 0,
    });

    expect(error).toBeNull();
    const memoIds = data.memos.map((m: any) => m.id);
    expect(memoIds).toContain(memoWithCatId);
    expect(memoIds).toContain(memoNoCatId);
  });
});

// ════════════════════════════════════════════
// 6. list_memos — 종목 경로 (user_category_stocks → memo_stocks) 필터
// ════════════════════════════════════════════

describe('list_memos — p_category_ids 종목 경로 필터', () => {
  let catId: string;
  let stockId: string;
  let memoViaStockId: string;
  let memoDirectCatId: string;
  let memoUnrelatedId: string;

  beforeAll(async () => {
    catId = await createTestCategory(userAClient, userAId, 'STOCKPATH');
    stockId = await createTestStock('CATSTOCK');

    // 카테고리에 종목 매핑 (user_category_stocks)
    await adminClient
      .from('user_category_stocks')
      .insert({ category_id: catId, stock_id: stockId });

    // 종목 경로: 해당 종목에 연결된 메모 (직접 memo_categories 연결 없음)
    const { data: m1, error: e1 } = await userAClient.rpc('create_memo_with_links', {
      p_body: `종목경로메모_${RUN_ID}`,
      p_stocks: [{ stock_id: stockId, goal_price: null }],
      p_trade_event_ids: [],
      p_news_ids: [],
      p_sector_ids: [],
      p_category_ids: null,  // 직접 카테고리 연결 없음
    });
    if (e1) throw new Error(`종목경로메모 생성 실패: ${e1.message}`);
    memoViaStockId = m1.id;
    createdMemoIds.push(memoViaStockId);

    // 직접 연결 경로: memo_categories에 직접 연결된 메모 (종목 연결 없음)
    const m2 = await createMemoViaRpc(
      userAClient,
      `직접연결경로메모_${RUN_ID}`,
      [catId],
    );
    memoDirectCatId = m2.id;

    // 무관한 메모
    const m3 = await createMemoViaRpc(
      userAClient,
      `무관한메모_${RUN_ID}`,
      null,
    );
    memoUnrelatedId = m3.id;
  });

  it('종목 경로(카테고리에 속한 종목과 연결된 메모)도 필터 결과에 포함된다', async () => {
    const { data, error } = await userAClient.rpc('list_memos', {
      p_from: null,
      p_to: null,
      p_stock_ids: null,
      p_trade_events_only: false,
      p_news_only: false,
      p_sector_ids: null,
      p_category_ids: [catId],
      p_no_links: false,
      p_limit: 20,
      p_offset: 0,
    });

    expect(error).toBeNull();
    const memoIds = data.memos.map((m: any) => m.id);

    // 종목 경로로 연결된 메모
    expect(memoIds).toContain(memoViaStockId);
    // 직접 연결된 메모
    expect(memoIds).toContain(memoDirectCatId);
    // 무관한 메모는 제외
    expect(memoIds).not.toContain(memoUnrelatedId);
  });

  it('OR 합산: 두 경로 중 하나라도 해당되면 포함되고 중복 없이 반환된다', async () => {
    const { data, error } = await userAClient.rpc('list_memos', {
      p_from: null,
      p_to: null,
      p_stock_ids: null,
      p_trade_events_only: false,
      p_news_only: false,
      p_sector_ids: null,
      p_category_ids: [catId],
      p_no_links: false,
      p_limit: 20,
      p_offset: 0,
    });

    expect(error).toBeNull();

    // 중복 없는지 확인
    const memoIds = data.memos.map((m: any) => m.id);
    const uniqueIds = new Set(memoIds);
    expect(uniqueIds.size).toBe(memoIds.length);
  });
});

// ════════════════════════════════════════════
// 7. list_memos — p_no_links=true 시 카테고리만 연결된 메모 제외
// ════════════════════════════════════════════

describe('list_memos — p_no_links=true와 카테고리 연결 메모', () => {
  let catId: string;
  let memoCatOnlyId: string;
  let memoNoLinksId: string;

  beforeAll(async () => {
    catId = await createTestCategory(userAClient, userAId, 'NOLINKS');

    // 카테고리만 연결된 메모
    const m1 = await createMemoViaRpc(
      userAClient,
      `카테고리만연결_${RUN_ID}`,
      [catId],
    );
    memoCatOnlyId = m1.id;

    // 아무 연결도 없는 메모
    const m2 = await createMemoViaRpc(
      userAClient,
      `연결없는메모_${RUN_ID}`,
      null,
    );
    memoNoLinksId = m2.id;
  });

  it('p_no_links=true 시 카테고리만 연결된 메모는 결과에서 제외된다', async () => {
    const { data, error } = await userAClient.rpc('list_memos', {
      p_from: null,
      p_to: null,
      p_stock_ids: null,
      p_trade_events_only: false,
      p_news_only: false,
      p_sector_ids: null,
      p_category_ids: null,
      p_no_links: true,
      p_limit: 20,
      p_offset: 0,
    });

    expect(error).toBeNull();
    const memoIds = data.memos.map((m: any) => m.id);

    // 카테고리만 연결된 메모는 "연결 있음"이므로 제외
    expect(memoIds).not.toContain(memoCatOnlyId);
    // 연결 없는 메모는 포함
    expect(memoIds).toContain(memoNoLinksId);
  });
});

// ════════════════════════════════════════════
// 8. 메모 상세 조회 — memo_categories join 확인
// ════════════════════════════════════════════

describe('메모 상세 조회 — memo_categories join', () => {
  let catId: string;
  let memoId: string;

  beforeAll(async () => {
    catId = await createTestCategory(userAClient, userAId, 'DETAIL');
    const m = await createMemoViaRpc(
      userAClient,
      `상세조회테스트메모_${RUN_ID}`,
      [catId],
    );
    memoId = m.id;
  });

  it('메모 상세 조회 시 memo_categories 필드에 연결된 카테고리 정보가 포함된다', async () => {
    const { data, error } = await userAClient
      .from('memos')
      .select(
        '*, memo_stocks(stock_id, goal_price, stocks(id, ticker, name, market, currency, is_active)), memo_trade_events(event_id, account_events(id, event_type, event_date, ticker, name)), memo_news(news_id), memo_sectors(sector_id, sectors(id, code, name, level)), memo_categories(category_id, user_categories(id, name))',
      )
      .eq('id', memoId)
      .single();

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(Array.isArray(data.memo_categories)).toBe(true);
    expect(data.memo_categories).toHaveLength(1);

    const mc = data.memo_categories[0];
    expect(mc.category_id).toBe(catId);
    expect(mc.user_categories).not.toBeNull();
    expect(mc.user_categories.id).toBe(catId);
    expect(typeof mc.user_categories.name).toBe('string');
  });

  it('카테고리 미연결 메모 상세 조회 시 memo_categories는 빈 배열이다', async () => {
    const mNoLink = await createMemoViaRpc(
      userAClient,
      `카테고리미연결상세_${RUN_ID}`,
      null,
    );

    const { data, error } = await userAClient
      .from('memos')
      .select('*, memo_categories(category_id, user_categories(id, name))')
      .eq('id', mNoLink.id)
      .single();

    expect(error).toBeNull();
    expect(Array.isArray(data.memo_categories)).toBe(true);
    expect(data.memo_categories).toHaveLength(0);
  });
});

// ════════════════════════════════════════════
// 9. CASCADE — 카테고리 삭제 시 memo_categories 연쇄 삭제
// ════════════════════════════════════════════

describe('CASCADE — 카테고리 삭제 시 memo_categories 연쇄 삭제', () => {
  it('카테고리 삭제 시 memo_categories 레코드가 cascade 삭제되고 메모 본체는 유지된다', async () => {
    // 카테고리 및 메모 생성 (createdCategoryIds에 등록하지 않음 — 여기서 직접 삭제)
    const { data: cat, error: catErr } = await userAClient
      .from('user_categories')
      .insert({ user_id: userAId, name: `CASCADE삭제테스트_${RUN_ID}` })
      .select('id')
      .single();

    expect(catErr).toBeNull();
    const cascadeCatId = cat!.id;

    const memo = await createMemoViaRpc(
      userAClient,
      `CASCADE삭제메모_${RUN_ID}`,
      [cascadeCatId],
    );
    const cascadeMemoId = memo.id;

    // memo_categories 레코드 존재 확인
    const { data: before } = await adminClient
      .from('memo_categories')
      .select('category_id')
      .eq('memo_id', cascadeMemoId)
      .eq('category_id', cascadeCatId);

    expect(before).toHaveLength(1);

    // 카테고리 삭제
    const { error: delErr } = await userAClient
      .from('user_categories')
      .delete()
      .eq('id', cascadeCatId);

    expect(delErr).toBeNull();

    // memo_categories cascade 삭제 확인
    const { data: after } = await adminClient
      .from('memo_categories')
      .select('category_id')
      .eq('memo_id', cascadeMemoId)
      .eq('category_id', cascadeCatId);

    expect(after).toHaveLength(0);

    // 메모 본체는 유지되어야 함
    const { data: memoStillExists } = await adminClient
      .from('memos')
      .select('id')
      .eq('id', cascadeMemoId);

    expect(memoStillExists).toHaveLength(1);
  });
});
