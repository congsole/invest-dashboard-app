/**
 * [010] 메모 CRUD 및 엔티티 연결 데이터 레이어 통합 테스트
 *
 * 테스트 범위:
 *   1. 메모 생성 (본문만, 연결 없음)
 *   2. 메모 생성 + 종목 연결 (goal_price 포함)
 *   3. 메모 생성 + 섹터 연결
 *   4. 메모 생성 + 복합 연결 (종목 + 섹터 동시)
 *   5. 메모 상세 조회 (연결 엔티티 포함)
 *   6. 메모 수정 (본문 변경 + 연결 교체)
 *   7. 메모 삭제 (cascade 확인)
 *   8. 빈 문자열 body 거부
 *   9. list_memos — 날짜 범위 필터
 *  10. list_memos — 종목 필터 (직접 연결)
 *  11. list_memos — 종목 필터 + 매매이벤트 포함 (include_trade_events = true)
 *  12. list_memos — 섹터 필터
 *  13. list_memos — 연결 없음 필터
 *  14. list_memos — 페이지네이션
 *  15. 종목 연결 추가/해제
 *  16. 섹터 연결 추가/해제
 *  17. create_trade_event_with_memo — 이벤트 + 메모 동시 생성
 *  18. create_trade_event_with_memo — 메모 없이 이벤트만 생성 (memo_body null)
 *  19. create_trade_event_with_memo — 빈 문자열 memo_body 거부
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
let userClient: SupabaseClient;

let testUserId: string;

const TEST_EMAIL = `memo-test-${RUN_ID}@example.com`;
const TEST_PASSWORD = 'TestPassword123!';

// 테스트 중 생성된 데이터 추적
const createdMemoIds: string[] = [];
const createdStockIds: string[] = [];
const createdEventIds: string[] = [];

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

  // 테스트 유저 생성
  const { data: u, error: e } = await adminClient.auth.admin.createUser({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
    email_confirm: true,
  });
  if (e) throw new Error(`테스트 유저 생성 실패: ${e.message}`);
  testUserId = u.user.id;

  // 유저 로그인
  userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  const { error: signInErr } = await userClient.auth.signInWithPassword({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  });
  if (signInErr) throw new Error(`유저 로그인 실패: ${signInErr.message}`);
});

afterAll(async () => {
  // memos 삭제 (cascade로 junction 테이블도 정리됨)
  if (createdMemoIds.length > 0) {
    await adminClient.from('memos').delete().in('id', createdMemoIds);
  }

  // account_events 삭제
  if (createdEventIds.length > 0) {
    await adminClient.from('account_events').delete().in('id', createdEventIds);
  }

  // stocks 삭제
  if (createdStockIds.length > 0) {
    await adminClient.from('stocks').delete().in('id', createdStockIds);
  }

  // 테스트 유저 삭제 (유저 삭제 시 user_id 기반 memos도 cascade 삭제됨)
  if (testUserId) {
    await adminClient.auth.admin.deleteUser(testUserId);
  }

  await userClient.auth.signOut();
});

// ════════════════════════════════════════════
// 헬퍼: 테스트용 종목 생성
// ════════════════════════════════════════════

async function createTestStock(ticker: string, sectorId: number | null = 1): Promise<string> {
  const { data, error } = await adminClient
    .from('stocks')
    .insert({
      ticker: `${ticker}_${RUN_ID}`,
      asset_type: 'korean_stock',
      name: `테스트종목_${ticker}_${RUN_ID}`,
      sector_id: sectorId,
    })
    .select('id')
    .single();

  if (error) throw new Error(`종목 생성 실패: ${error.message}`);
  createdStockIds.push(data.id);
  return data.id;
}

// ════════════════════════════════════════════
// 1. 메모 CRUD 기본
// ════════════════════════════════════════════

describe('메모 기본 CRUD', () => {

  // ──────────────────────────────────────────
  // 1-1. 메모 생성 (본문만, 연결 없음)
  // ──────────────────────────────────────────
  it('본문만 있는 메모를 생성하면 id와 body가 반환된다', async () => {
    const { data, error } = await userClient.rpc('create_memo_with_links', {
      p_body: '테스트 메모 본문만',
      p_stocks: [],
      p_trade_event_ids: [],
      p_news_ids: [],
      p_sector_ids: [],
    });

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data.id).toBeDefined();
    expect(data.body).toBe('테스트 메모 본문만');
    expect(data.user_id).toBeDefined();
    expect(data.stocks).toEqual([]);
    expect(data.trade_events).toEqual([]);
    expect(data.sectors).toEqual([]);

    createdMemoIds.push(data.id);
  });

  // ──────────────────────────────────────────
  // 1-2. 메모 생성 + 종목 연결 (goal_price 포함)
  // ──────────────────────────────────────────
  it('종목 연결 + goal_price 포함하여 메모를 생성하면 stocks 배열에 종목 정보가 반환된다', async () => {
    const stockId = await createTestStock('GOALTEST');

    const { data, error } = await userClient.rpc('create_memo_with_links', {
      p_body: '종목 연결 메모',
      p_stocks: [{ stock_id: stockId, goal_price: 80000 }],
      p_trade_event_ids: [],
      p_news_ids: [],
      p_sector_ids: [],
    });

    expect(error).toBeNull();
    expect(data.stocks).toHaveLength(1);
    expect(data.stocks[0].stock_id).toBe(stockId);
    expect(data.stocks[0].goal_price).toBe(80000);
    expect(data.stocks[0].ticker).toContain('GOALTEST');

    createdMemoIds.push(data.id);
  });

  // ──────────────────────────────────────────
  // 1-3. 메모 생성 + 섹터 연결
  // ──────────────────────────────────────────
  it('섹터 연결하여 메모를 생성하면 sectors 배열에 섹터 정보가 반환된다', async () => {
    const { data, error } = await userClient.rpc('create_memo_with_links', {
      p_body: '섹터 연결 메모',
      p_stocks: [],
      p_trade_event_ids: [],
      p_news_ids: [],
      p_sector_ids: [1],
    });

    expect(error).toBeNull();
    expect(data.sectors).toHaveLength(1);
    expect(data.sectors[0].sector_id).toBe(1);
    expect(data.sectors[0].code).toBeDefined();

    createdMemoIds.push(data.id);
  });

  // ──────────────────────────────────────────
  // 1-4. 메모 생성 + 복합 연결 (종목 + 섹터 동시)
  // ──────────────────────────────────────────
  it('종목 + 섹터 동시 연결 메모를 생성하면 두 배열 모두 채워진다', async () => {
    const stockId = await createTestStock('MULTILINK');

    const { data, error } = await userClient.rpc('create_memo_with_links', {
      p_body: '복합 연결 메모',
      p_stocks: [{ stock_id: stockId, goal_price: null }],
      p_trade_event_ids: [],
      p_news_ids: [],
      p_sector_ids: [2],
    });

    expect(error).toBeNull();
    expect(data.stocks).toHaveLength(1);
    expect(data.sectors).toHaveLength(1);
    expect(data.sectors[0].sector_id).toBe(2);

    createdMemoIds.push(data.id);
  });

  // ──────────────────────────────────────────
  // 1-5. 메모 상세 조회 (연결 엔티티 포함)
  // ──────────────────────────────────────────
  it('메모 상세 조회 시 연결된 종목과 섹터 정보가 포함된다', async () => {
    const stockId = await createTestStock('DETAILTEST');

    // 생성
    const { data: created } = await userClient.rpc('create_memo_with_links', {
      p_body: '상세 조회 테스트 메모',
      p_stocks: [{ stock_id: stockId, goal_price: 50000 }],
      p_trade_event_ids: [],
      p_news_ids: [],
      p_sector_ids: [3],
    });
    createdMemoIds.push(created.id);

    // 상세 조회 (REST)
    const { data, error } = await userClient
      .from('memos')
      .select(
        '*, memo_stocks(stock_id, goal_price, stocks(id, ticker, name, asset_type)), memo_sectors(sector_id, sectors(id, code, name))'
      )
      .eq('id', created.id)
      .single();

    expect(error).toBeNull();
    expect(data.id).toBe(created.id);
    expect(data.body).toBe('상세 조회 테스트 메모');
    expect(data.memo_stocks).toHaveLength(1);
    expect(data.memo_stocks[0].goal_price).toBe(50000);
    expect(data.memo_sectors).toHaveLength(1);
    expect(data.memo_sectors[0].sector_id).toBe(3);
  });

  // ──────────────────────────────────────────
  // 1-6. 메모 수정 (본문 변경 + 연결 교체)
  // ──────────────────────────────────────────
  it('메모 수정 시 본문과 연결이 교체된다', async () => {
    const stockId1 = await createTestStock('UPDBEFORE');
    const stockId2 = await createTestStock('UPDAFTER');

    // 생성
    const { data: created } = await userClient.rpc('create_memo_with_links', {
      p_body: '수정 전 메모',
      p_stocks: [{ stock_id: stockId1, goal_price: 10000 }],
      p_trade_event_ids: [],
      p_news_ids: [],
      p_sector_ids: [1],
    });
    createdMemoIds.push(created.id);

    // 수정 (종목 교체, 섹터 제거)
    const { data, error } = await userClient.rpc('update_memo_with_links', {
      p_memo_id: created.id,
      p_body: '수정 후 메모',
      p_stocks: [{ stock_id: stockId2, goal_price: 20000 }],
      p_trade_event_ids: [],
      p_news_ids: [],
      p_sector_ids: [],
    });

    expect(error).toBeNull();
    expect(data.body).toBe('수정 후 메모');
    expect(data.stocks).toHaveLength(1);
    expect(data.stocks[0].stock_id).toBe(stockId2);
    expect(data.stocks[0].goal_price).toBe(20000);
    expect(data.sectors).toEqual([]);
  });

  // ──────────────────────────────────────────
  // 1-7. 메모 삭제 (cascade 확인)
  // ──────────────────────────────────────────
  it('메모 삭제 시 연결된 junction 레코드도 cascade 삭제된다', async () => {
    const stockId = await createTestStock('DELETETEST');

    const { data: created } = await userClient.rpc('create_memo_with_links', {
      p_body: '삭제 대상 메모',
      p_stocks: [{ stock_id: stockId, goal_price: null }],
      p_trade_event_ids: [],
      p_news_ids: [],
      p_sector_ids: [1],
    });
    const memoId = created.id;

    // memo_stocks 존재 확인
    const { data: before } = await adminClient
      .from('memo_stocks')
      .select('memo_id')
      .eq('memo_id', memoId);
    expect(before).toHaveLength(1);

    // 삭제
    const { error: delErr } = await userClient
      .from('memos')
      .delete()
      .eq('id', memoId);
    expect(delErr).toBeNull();

    // memo_stocks cascade 삭제 확인
    const { data: after } = await adminClient
      .from('memo_stocks')
      .select('memo_id')
      .eq('memo_id', memoId);
    expect(after).toHaveLength(0);

    // memo_sectors cascade 삭제 확인
    const { data: sectorAfter } = await adminClient
      .from('memo_sectors')
      .select('memo_id')
      .eq('memo_id', memoId);
    expect(sectorAfter).toHaveLength(0);
  });

  // ──────────────────────────────────────────
  // 1-8. 빈 문자열 body 거부
  // ──────────────────────────────────────────
  it('빈 문자열 body로 메모 생성 시 에러가 반환된다', async () => {
    const { error } = await userClient.rpc('create_memo_with_links', {
      p_body: '',
      p_stocks: [],
      p_trade_event_ids: [],
      p_news_ids: [],
      p_sector_ids: [],
    });

    expect(error).not.toBeNull();
  });

  it('공백만 있는 body로 메모 생성 시 에러가 반환된다', async () => {
    const { error } = await userClient.rpc('create_memo_with_links', {
      p_body: '   ',
      p_stocks: [],
      p_trade_event_ids: [],
      p_news_ids: [],
      p_sector_ids: [],
    });

    expect(error).not.toBeNull();
  });

  // ──────────────────────────────────────────
  // RLS 검증: 미인증 사용자 차단
  // ──────────────────────────────────────────
  it('미인증 사용자는 create_memo_with_links 호출 불가', async () => {
    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
    });

    const { error } = await anonClient.rpc('create_memo_with_links', {
      p_body: '미인증 메모',
      p_stocks: [],
      p_trade_event_ids: [],
      p_news_ids: [],
      p_sector_ids: [],
    });

    expect(error).not.toBeNull();
  });

  it('미인증 사용자는 memos SELECT 불가', async () => {
    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
    });

    const { data, error } = await anonClient.from('memos').select('*');

    const isBlocked = !!error || (Array.isArray(data) && data.length === 0);
    expect(isBlocked).toBe(true);
  });
});

// ════════════════════════════════════════════
// 2. list_memos 필터
// ════════════════════════════════════════════

describe('list_memos 필터', () => {
  let stockIdA: string;
  let sectorId: number;
  let memoPlain: any;
  let memoWithStock: any;
  let memoWithSector: any;

  beforeAll(async () => {
    stockIdA = await createTestStock('FILTERSTOCK');
    sectorId = 4; // HEALTHCARE 또는 임의 섹터 (sectors 시드 기준)

    // 연결 없는 메모
    const { data: m1 } = await userClient.rpc('create_memo_with_links', {
      p_body: '연결 없는 메모',
      p_stocks: [],
      p_trade_event_ids: [],
      p_news_ids: [],
      p_sector_ids: [],
    });
    memoPlain = m1;
    createdMemoIds.push(m1.id);

    // 종목 연결 메모
    const { data: m2 } = await userClient.rpc('create_memo_with_links', {
      p_body: '종목 연결 메모',
      p_stocks: [{ stock_id: stockIdA, goal_price: null }],
      p_trade_event_ids: [],
      p_news_ids: [],
      p_sector_ids: [],
    });
    memoWithStock = m2;
    createdMemoIds.push(m2.id);

    // 섹터 연결 메모
    const { data: m3 } = await userClient.rpc('create_memo_with_links', {
      p_body: '섹터 연결 메모',
      p_stocks: [],
      p_trade_event_ids: [],
      p_news_ids: [],
      p_sector_ids: [sectorId],
    });
    memoWithSector = m3;
    createdMemoIds.push(m3.id);
  });

  // ──────────────────────────────────────────
  // 2-1. 날짜 범위 필터
  // ──────────────────────────────────────────
  it('오늘 날짜로 날짜 범위 필터 시 생성된 메모가 포함된다', async () => {
    const today = new Date().toISOString().slice(0, 10);

    const { data, error } = await userClient.rpc('list_memos', {
      p_from: today,
      p_to: today,
    });

    expect(error).toBeNull();
    expect(data.total_count).toBeGreaterThanOrEqual(3);
    expect(Array.isArray(data.memos)).toBe(true);
  });

  it('미래 날짜 범위 필터 시 메모가 없다', async () => {
    const { data, error } = await userClient.rpc('list_memos', {
      p_from: '2099-01-01',
      p_to: '2099-12-31',
    });

    expect(error).toBeNull();
    expect(data.total_count).toBe(0);
    expect(data.memos).toEqual([]);
  });

  // ──────────────────────────────────────────
  // 2-2. 종목 필터 (직접 연결)
  // ──────────────────────────────────────────
  it('p_stock_id 필터 시 해당 종목이 직접 연결된 메모만 반환된다', async () => {
    const { data, error } = await userClient.rpc('list_memos', {
      p_stock_id: stockIdA,
      p_include_trade_events: false,
    });

    expect(error).toBeNull();
    expect(data.total_count).toBe(1);
    const ids = data.memos.map((m: any) => m.id);
    expect(ids).toContain(memoWithStock.id);
    expect(ids).not.toContain(memoPlain.id);
  });

  // ──────────────────────────────────────────
  // 2-3. 섹터 필터
  // ──────────────────────────────────────────
  it('p_sector_id 필터 시 해당 섹터가 연결된 메모만 반환된다', async () => {
    const { data, error } = await userClient.rpc('list_memos', {
      p_sector_id: sectorId,
    });

    expect(error).toBeNull();
    expect(data.total_count).toBe(1);
    expect(data.memos[0].id).toBe(memoWithSector.id);
  });

  // ──────────────────────────────────────────
  // 2-4. 연결 없음 필터
  // ──────────────────────────────────────────
  it('p_no_links = true 시 아무 연결도 없는 메모만 반환된다', async () => {
    const { data, error } = await userClient.rpc('list_memos', {
      p_no_links: true,
    });

    expect(error).toBeNull();
    expect(data.total_count).toBeGreaterThanOrEqual(1);
    const ids = data.memos.map((m: any) => m.id);
    expect(ids).toContain(memoPlain.id);
    expect(ids).not.toContain(memoWithStock.id);
    expect(ids).not.toContain(memoWithSector.id);
  });

  // ──────────────────────────────────────────
  // 2-5. 페이지네이션
  // ──────────────────────────────────────────
  it('p_limit = 1, p_offset = 0이면 1개 메모만 반환되고 total_count는 전체 수', async () => {
    const { data: all } = await userClient.rpc('list_memos', {});

    const { data, error } = await userClient.rpc('list_memos', {
      p_limit: 1,
      p_offset: 0,
    });

    expect(error).toBeNull();
    expect(data.memos).toHaveLength(1);
    expect(data.total_count).toBe(all.total_count);
  });

  it('p_limit = 1, p_offset = 1이면 두 번째 메모가 반환된다', async () => {
    const { data: page0 } = await userClient.rpc('list_memos', {
      p_limit: 1,
      p_offset: 0,
    });

    const { data: page1 } = await userClient.rpc('list_memos', {
      p_limit: 1,
      p_offset: 1,
    });

    expect(page0.memos[0].id).not.toBe(page1.memos[0].id);
  });

  it('p_limit > 100 시 에러가 반환된다', async () => {
    const { error } = await userClient.rpc('list_memos', {
      p_limit: 101,
    });

    expect(error).not.toBeNull();
  });

  // ──────────────────────────────────────────
  // 미인증 차단
  // ──────────────────────────────────────────
  it('미인증 사용자는 list_memos 호출 불가', async () => {
    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
    });

    const { error } = await anonClient.rpc('list_memos', {});

    expect(error).not.toBeNull();
  });
});

// ════════════════════════════════════════════
// 3. 엔티티 연결 개별 관리 (REST 직접 insert/delete)
// ════════════════════════════════════════════

describe('엔티티 연결 개별 관리', () => {
  let memoId: string;
  let stockId: string;

  beforeAll(async () => {
    // 빈 메모 생성
    const { data } = await userClient.rpc('create_memo_with_links', {
      p_body: '엔티티 연결 테스트 메모',
      p_stocks: [],
      p_trade_event_ids: [],
      p_news_ids: [],
      p_sector_ids: [],
    });
    memoId = data.id;
    createdMemoIds.push(memoId);

    // 종목 생성
    stockId = await createTestStock('LINKTEST');
  });

  // ──────────────────────────────────────────
  // 3-1. 종목 연결 추가/해제
  // ──────────────────────────────────────────
  it('종목 연결 추가 후 memo_stocks에 레코드가 생성된다', async () => {
    const { error } = await userClient
      .from('memo_stocks')
      .insert({ memo_id: memoId, stock_id: stockId, goal_price: 30000 });

    expect(error).toBeNull();

    const { data } = await adminClient
      .from('memo_stocks')
      .select('*')
      .eq('memo_id', memoId)
      .eq('stock_id', stockId)
      .single();

    expect(data).not.toBeNull();
    expect(data.goal_price).toBe(30000);
  });

  it('종목 연결 해제 후 memo_stocks에서 레코드가 삭제된다', async () => {
    const { error } = await userClient
      .from('memo_stocks')
      .delete()
      .eq('memo_id', memoId)
      .eq('stock_id', stockId);

    expect(error).toBeNull();

    const { data } = await adminClient
      .from('memo_stocks')
      .select('*')
      .eq('memo_id', memoId)
      .eq('stock_id', stockId);

    expect(data).toHaveLength(0);
  });

  // ──────────────────────────────────────────
  // 3-2. 섹터 연결 추가/해제
  // ──────────────────────────────────────────
  it('섹터 연결 추가 후 memo_sectors에 레코드가 생성된다', async () => {
    const { error } = await userClient
      .from('memo_sectors')
      .insert({ memo_id: memoId, sector_id: 5 });

    expect(error).toBeNull();

    const { data } = await adminClient
      .from('memo_sectors')
      .select('*')
      .eq('memo_id', memoId)
      .eq('sector_id', 5)
      .single();

    expect(data).not.toBeNull();
  });

  it('섹터 연결 해제 후 memo_sectors에서 레코드가 삭제된다', async () => {
    const { error } = await userClient
      .from('memo_sectors')
      .delete()
      .eq('memo_id', memoId)
      .eq('sector_id', 5);

    expect(error).toBeNull();

    const { data } = await adminClient
      .from('memo_sectors')
      .select('*')
      .eq('memo_id', memoId)
      .eq('sector_id', 5);

    expect(data).toHaveLength(0);
  });

  // ──────────────────────────────────────────
  // 3-3. RLS: 다른 유저의 메모에 연결 추가 불가
  // ──────────────────────────────────────────
  it('다른 유저는 타인의 memo_sectors에 INSERT 불가', async () => {
    // 두 번째 유저 생성
    const otherEmail = `memo-other-${RUN_ID}@example.com`;
    const { data: u2 } = await adminClient.auth.admin.createUser({
      email: otherEmail,
      password: TEST_PASSWORD,
      email_confirm: true,
    });
    const otherUserId = u2.user!.id;

    const otherClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
    });
    await otherClient.auth.signInWithPassword({
      email: otherEmail,
      password: TEST_PASSWORD,
    });

    const { error } = await otherClient
      .from('memo_sectors')
      .insert({ memo_id: memoId, sector_id: 6 });

    expect(error).not.toBeNull();

    // 정리
    await adminClient.auth.admin.deleteUser(otherUserId);
    await otherClient.auth.signOut();
  });
});

// ════════════════════════════════════════════
// 4. create_trade_event_with_memo
// ════════════════════════════════════════════

describe('create_trade_event_with_memo', () => {
  const baseEvent = {
    event_type: 'buy' as const,
    event_date: '2026-06-02',
    asset_type: 'korean_stock' as const,
    ticker: `TEWM_${RUN_ID}`,
    name: `매매이벤트테스트_${RUN_ID}`,
    quantity: 10,
    price_per_unit: 50000,
    currency: 'KRW',
    fee: 500,
    tax: 0,
    amount: 500000,
    source: 'manual' as const,
  };

  // ──────────────────────────────────────────
  // 4-1. 매매이벤트 + 메모 동시 생성
  // ──────────────────────────────────────────
  it('매매이벤트 + 메모를 동시 생성하면 event와 memo 모두 반환된다', async () => {
    // 종목 마스터에 등록 (linked_stock_id 검증을 위해)
    const stockId = await createTestStock(`TEWM_${RUN_ID}`.replace(`_${RUN_ID}`, ''));
    // 실제 ticker와 일치하도록 종목 ticker 업데이트
    await adminClient
      .from('stocks')
      .update({ ticker: `TEWM_${RUN_ID}`, asset_type: 'korean_stock' })
      .eq('id', stockId);

    const { data, error } = await userClient.rpc('create_trade_event_with_memo', {
      p_event: baseEvent,
      p_memo_body: '매수 메모',
      p_goal_price: 60000,
    });

    expect(error).toBeNull();
    expect(data.event).not.toBeNull();
    expect(data.event.event_type).toBe('buy');
    expect(data.event.ticker).toBe(baseEvent.ticker);
    expect(data.memo).not.toBeNull();
    expect(data.memo.body).toBe('매수 메모');
    expect(data.memo.goal_price).toBe(60000);
    expect(data.memo.linked_event_id).toBe(data.event.id);
    // 종목 마스터에 있으므로 linked_stock_id가 설정되어야 함
    expect(data.memo.linked_stock_id).toBe(stockId);

    createdEventIds.push(data.event.id);
    if (data.memo) createdMemoIds.push(data.memo.id);
  });

  // ──────────────────────────────────────────
  // 4-2. 매매이벤트만 생성 (memo_body null)
  // ──────────────────────────────────────────
  it('p_memo_body = null이면 event만 생성되고 memo는 null이다', async () => {
    const event = { ...baseEvent, ticker: `NOMEMO_${RUN_ID}` };

    const { data, error } = await userClient.rpc('create_trade_event_with_memo', {
      p_event: event,
      p_memo_body: null,
      p_goal_price: null,
    });

    expect(error).toBeNull();
    expect(data.event).not.toBeNull();
    expect(data.memo).toBeNull();

    createdEventIds.push(data.event.id);
  });

  // ──────────────────────────────────────────
  // 4-3. 빈 문자열 memo_body 거부
  // ──────────────────────────────────────────
  it('p_memo_body = 빈 문자열이면 에러가 반환된다', async () => {
    const event = { ...baseEvent, ticker: `EMPTYMEMO_${RUN_ID}` };

    const { error } = await userClient.rpc('create_trade_event_with_memo', {
      p_event: event,
      p_memo_body: '',
      p_goal_price: null,
    });

    expect(error).not.toBeNull();
  });

  // ──────────────────────────────────────────
  // 4-4. buy/sell 이외의 event_type 거부
  // ──────────────────────────────────────────
  it('event_type이 buy/sell이 아니면 에러가 반환된다', async () => {
    const event = { ...baseEvent, event_type: 'dividend' as any, ticker: `WRONGTYPE_${RUN_ID}` };

    const { error } = await userClient.rpc('create_trade_event_with_memo', {
      p_event: event,
      p_memo_body: null,
      p_goal_price: null,
    });

    expect(error).not.toBeNull();
  });

  // ──────────────────────────────────────────
  // 4-5. 미인증 사용자 차단
  // ──────────────────────────────────────────
  it('미인증 사용자는 create_trade_event_with_memo 호출 불가', async () => {
    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
    });

    const event = { ...baseEvent, ticker: `ANONEV_${RUN_ID}` };

    const { error } = await anonClient.rpc('create_trade_event_with_memo', {
      p_event: event,
      p_memo_body: null,
      p_goal_price: null,
    });

    expect(error).not.toBeNull();
  });

  // ──────────────────────────────────────────
  // 4-6. 매매이벤트 + 메모 연결 DB 검증
  // ──────────────────────────────────────────
  it('생성된 메모는 memo_trade_events에 event_id가 연결되어 있다', async () => {
    const event = { ...baseEvent, ticker: `DBVERIFY_${RUN_ID}` };

    const { data } = await userClient.rpc('create_trade_event_with_memo', {
      p_event: event,
      p_memo_body: 'DB 연결 검증 메모',
      p_goal_price: null,
    });

    createdEventIds.push(data.event.id);
    createdMemoIds.push(data.memo.id);

    // memo_trade_events 연결 확인
    const { data: link } = await adminClient
      .from('memo_trade_events')
      .select('*')
      .eq('memo_id', data.memo.id)
      .eq('event_id', data.event.id)
      .single();

    expect(link).not.toBeNull();
  });
});

// ════════════════════════════════════════════
// 5. list_memos — 종목 필터 + 매매이벤트 포함
// ════════════════════════════════════════════

describe('list_memos — 종목 필터 + 매매이벤트 포함', () => {
  let stockId: string;
  let memoDirectStockId: string;
  let memoViaEventId: string;

  beforeAll(async () => {
    const ticker = `INCLEV_${RUN_ID}`;
    // 매매이벤트 전용 ticker: stocks 테이블에 등록하지 않아 memo_stocks 자동 연결이 생기지 않음
    const eventOnlyTicker = `EVONLY_${RUN_ID}`;

    // 종목 마스터 등록 (직접 연결용)
    const { data: s } = await adminClient
      .from('stocks')
      .insert({
        ticker,
        asset_type: 'korean_stock',
        name: `종목포함테스트_${RUN_ID}`,
        sector_id: null,
      })
      .select('id')
      .single();
    stockId = s!.id;
    createdStockIds.push(stockId);

    // 직접 연결 메모
    const { data: m1 } = await userClient.rpc('create_memo_with_links', {
      p_body: '종목 직접 연결 메모',
      p_stocks: [{ stock_id: stockId, goal_price: null }],
      p_trade_event_ids: [],
      p_news_ids: [],
      p_sector_ids: [],
    });
    memoDirectStockId = m1.id;
    createdMemoIds.push(memoDirectStockId);

    // 매매이벤트를 통한 종목 연결 메모
    // eventOnlyTicker는 stocks 마스터에 없으므로 memo_stocks에 자동 연결되지 않음
    // list_memos에서 p_include_trade_events=true 시 ae.ticker = ticker로 검색하므로
    // eventOnlyTicker와 같은 ticker의 account_event를 생성하고
    // stockId(ticker=INCLEV_{RUN_ID})를 기준으로 조회하면 포함되지 않는다.
    //
    // 실제 list_memos include_trade_events 로직은:
    //   ae.ticker = v_stock_ticker AND ae.asset_type = v_stock_atype
    // 이므로 같은 ticker를 사용해야 include된다.
    // 단, create_trade_event_with_memo는 stocks 테이블에서 ticker를 찾아 memo_stocks에도 연결하므로
    // 테스트용으로 직접 account_events를 insert하고 memo_trade_events만 연결하는 방식을 사용
    const { data: directEv } = await adminClient
      .from('account_events')
      .insert({
        user_id: testUserId,
        event_type: 'buy',
        event_date: '2026-06-02',
        asset_type: 'korean_stock',
        ticker,
        name: `종목포함테스트_${RUN_ID}`,
        quantity: 5,
        price_per_unit: 40000,
        currency: 'KRW',
        fee: 0,
        tax: 0,
        amount: 200000,
        source: 'manual',
      })
      .select('id')
      .single();
    createdEventIds.push(directEv!.id);

    // 메모 생성 후 trade_event만 연결 (memo_stocks 없이)
    const { data: m2 } = await userClient.rpc('create_memo_with_links', {
      p_body: '매매이벤트 통한 종목 메모',
      p_stocks: [],
      p_trade_event_ids: [directEv!.id],
      p_news_ids: [],
      p_sector_ids: [],
    });
    memoViaEventId = m2.id;
    createdMemoIds.push(memoViaEventId);
  });

  it('p_include_trade_events = true 시 매매이벤트로 연결된 메모도 포함된다', async () => {
    const { data, error } = await userClient.rpc('list_memos', {
      p_stock_id: stockId,
      p_include_trade_events: true,
    });

    expect(error).toBeNull();
    const ids = data.memos.map((m: any) => m.id);
    expect(ids).toContain(memoDirectStockId);
    expect(ids).toContain(memoViaEventId);
  });

  it('p_include_trade_events = false 시 직접 연결된 메모만 반환된다', async () => {
    const { data, error } = await userClient.rpc('list_memos', {
      p_stock_id: stockId,
      p_include_trade_events: false,
    });

    expect(error).toBeNull();
    const ids = data.memos.map((m: any) => m.id);
    expect(ids).toContain(memoDirectStockId);
    expect(ids).not.toContain(memoViaEventId);
  });
});
