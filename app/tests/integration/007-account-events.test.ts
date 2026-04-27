/**
 * [007] AccountEvents 데이터 레이어 통합 테스트
 *
 * 테스트 범위:
 *   1. account_events CRUD (5종 이벤트, 필터, RLS)
 *   2. daily_snapshots (INSERT/SELECT/UNIQUE 제약/날짜 범위 조회)
 *   3. corporate_actions (SELECT 공개 / INSERT 불가)
 *   4. prices / fx_rates (SELECT 공개 / INSERT 불가)
 *   5. RPC: get_kpi_summary, get_history_markers
 *
 * 필요 환경변수 (app/.env.test):
 *   SUPABASE_URL          — Supabase 프로젝트 URL
 *   SUPABASE_ANON_KEY     — anon/publishable key
 *   SUPABASE_SERVICE_KEY  — service_role key (필수: RLS 우회 데이터 정리 + 유저 생성)
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

// 로그인된 일반 사용자 클라이언트 (RLS 적용)
let userClient: SupabaseClient;
// service_role 클라이언트 (RLS 우회, 데이터 정리용)
let adminClient: SupabaseClient;
// 두 번째 테스트 유저 (RLS 격리 검증용)
let user2Client: SupabaseClient;

let testUserId: string;
let testUser2Id: string;

const TEST_EMAIL_1 = `ae-test1-${RUN_ID}@example.com`;
const TEST_EMAIL_2 = `ae-test2-${RUN_ID}@example.com`;
const TEST_PASSWORD = 'TestPassword123!';

// ────────────────────────────────────────────
// 헬퍼: account_events 행 생성
// ────────────────────────────────────────────

function makeEvent(overrides: Record<string, unknown> = {}) {
  return {
    event_type: 'buy',
    event_date: '2026-01-10',
    asset_type: 'us_stock',
    ticker: `TICKER${RUN_ID}`,
    name: 'Test Stock',
    quantity: 10,
    price_per_unit: 200,
    currency: 'USD',
    fee: 0,
    tax: 0,
    amount: 2000,
    source: 'manual',
    ...overrides,
  };
}

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

  // 테스트 유저 1 생성
  const { data: u1, error: e1 } = await adminClient.auth.admin.createUser({
    email: TEST_EMAIL_1,
    password: TEST_PASSWORD,
    email_confirm: true,
  });
  if (e1) throw new Error(`테스트 유저1 생성 실패: ${e1.message}`);
  testUserId = u1.user.id;

  // 테스트 유저 2 생성
  const { data: u2, error: e2 } = await adminClient.auth.admin.createUser({
    email: TEST_EMAIL_2,
    password: TEST_PASSWORD,
    email_confirm: true,
  });
  if (e2) throw new Error(`테스트 유저2 생성 실패: ${e2.message}`);
  testUser2Id = u2.user.id;

  // 유저 1 로그인
  userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  const { error: signIn1 } = await userClient.auth.signInWithPassword({
    email: TEST_EMAIL_1,
    password: TEST_PASSWORD,
  });
  if (signIn1) throw new Error(`유저1 로그인 실패: ${signIn1.message}`);

  // 유저 2 로그인
  user2Client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  const { error: signIn2 } = await user2Client.auth.signInWithPassword({
    email: TEST_EMAIL_2,
    password: TEST_PASSWORD,
  });
  if (signIn2) throw new Error(`유저2 로그인 실패: ${signIn2.message}`);
});

afterAll(async () => {
  // 테스트 데이터 일괄 정리
  await adminClient.from('account_events').delete().eq('user_id', testUserId);
  await adminClient.from('account_events').delete().eq('user_id', testUser2Id);
  await adminClient.from('daily_snapshots').delete().eq('user_id', testUserId);
  await adminClient.from('daily_snapshots').delete().eq('user_id', testUser2Id);

  // 테스트 유저 삭제
  await adminClient.auth.admin.deleteUser(testUserId);
  await adminClient.auth.admin.deleteUser(testUser2Id);

  await userClient.auth.signOut();
  await user2Client.auth.signOut();
});

// ════════════════════════════════════════════
// 1. account_events CRUD
// ════════════════════════════════════════════

describe('account_events CRUD', () => {
  const createdIds: string[] = [];

  afterEach(async () => {
    if (createdIds.length > 0) {
      await adminClient.from('account_events').delete().in('id', createdIds);
      createdIds.length = 0;
    }
  });

  // ── INSERT ──

  it('buy 이벤트 INSERT 후 SELECT 검증', async () => {
    const input = makeEvent({
      event_type: 'buy',
      ticker: `BUY${RUN_ID}`,
      quantity: 5,
      price_per_unit: 100,
      amount: 500,
    });

    const { data, error } = await userClient
      .from('account_events')
      .insert({ ...input, user_id: testUserId })
      .select()
      .single();

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data!.event_type).toBe('buy');
    expect(data!.ticker).toBe(`BUY${RUN_ID}`);
    expect(Number(data!.quantity)).toBe(5);
    createdIds.push(data!.id);
  });

  it('sell 이벤트 INSERT 후 SELECT 검증', async () => {
    const input = makeEvent({
      event_type: 'sell',
      ticker: `SELL${RUN_ID}`,
      quantity: 3,
      price_per_unit: 150,
      amount: 450,
    });

    const { data, error } = await userClient
      .from('account_events')
      .insert({ ...input, user_id: testUserId })
      .select()
      .single();

    expect(error).toBeNull();
    expect(data!.event_type).toBe('sell');
    expect(Number(data!.quantity)).toBe(3);
    createdIds.push(data!.id);
  });

  it('deposit 이벤트 INSERT 후 SELECT 검증', async () => {
    const input = {
      event_type: 'deposit',
      event_date: '2026-01-05',
      currency: 'KRW',
      amount: 1000000,
      fx_rate_at_event: 1300,
      source: 'manual',
      user_id: testUserId,
    };

    const { data, error } = await userClient
      .from('account_events')
      .insert(input)
      .select()
      .single();

    expect(error).toBeNull();
    expect(data!.event_type).toBe('deposit');
    expect(Number(data!.amount)).toBe(1000000);
    expect(data!.asset_type).toBeNull();
    createdIds.push(data!.id);
  });

  it('withdraw 이벤트 INSERT 후 SELECT 검증', async () => {
    const input = {
      event_type: 'withdraw',
      event_date: '2026-02-01',
      currency: 'KRW',
      amount: 500000,
      fx_rate_at_event: 1300,
      source: 'manual',
      user_id: testUserId,
    };

    const { data, error } = await userClient
      .from('account_events')
      .insert(input)
      .select()
      .single();

    expect(error).toBeNull();
    expect(data!.event_type).toBe('withdraw');
    expect(Number(data!.amount)).toBe(500000);
    createdIds.push(data!.id);
  });

  it('dividend 이벤트 INSERT 후 SELECT 검증', async () => {
    const input = {
      event_type: 'dividend',
      event_date: '2026-03-15',
      ticker: `DIV${RUN_ID}`,
      name: 'Dividend Stock',
      currency: 'USD',
      amount: 50,
      tax: 7.5,
      fee: 0,
      source: 'manual',
      user_id: testUserId,
    };

    const { data, error } = await userClient
      .from('account_events')
      .insert(input)
      .select()
      .single();

    expect(error).toBeNull();
    expect(data!.event_type).toBe('dividend');
    expect(Number(data!.tax)).toBeCloseTo(7.5, 2);
    createdIds.push(data!.id);
  });

  // ── 필터 조회 ──

  it('event_type 필터 조회 (buy만 반환)', async () => {
    // buy + deposit 삽입
    const buyRes = await userClient
      .from('account_events')
      .insert(makeEvent({ event_type: 'buy', ticker: `FBUY${RUN_ID}`, user_id: testUserId }))
      .select()
      .single();
    const depositRes = await userClient
      .from('account_events')
      .insert({
        event_type: 'deposit',
        event_date: '2026-01-10',
        currency: 'KRW',
        amount: 100000,
        fx_rate_at_event: 1300,
        source: 'manual',
        user_id: testUserId,
      })
      .select()
      .single();

    expect(buyRes.error).toBeNull();
    expect(depositRes.error).toBeNull();
    createdIds.push(buyRes.data!.id, depositRes.data!.id);

    const { data, error } = await userClient
      .from('account_events')
      .select('*')
      .eq('event_type', 'buy')
      .in('id', [buyRes.data!.id, depositRes.data!.id]);

    expect(error).toBeNull();
    expect(data!.every((r: any) => r.event_type === 'buy')).toBe(true);
    expect(data!.find((r: any) => r.id === depositRes.data!.id)).toBeUndefined();
  });

  it('asset_type 필터 조회 (us_stock만 반환)', async () => {
    const usRes = await userClient
      .from('account_events')
      .insert(makeEvent({ asset_type: 'us_stock', ticker: `USFT${RUN_ID}`, user_id: testUserId }))
      .select()
      .single();
    const krRes = await userClient
      .from('account_events')
      .insert(makeEvent({ asset_type: 'korean_stock', ticker: `KRFT${RUN_ID}`, currency: 'KRW', user_id: testUserId }))
      .select()
      .single();

    expect(usRes.error).toBeNull();
    expect(krRes.error).toBeNull();
    createdIds.push(usRes.data!.id, krRes.data!.id);

    const { data, error } = await userClient
      .from('account_events')
      .select('*')
      .eq('asset_type', 'us_stock')
      .in('id', [usRes.data!.id, krRes.data!.id]);

    expect(error).toBeNull();
    expect(data!.every((r: any) => r.asset_type === 'us_stock')).toBe(true);
    expect(data!.find((r: any) => r.id === krRes.data!.id)).toBeUndefined();
  });

  // ── UPDATE ──

  it('UPDATE: amount 수정 검증', async () => {
    const { data: inserted, error: insertErr } = await userClient
      .from('account_events')
      .insert(makeEvent({ ticker: `UPD${RUN_ID}`, user_id: testUserId }))
      .select()
      .single();

    expect(insertErr).toBeNull();
    createdIds.push(inserted!.id);

    const { data: updated, error: updateErr } = await userClient
      .from('account_events')
      .update({ amount: 9999 })
      .eq('id', inserted!.id)
      .select()
      .single();

    expect(updateErr).toBeNull();
    expect(Number(updated!.amount)).toBe(9999);
  });

  // ── DELETE ──

  it('DELETE: 삭제 후 조회 불가 검증', async () => {
    const { data: inserted, error: insertErr } = await userClient
      .from('account_events')
      .insert(makeEvent({ ticker: `DEL${RUN_ID}`, user_id: testUserId }))
      .select()
      .single();

    expect(insertErr).toBeNull();
    const id = inserted!.id;

    const { error: deleteErr } = await userClient
      .from('account_events')
      .delete()
      .eq('id', id);

    expect(deleteErr).toBeNull();

    const { data, error: selectErr } = await userClient
      .from('account_events')
      .select('*')
      .eq('id', id);

    expect(selectErr).toBeNull();
    expect(data).toHaveLength(0);
    // afterEach에서 이미 삭제되었으므로 createdIds에 넣지 않음
  });

  // ── RLS: 다른 유저 접근 불가 ──

  it('RLS: 유저1 데이터를 유저2가 SELECT 불가', async () => {
    const { data: inserted, error: insertErr } = await userClient
      .from('account_events')
      .insert(makeEvent({ ticker: `RLS${RUN_ID}`, user_id: testUserId }))
      .select()
      .single();

    expect(insertErr).toBeNull();
    createdIds.push(inserted!.id);

    // 유저2로 동일 ID 조회 시도
    const { data, error } = await user2Client
      .from('account_events')
      .select('*')
      .eq('id', inserted!.id);

    expect(error).toBeNull();
    // RLS에 의해 빈 배열 반환 (에러가 아닌 empty result)
    expect(data).toHaveLength(0);
  });

  it('RLS: 유저1 데이터를 유저2가 UPDATE 불가', async () => {
    const { data: inserted, error: insertErr } = await userClient
      .from('account_events')
      .insert(makeEvent({ ticker: `RLS2${RUN_ID}`, user_id: testUserId }))
      .select()
      .single();

    expect(insertErr).toBeNull();
    createdIds.push(inserted!.id);

    // 유저2로 UPDATE 시도
    const { data, error } = await user2Client
      .from('account_events')
      .update({ amount: 99999 })
      .eq('id', inserted!.id)
      .select();

    // RLS에 의해 빈 배열 반환 (0건 업데이트)
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it('RLS: 미인증 사용자는 account_events SELECT 불가', async () => {
    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
    });

    const { data, error } = await anonClient
      .from('account_events')
      .select('*');

    // RLS에 의해 에러 또는 빈 배열
    const isBlocked = !!error || (Array.isArray(data) && data.length === 0);
    expect(isBlocked).toBe(true);
  });
});

// ════════════════════════════════════════════
// 2. daily_snapshots
// ════════════════════════════════════════════

describe('daily_snapshots', () => {
  const createdIds: string[] = [];

  afterEach(async () => {
    if (createdIds.length > 0) {
      await adminClient.from('daily_snapshots').delete().in('id', createdIds);
      createdIds.length = 0;
    }
  });

  function makeSnapshot(overrides: Record<string, unknown> = {}) {
    return {
      user_id: testUserId,
      snapshot_date: '2026-01-15',
      total_value_krw: 1500000,
      principal_krw: 1000000,
      cash_krw: 500000,
      cash_usd: 0,
      net_profit_krw: 500000,
      fx_rate_usd: 1300,
      ...overrides,
    };
  }

  it('INSERT 후 SELECT 검증', async () => {
    const { data, error } = await userClient
      .from('daily_snapshots')
      .insert(makeSnapshot({ snapshot_date: '2026-01-20' }))
      .select()
      .single();

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data!.snapshot_date).toBe('2026-01-20');
    expect(Number(data!.total_value_krw)).toBe(1500000);
    createdIds.push(data!.id);
  });

  it('UNIQUE 제약 (user_id, snapshot_date): 중복 삽입 시 에러', async () => {
    const snapshot = makeSnapshot({ snapshot_date: '2026-01-21' });

    const { data: first, error: e1 } = await userClient
      .from('daily_snapshots')
      .insert(snapshot)
      .select()
      .single();

    expect(e1).toBeNull();
    createdIds.push(first!.id);

    // 동일 날짜 중복 삽입
    const { error: e2 } = await userClient
      .from('daily_snapshots')
      .insert(snapshot);

    expect(e2).not.toBeNull();
    // 유니크 제약 위반 코드 (23505)
    expect(e2!.code).toBe('23505');
  });

  it('날짜 범위 조회: from/to 필터 정상 동작', async () => {
    // 3개 날짜 삽입
    const dates = ['2026-02-01', '2026-02-15', '2026-03-01'];
    for (const d of dates) {
      const { data, error } = await userClient
        .from('daily_snapshots')
        .insert(makeSnapshot({ snapshot_date: d }))
        .select()
        .single();
      expect(error).toBeNull();
      createdIds.push(data!.id);
    }

    // 2월만 조회
    const { data, error } = await userClient
      .from('daily_snapshots')
      .select('snapshot_date')
      .eq('user_id', testUserId)
      .gte('snapshot_date', '2026-02-01')
      .lte('snapshot_date', '2026-02-28')
      .in('snapshot_date', dates);

    expect(error).toBeNull();
    expect(data!.length).toBe(2);
    expect(data!.every((r: any) => r.snapshot_date <= '2026-02-28')).toBe(true);
  });

  it('RLS: 미인증 사용자는 daily_snapshots SELECT 불가', async () => {
    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
    });

    const { data, error } = await anonClient
      .from('daily_snapshots')
      .select('*');

    const isBlocked = !!error || (Array.isArray(data) && data.length === 0);
    expect(isBlocked).toBe(true);
  });
});

// ════════════════════════════════════════════
// 3. corporate_actions
// ════════════════════════════════════════════

describe('corporate_actions', () => {
  it('인증된 사용자는 SELECT 가능 (빈 배열이어도 에러 없음)', async () => {
    const { data, error } = await userClient
      .from('corporate_actions')
      .select('*')
      .limit(5);

    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
  });

  it('일반 사용자는 INSERT 불가 (RLS 기본 deny)', async () => {
    const { error } = await userClient
      .from('corporate_actions')
      .insert({
        ticker: 'AAPL',
        asset_type: 'us_stock',
        action_type: 'split',
        effective_date: '2026-01-01',
        ratio: 4,
      });

    expect(error).not.toBeNull();
  });

  it('service_role은 INSERT 가능', async () => {
    const testTicker = `CA_TEST_${RUN_ID}`;

    const { data, error } = await adminClient
      .from('corporate_actions')
      .insert({
        ticker: testTicker,
        asset_type: 'us_stock',
        action_type: 'split',
        effective_date: '2026-01-01',
        ratio: 4,
      })
      .select()
      .single();

    expect(error).toBeNull();
    expect(data!.ticker).toBe(testTicker);

    // 정리
    await adminClient.from('corporate_actions').delete().eq('id', data!.id);
  });

  it('미인증 사용자는 SELECT도 불가', async () => {
    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
    });

    const { data, error } = await anonClient
      .from('corporate_actions')
      .select('*');

    // using (auth.role() = 'authenticated') 정책이므로 미인증은 빈 배열 또는 에러
    const isBlocked = !!error || (Array.isArray(data) && data.length === 0);
    expect(isBlocked).toBe(true);
  });
});

// ════════════════════════════════════════════
// 4. prices / fx_rates
// ════════════════════════════════════════════

describe('prices', () => {
  it('인증된 사용자는 SELECT 가능', async () => {
    const { data, error } = await userClient
      .from('prices')
      .select('*')
      .limit(5);

    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
  });

  it('일반 사용자는 INSERT 불가', async () => {
    const { error } = await userClient
      .from('prices')
      .insert({
        ticker: 'AAPL',
        asset_type: 'us_stock',
        date: '2026-01-10',
        close: 195.5,
        currency: 'USD',
      });

    expect(error).not.toBeNull();
  });

  it('service_role은 INSERT 가능', async () => {
    const testDate = '2026-01-01';
    const testTicker = `PRICE_TEST_${RUN_ID}`;

    const { data, error } = await adminClient
      .from('prices')
      .insert({
        ticker: testTicker,
        asset_type: 'us_stock',
        date: testDate,
        close: 100,
        currency: 'USD',
      })
      .select()
      .single();

    expect(error).toBeNull();
    expect(data!.ticker).toBe(testTicker);

    // 정리
    await adminClient
      .from('prices')
      .delete()
      .eq('ticker', testTicker)
      .eq('asset_type', 'us_stock')
      .eq('date', testDate);
  });
});

describe('fx_rates', () => {
  it('인증된 사용자는 SELECT 가능', async () => {
    const { data, error } = await userClient
      .from('fx_rates')
      .select('*')
      .limit(5);

    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
  });

  it('일반 사용자는 INSERT 불가', async () => {
    const { error } = await userClient
      .from('fx_rates')
      .insert({
        date: '2026-01-10',
        usd_krw: 1300,
      });

    expect(error).not.toBeNull();
  });

  it('service_role은 INSERT 가능', async () => {
    const testDate = '2000-01-01'; // 충돌 위험 낮은 과거 날짜

    // 이미 있으면 삭제 후 삽입
    await adminClient.from('fx_rates').delete().eq('date', testDate);

    const { data, error } = await adminClient
      .from('fx_rates')
      .insert({ date: testDate, usd_krw: 1200 })
      .select()
      .single();

    expect(error).toBeNull();
    expect(Number(data!.usd_krw)).toBe(1200);

    // 정리
    await adminClient.from('fx_rates').delete().eq('date', testDate);
  });
});

// ════════════════════════════════════════════
// 5. RPC Functions
// ════════════════════════════════════════════

describe('get_kpi_summary RPC', () => {
  const createdIds: string[] = [];

  afterEach(async () => {
    if (createdIds.length > 0) {
      await adminClient.from('account_events').delete().in('id', createdIds);
      createdIds.length = 0;
    }
  });

  it('미인증 상태에서 호출 시 에러 반환', async () => {
    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
    });

    const { error } = await anonClient.rpc('get_kpi_summary', {
      p_asset_type: null,
      p_current_prices: [],
      p_fx_rate_usd: 1300,
    });

    expect(error).not.toBeNull();
  });

  it('데이터 없을 때 0값 구조 반환', async () => {
    const { data, error } = await userClient.rpc('get_kpi_summary', {
      p_asset_type: null,
      p_current_prices: [],
      p_fx_rate_usd: 1300,
    });

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    // 반환 구조 검증
    expect(data).toHaveProperty('total_value_krw');
    expect(data).toHaveProperty('principal_krw');
    expect(data).toHaveProperty('net_profit_krw');
    expect(data).toHaveProperty('return_rate_pct');
    expect(data).toHaveProperty('cash');
    expect(data.cash).toHaveProperty('krw');
    expect(data.cash).toHaveProperty('usd');
    expect(data.cash).toHaveProperty('total_krw');
    expect(data).toHaveProperty('cumulative_dividend_krw');
    expect(data).toHaveProperty('cumulative_fee_krw');
    expect(data).toHaveProperty('cumulative_tax_krw');
    expect(data).toHaveProperty('holdings');
    expect(Array.isArray(data.holdings)).toBe(true);
  });

  it('입금 후 원금 집계 검증', async () => {
    // KRW 입금 1,000,000
    const { data: dep, error: e1 } = await userClient
      .from('account_events')
      .insert({
        event_type: 'deposit',
        event_date: '2026-01-05',
        currency: 'KRW',
        amount: 1000000,
        fx_rate_at_event: 1300,
        source: 'manual',
        user_id: testUserId,
      })
      .select()
      .single();

    expect(e1).toBeNull();
    createdIds.push(dep!.id);

    const { data, error } = await userClient.rpc('get_kpi_summary', {
      p_asset_type: null,
      p_current_prices: [],
      p_fx_rate_usd: 1300,
    });

    expect(error).toBeNull();
    expect(Number(data.principal_krw)).toBeGreaterThanOrEqual(1000000);
    expect(Number(data.cash.krw)).toBeGreaterThanOrEqual(1000000);
  });

  it('매수/매도 후 holdings 집계 검증', async () => {
    const ticker = `KPI${RUN_ID}`;

    // 매수 10주 @ 200 USD
    const { data: buy1, error: e1 } = await userClient
      .from('account_events')
      .insert({
        event_type: 'buy',
        event_date: '2026-01-10',
        asset_type: 'us_stock',
        ticker,
        name: 'KPI Test Stock',
        quantity: 10,
        price_per_unit: 200,
        currency: 'USD',
        fee: 0,
        tax: 0,
        amount: 2000,
        source: 'manual',
        user_id: testUserId,
      })
      .select()
      .single();

    expect(e1).toBeNull();
    createdIds.push(buy1!.id);

    // 매수 10주 @ 300 USD → 가중평균 250
    const { data: buy2, error: e2 } = await userClient
      .from('account_events')
      .insert({
        event_type: 'buy',
        event_date: '2026-01-15',
        asset_type: 'us_stock',
        ticker,
        name: 'KPI Test Stock',
        quantity: 10,
        price_per_unit: 300,
        currency: 'USD',
        fee: 0,
        tax: 0,
        amount: 3000,
        source: 'manual',
        user_id: testUserId,
      })
      .select()
      .single();

    expect(e2).toBeNull();
    createdIds.push(buy2!.id);

    const { data, error } = await userClient.rpc('get_kpi_summary', {
      p_asset_type: null,
      p_current_prices: [
        { ticker, asset_type: 'us_stock', price: 250, currency: 'USD' },
      ],
      p_fx_rate_usd: 1300,
    });

    expect(error).toBeNull();

    const holding = (data.holdings as any[]).find((h: any) => h.ticker === ticker);
    expect(holding).toBeDefined();
    expect(Number(holding.quantity)).toBe(20);
    // 가중평균: (10×200 + 10×300) / 20 = 250
    expect(Number(holding.avg_buy_price)).toBeCloseTo(250, 1);
  });

  it('전량 매도된 종목은 holdings에서 제외', async () => {
    const ticker = `SOLD_KPI${RUN_ID}`;

    const { data: buy, error: e1 } = await userClient
      .from('account_events')
      .insert({
        event_type: 'buy',
        event_date: '2026-01-10',
        asset_type: 'us_stock',
        ticker,
        name: 'Sold Stock',
        quantity: 5,
        price_per_unit: 100,
        currency: 'USD',
        fee: 0,
        tax: 0,
        amount: 500,
        source: 'manual',
        user_id: testUserId,
      })
      .select()
      .single();

    expect(e1).toBeNull();
    createdIds.push(buy!.id);

    const { data: sell, error: e2 } = await userClient
      .from('account_events')
      .insert({
        event_type: 'sell',
        event_date: '2026-01-20',
        asset_type: 'us_stock',
        ticker,
        name: 'Sold Stock',
        quantity: 5,
        price_per_unit: 120,
        currency: 'USD',
        fee: 0,
        tax: 0,
        amount: 600,
        source: 'manual',
        user_id: testUserId,
      })
      .select()
      .single();

    expect(e2).toBeNull();
    createdIds.push(sell!.id);

    const { data, error } = await userClient.rpc('get_kpi_summary', {
      p_asset_type: null,
      p_current_prices: [],
      p_fx_rate_usd: 1300,
    });

    expect(error).toBeNull();
    const holding = (data.holdings as any[]).find((h: any) => h.ticker === ticker);
    expect(holding).toBeUndefined();
  });

  it('p_fx_rate_usd <= 0 이면 에러 반환', async () => {
    const { error } = await userClient.rpc('get_kpi_summary', {
      p_asset_type: null,
      p_current_prices: [],
      p_fx_rate_usd: 0,
    });

    expect(error).not.toBeNull();
  });
});

describe('get_history_markers RPC', () => {
  const createdIds: string[] = [];

  afterEach(async () => {
    if (createdIds.length > 0) {
      await adminClient.from('account_events').delete().in('id', createdIds);
      createdIds.length = 0;
    }
  });

  it('미인증 상태에서 호출 시 에러 반환', async () => {
    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
    });

    const { error } = await anonClient.rpc('get_history_markers', {
      p_from: '2026-01-01',
      p_to: '2026-12-31',
    });

    expect(error).not.toBeNull();
  });

  it('배당/출금 이벤트 마커 반환 검증', async () => {
    // 배당 이벤트 (KRW) 삽입
    const { data: div, error: e1 } = await userClient
      .from('account_events')
      .insert({
        event_type: 'dividend',
        event_date: '2026-02-10',
        ticker: `MRKDIV${RUN_ID}`,
        name: 'Marker Dividend Stock',
        currency: 'KRW',
        amount: 50000,
        tax: 5000,
        fee: 0,
        source: 'manual',
        user_id: testUserId,
      })
      .select()
      .single();

    expect(e1).toBeNull();
    createdIds.push(div!.id);

    // 출금 이벤트 (KRW) 삽입
    const { data: wdraw, error: e2 } = await userClient
      .from('account_events')
      .insert({
        event_type: 'withdraw',
        event_date: '2026-02-15',
        currency: 'KRW',
        amount: 200000,
        fx_rate_at_event: 1300,
        source: 'manual',
        user_id: testUserId,
      })
      .select()
      .single();

    expect(e2).toBeNull();
    createdIds.push(wdraw!.id);

    const { data, error } = await userClient.rpc('get_history_markers', {
      p_from: '2026-02-01',
      p_to: '2026-02-28',
    });

    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);

    // 반환 구조 검증
    const divMarker = (data as any[]).find(
      (r: any) => r.event_type === 'dividend' && r.event_date === '2026-02-10'
    );
    expect(divMarker).toBeDefined();
    expect(divMarker).toHaveProperty('event_date');
    expect(divMarker).toHaveProperty('event_type');
    expect(divMarker).toHaveProperty('amount_krw');
    // KRW 배당은 그대로 반환
    expect(Number(divMarker.amount_krw)).toBeCloseTo(50000, 0);

    const wdrawMarker = (data as any[]).find(
      (r: any) => r.event_type === 'withdraw' && r.event_date === '2026-02-15'
    );
    expect(wdrawMarker).toBeDefined();
    expect(Number(wdrawMarker.amount_krw)).toBeCloseTo(200000, 0);
  });

  it('buy 이벤트는 마커에 포함되지 않음', async () => {
    const { data: buy, error: e1 } = await userClient
      .from('account_events')
      .insert({
        event_type: 'buy',
        event_date: '2026-03-01',
        asset_type: 'us_stock',
        ticker: `NOMARK${RUN_ID}`,
        name: 'Not A Marker',
        quantity: 5,
        price_per_unit: 100,
        currency: 'USD',
        fee: 0,
        tax: 0,
        amount: 500,
        source: 'manual',
        user_id: testUserId,
      })
      .select()
      .single();

    expect(e1).toBeNull();
    createdIds.push(buy!.id);

    const { data, error } = await userClient.rpc('get_history_markers', {
      p_from: '2026-03-01',
      p_to: '2026-03-31',
    });

    expect(error).toBeNull();
    const buyMarker = (data as any[]).find((r: any) => r.event_type === 'buy');
    expect(buyMarker).toBeUndefined();
  });

  it('기간 외 이벤트는 마커에 포함되지 않음', async () => {
    const { data: div, error: e1 } = await userClient
      .from('account_events')
      .insert({
        event_type: 'dividend',
        event_date: '2025-06-01',
        ticker: `OUTRANGE${RUN_ID}`,
        name: 'Out Of Range',
        currency: 'KRW',
        amount: 10000,
        tax: 1000,
        fee: 0,
        source: 'manual',
        user_id: testUserId,
      })
      .select()
      .single();

    expect(e1).toBeNull();
    createdIds.push(div!.id);

    const { data, error } = await userClient.rpc('get_history_markers', {
      p_from: '2026-01-01',
      p_to: '2026-12-31',
    });

    expect(error).toBeNull();
    const outRangeMarker = (data as any[]).find(
      (r: any) => r.event_date === '2025-06-01'
    );
    expect(outRangeMarker).toBeUndefined();
  });
});
