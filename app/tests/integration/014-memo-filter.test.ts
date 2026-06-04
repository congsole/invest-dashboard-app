/**
 * [014] 메모 필터 기능 수정 — 통합 테스트
 *
 * 테스트 범위:
 *   a. p_stock_ids=[] (빈 배열) → 필터 없음으로 동작 (전체 메모 반환)
 *   b. p_stock_ids=[단일 ID] → 해당 종목 메모만 반환
 *   c. p_stock_ids=[복수 ID] → OR 동작 (각 종목 메모 합집합)
 *   d. p_sector_ids=[복수 ID] → OR 동작
 *   e. 종목 + 매매연관 동시 (p_trade_events_only=true) → AND 동작
 *   f. p_no_links=true → 연결 없는 메모만, 다른 필터 무시
 *   g. p_stock_ids + 매매이벤트 경유 연결 → 매매이벤트 경유 메모 포함
 *   h. p_sector_ids=[] (빈 배열) → 필터 없음으로 동작
 *
 * 필요 환경변수 (app/.env.test):
 *   SUPABASE_URL         — Supabase 프로젝트 URL
 *   SUPABASE_ANON_KEY    — anon/publishable key
 *   SUPABASE_SERVICE_KEY — service_role key (RLS 우회)
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

const TEST_EMAIL = `014-filter-test-${RUN_ID}@example.com`;
const TEST_PASSWORD = 'TestPassword123!';

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

  const { data: u, error: e } = await adminClient.auth.admin.createUser({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
    email_confirm: true,
  });
  if (e) throw new Error(`테스트 유저 생성 실패: ${e.message}`);
  testUserId = u.user.id;

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
  if (createdEventIds.length > 0) {
    await adminClient.from('account_events').delete().in('id', createdEventIds);
  }
  if (createdMemoIds.length > 0) {
    await adminClient.from('memos').delete().in('id', createdMemoIds);
  }
  if (createdStockIds.length > 0) {
    await adminClient.from('stocks').delete().in('id', createdStockIds);
  }
  if (testUserId) {
    await adminClient.auth.admin.deleteUser(testUserId);
  }
  await userClient.auth.signOut();
});

// ════════════════════════════════════════════
// 헬퍼
// ════════════════════════════════════════════

async function createTestStock(suffix: string, sectorId: number | null = null): Promise<string> {
  const { data, error } = await adminClient
    .from('stocks')
    .insert({
      ticker: `F014_${suffix}_${RUN_ID}`,
      market: 'KR',
      name: `[014테스트]${suffix}_${RUN_ID}`,
      currency: 'KRW',
      sector_id: sectorId,
      is_active: true,
    })
    .select('id')
    .single();

  if (error) throw new Error(`종목 생성 실패: ${error.message}`);
  createdStockIds.push(data.id);
  return data.id;
}

async function createMemoWithStock(body: string, stockId: string): Promise<string> {
  const { data, error } = await userClient.rpc('create_memo_with_links', {
    p_body: body,
    p_stocks: [{ stock_id: stockId, goal_price: null }],
    p_trade_event_ids: [],
    p_news_ids: [],
    p_sector_ids: [],
  });
  if (error) throw new Error(`메모 생성 실패: ${error.message}`);
  createdMemoIds.push(data.id);
  return data.id;
}

async function createMemoWithSector(body: string, sectorId: number): Promise<string> {
  const { data, error } = await userClient.rpc('create_memo_with_links', {
    p_body: body,
    p_stocks: [],
    p_trade_event_ids: [],
    p_news_ids: [],
    p_sector_ids: [sectorId],
  });
  if (error) throw new Error(`메모 생성 실패: ${error.message}`);
  createdMemoIds.push(data.id);
  return data.id;
}

async function createPlainMemo(body: string): Promise<string> {
  const { data, error } = await userClient.rpc('create_memo_with_links', {
    p_body: body,
    p_stocks: [],
    p_trade_event_ids: [],
    p_news_ids: [],
    p_sector_ids: [],
  });
  if (error) throw new Error(`메모 생성 실패: ${error.message}`);
  createdMemoIds.push(data.id);
  return data.id;
}

// ════════════════════════════════════════════
// [014] list_memos 필터 검증
// ════════════════════════════════════════════

describe('[014] list_memos 배열 파라미터 필터', () => {
  // 테스트 픽스처
  let stockA: string;
  let stockB: string;
  let memoWithStockA: string;
  let memoWithStockB: string;
  let memoWithBothStocks: string;
  let memoWithSector1: string;
  let memoWithSector2: string;
  let memoPlain: string;
  let memoViaEvent: string;   // 매매이벤트 경유 stockA 연결
  let memoTradeEvent: string; // trade_event 연결 있는 메모
  let eventId: string;

  beforeAll(async () => {
    // 종목 A, B 생성
    stockA = await createTestStock('STOCKA', 1);
    stockB = await createTestStock('STOCKB', 2);

    // 메모 픽스처 생성
    memoWithStockA   = await createMemoWithStock('종목A 연결 메모', stockA);
    memoWithStockB   = await createMemoWithStock('종목B 연결 메모', stockB);
    memoWithSector1  = await createMemoWithSector('섹터1 연결 메모', 1);
    memoWithSector2  = await createMemoWithSector('섹터2 연결 메모', 2);
    memoPlain        = await createPlainMemo('연결 없는 메모');

    // 종목 A + B 동시 연결 메모
    {
      const { data, error } = await userClient.rpc('create_memo_with_links', {
        p_body: '종목A+B 동시 연결 메모',
        p_stocks: [
          { stock_id: stockA, goal_price: null },
          { stock_id: stockB, goal_price: null },
        ],
        p_trade_event_ids: [],
        p_news_ids: [],
        p_sector_ids: [],
      });
      if (error) throw new Error(`메모 생성 실패: ${error.message}`);
      memoWithBothStocks = data.id;
      createdMemoIds.push(memoWithBothStocks);
    }

    // 매매이벤트 생성 (stockA ticker 사용)
    const stockATicker = `F014_STOCKA_${RUN_ID}`;
    {
      const { data, error } = await adminClient
        .from('account_events')
        .insert({
          user_id: testUserId,
          event_type: 'buy',
          event_date: '2026-06-01',
          asset_type: 'korean_stock',
          ticker: stockATicker,
          name: `[014테스트]STOCKA_${RUN_ID}`,
          quantity: 10,
          price_per_unit: 50000,
          currency: 'KRW',
          fee: 0,
          tax: 0,
          amount: 500000,
          source: 'manual',
        })
        .select('id')
        .single();
      if (error) throw new Error(`매매이벤트 생성 실패: ${error.message}`);
      eventId = data.id;
      createdEventIds.push(eventId);
    }

    // 매매이벤트만 연결된 메모 (memo_stocks 연결 없음 — 매매이벤트 경유 stockA 연결)
    {
      const { data, error } = await userClient.rpc('create_memo_with_links', {
        p_body: '매매이벤트 경유 종목A 메모',
        p_stocks: [],
        p_trade_event_ids: [eventId],
        p_news_ids: [],
        p_sector_ids: [],
      });
      if (error) throw new Error(`메모 생성 실패: ${error.message}`);
      memoViaEvent = data.id;
      memoTradeEvent = data.id; // trade_events_only 테스트에도 재사용
      createdMemoIds.push(memoViaEvent);
    }
  });

  // ──────────────────────────────────────────
  // a. p_stock_ids=[] (빈 배열) → 필터 없음 (전체 반환)
  // ──────────────────────────────────────────
  it('a. p_stock_ids=[] 빈 배열은 필터 없음으로 동작해 전체 메모를 반환한다', async () => {
    const { data: withEmpty, error: err1 } = await userClient.rpc('list_memos', {
      p_stock_ids: [],
    });
    const { data: withNull, error: err2 } = await userClient.rpc('list_memos', {
      p_stock_ids: null,
    });

    expect(err1).toBeNull();
    expect(err2).toBeNull();

    // 빈 배열과 null 동작이 동일해야 함 (total_count 기준)
    expect(withEmpty.total_count).toBe(withNull.total_count);
    // 이 유저가 생성한 모든 메모(7개)가 포함되어야 함
    expect(withEmpty.total_count).toBeGreaterThanOrEqual(7);
  });

  // ──────────────────────────────────────────
  // b. p_stock_ids=[단일 ID] → 해당 종목 메모만 반환
  // ──────────────────────────────────────────
  it('b. p_stock_ids=[stockA] → stockA 연결 메모만 반환된다', async () => {
    const { data, error } = await userClient.rpc('list_memos', {
      p_stock_ids: [stockA],
    });

    expect(error).toBeNull();
    const ids = data.memos.map((m: any) => m.id);

    // stockA 직접 연결 메모 포함
    expect(ids).toContain(memoWithStockA);
    // stockA+B 동시 연결 메모 포함 (stockA도 연결됨)
    expect(ids).toContain(memoWithBothStocks);
    // stockA 매매이벤트 경유 메모 포함
    expect(ids).toContain(memoViaEvent);

    // stockB만 연결된 메모는 제외
    expect(ids).not.toContain(memoWithStockB);
    // 연결 없는 메모는 제외
    expect(ids).not.toContain(memoPlain);
    // 섹터만 연결된 메모는 제외
    expect(ids).not.toContain(memoWithSector1);
  });

  // ──────────────────────────────────────────
  // c. p_stock_ids=[복수 ID] → OR 동작
  // ──────────────────────────────────────────
  it('c. p_stock_ids=[stockA, stockB] → OR 동작으로 각 종목 메모 합집합 반환', async () => {
    const { data, error } = await userClient.rpc('list_memos', {
      p_stock_ids: [stockA, stockB],
    });

    expect(error).toBeNull();
    const ids = data.memos.map((m: any) => m.id);

    // stockA 연결 메모 포함
    expect(ids).toContain(memoWithStockA);
    // stockB 연결 메모 포함
    expect(ids).toContain(memoWithStockB);
    // 둘 다 연결된 메모 포함
    expect(ids).toContain(memoWithBothStocks);
    // 매매이벤트 경유 stockA 메모 포함
    expect(ids).toContain(memoViaEvent);

    // 연결 없는 메모는 제외
    expect(ids).not.toContain(memoPlain);
    // 섹터만 연결된 메모는 제외
    expect(ids).not.toContain(memoWithSector1);
  });

  // ──────────────────────────────────────────
  // d. p_sector_ids=[복수 ID] → OR 동작
  // ──────────────────────────────────────────
  it('d. p_sector_ids=[1, 2] → OR 동작으로 각 섹터 메모 합집합 반환', async () => {
    const { data, error } = await userClient.rpc('list_memos', {
      p_sector_ids: [1, 2],
    });

    expect(error).toBeNull();
    const ids = data.memos.map((m: any) => m.id);

    // 섹터1 연결 메모 포함
    expect(ids).toContain(memoWithSector1);
    // 섹터2 연결 메모 포함
    expect(ids).toContain(memoWithSector2);

    // 연결 없는 메모는 제외
    expect(ids).not.toContain(memoPlain);
  });

  it('d-2. p_sector_ids=[] 빈 배열은 필터 없음으로 동작해 전체 메모를 반환한다', async () => {
    const { data: withEmpty, error: err1 } = await userClient.rpc('list_memos', {
      p_sector_ids: [],
    });
    const { data: withNull, error: err2 } = await userClient.rpc('list_memos', {
      p_sector_ids: null,
    });

    expect(err1).toBeNull();
    expect(err2).toBeNull();
    expect(withEmpty.total_count).toBe(withNull.total_count);
  });

  // ──────────────────────────────────────────
  // e. 종목 + 매매연관 동시 → AND 동작
  // ──────────────────────────────────────────
  it('e. p_stock_ids=[stockA] + p_trade_events_only=true → AND 동작 (교집합만 반환)', async () => {
    const { data, error } = await userClient.rpc('list_memos', {
      p_stock_ids: [stockA],
      p_trade_events_only: true,
    });

    expect(error).toBeNull();
    const ids = data.memos.map((m: any) => m.id);

    // 매매이벤트 경유 stockA 메모 — stockA 연결 AND 매매이벤트 있음 → 포함
    expect(ids).toContain(memoViaEvent);

    // stockA 직접 연결이지만 매매이벤트 없음 → 제외
    expect(ids).not.toContain(memoWithStockA);
    // 연결 없는 메모 → 제외
    expect(ids).not.toContain(memoPlain);
  });

  // ──────────────────────────────────────────
  // f. p_no_links=true → 연결 없는 메모만, 다른 필터 무시
  // ──────────────────────────────────────────
  it('f. p_no_links=true → 연결 없는 메모만 반환되고, stock/sector 필터는 무시된다', async () => {
    const { data, error } = await userClient.rpc('list_memos', {
      p_no_links: true,
      // 아래 필터들은 p_no_links=true 시 무시되어야 함
      p_stock_ids: [stockA],
      p_sector_ids: [1],
    });

    expect(error).toBeNull();
    const ids = data.memos.map((m: any) => m.id);

    // 연결 없는 메모만 포함
    expect(ids).toContain(memoPlain);

    // 종목/섹터 연결된 메모는 모두 제외
    expect(ids).not.toContain(memoWithStockA);
    expect(ids).not.toContain(memoWithStockB);
    expect(ids).not.toContain(memoWithBothStocks);
    expect(ids).not.toContain(memoWithSector1);
    expect(ids).not.toContain(memoWithSector2);
    expect(ids).not.toContain(memoViaEvent);
  });

  // ──────────────────────────────────────────
  // g. 매매이벤트 경유 종목 연결 — cardinality 수정 검증 핵심
  // ──────────────────────────────────────────
  it('g. 매매이벤트 경유 stockA 연결 메모가 p_stock_ids=[stockA]로 조회된다', async () => {
    // 이 테스트는 cardinality() 수정의 핵심 검증:
    // - memoViaEvent는 memo_stocks 없이 memo_trade_events만 가짐
    // - account_events의 ticker = stockA의 ticker이므로 경유 연결됨
    const { data, error } = await userClient.rpc('list_memos', {
      p_stock_ids: [stockA],
    });

    expect(error).toBeNull();
    const ids = data.memos.map((m: any) => m.id);
    expect(ids).toContain(memoViaEvent);
  });

  // ──────────────────────────────────────────
  // 응답 필드 market 확인 (asset_type → market 수정 검증)
  // ──────────────────────────────────────────
  it('응답 stocks 배열에 market 필드가 포함되고 asset_type은 없다', async () => {
    const { data, error } = await userClient.rpc('list_memos', {
      p_stock_ids: [stockA],
    });

    expect(error).toBeNull();
    const memo = data.memos.find((m: any) => m.id === memoWithStockA);
    expect(memo).toBeDefined();
    expect(memo.stocks).toHaveLength(1);
    expect(memo.stocks[0].market).toBeDefined();
    expect(memo.stocks[0]).not.toHaveProperty('asset_type');
  });
});
