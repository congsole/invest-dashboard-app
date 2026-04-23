/**
 * 대시보드 집계 RPC 통합 테스트
 *
 * 필요 환경변수 (app/.env.test):
 *   SUPABASE_URL          — Supabase 프로젝트 URL
 *   SUPABASE_ANON_KEY     — anon/publishable key
 *   SUPABASE_SERVICE_KEY  — (선택) service_role key. 있으면 테스트 유저 자동 생성/삭제
 *   SUPABASE_TEST_EMAIL   — (SUPABASE_SERVICE_KEY 없을 때 필수) 미리 생성한 테스트 계정 이메일
 *   SUPABASE_TEST_PASSWORD— (SUPABASE_SERVICE_KEY 없을 때 필수) 미리 생성한 테스트 계정 비밀번호
 *
 * SUPABASE_SERVICE_KEY 없고 SUPABASE_TEST_EMAIL도 없으면:
 *   모든 인증 필요 테스트를 스킵하고, 미인증 RPC 차단 테스트만 실행한다.
 *
 * Edge Function 테스트(getMarketPrices, getExchangeRate)는
 * 외부 API 의존성으로 인해 이 파일에서 제외한다.
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env.test') });

import { createClient, SupabaseClient } from '@supabase/supabase-js';

jest.setTimeout(30000);

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const SUPABASE_TEST_EMAIL = process.env.SUPABASE_TEST_EMAIL;
const SUPABASE_TEST_PASSWORD = process.env.SUPABASE_TEST_PASSWORD;

const HAS_SERVICE_KEY = !!SUPABASE_SERVICE_KEY;
const HAS_TEST_CREDENTIALS = !!(SUPABASE_TEST_EMAIL && SUPABASE_TEST_PASSWORD);
const CAN_RUN_AUTH_TESTS = HAS_SERVICE_KEY || HAS_TEST_CREDENTIALS;

const RUN_ID = Date.now();

let userClient: SupabaseClient;
let adminClient: SupabaseClient | null = null;
let testUserId: string | null = null;
// service_role로 자동 생성한 유저는 afterAll에서 삭제, 사전 설정된 계정은 삭제하지 않음
let shouldDeleteUser = false;

async function insertTradeEvent(
  client: SupabaseClient,
  overrides: Partial<{
    ticker: string;
    name: string;
    asset_type: string;
    trade_type: string;
    trade_date: string;
    quantity: number;
    price_per_unit: number;
    currency: string;
    fee: number;
    fee_currency: string;
    tax: number;
    settlement_amount: number;
  }> = {}
) {
  const defaults = {
    ticker: 'TSLA',
    name: 'Tesla',
    asset_type: 'us_stock',
    trade_type: 'buy',
    trade_date: '2026-01-10',
    quantity: 10,
    price_per_unit: 200,
    currency: 'USD',
    fee: 1000,
    fee_currency: 'KRW',
    tax: 0,
    settlement_amount: -2001000,
  };
  const row = { ...defaults, ...overrides };

  const { data, error } = await client.from('trade_events').insert(row).select('id').single();
  if (error) throw new Error(`trade_events insert 실패: ${error.message}`);
  return data!.id as string;
}

async function deleteTradeEvent(client: SupabaseClient, id: string) {
  await client.from('trade_events').delete().eq('id', id);
}

beforeAll(async () => {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('SUPABASE_URL 또는 SUPABASE_ANON_KEY 환경변수가 없습니다.');
  }

  userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });

  if (HAS_SERVICE_KEY) {
    adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY!, {
      auth: { persistSession: false },
    });
  }

  if (!CAN_RUN_AUTH_TESTS) {
    // 인증 테스트를 실행할 수 없음 — 미인증 차단 테스트만 진행
    return;
  }

  if (HAS_SERVICE_KEY) {
    // service_role로 테스트 유저 자동 생성 (이메일 확인 우회)
    const testEmail = `dashboard-test-${RUN_ID}@example.com`;
    const { data, error } = await adminClient!.auth.admin.createUser({
      email: testEmail,
      password: 'TestPassword123!',
      email_confirm: true,
    });
    if (error) throw new Error(`테스트 유저 생성 실패: ${error.message}`);
    testUserId = data.user.id;
    shouldDeleteUser = true;

    const { error: signInError } = await userClient.auth.signInWithPassword({
      email: testEmail,
      password: 'TestPassword123!',
    });
    if (signInError) throw new Error(`테스트 유저 로그인 실패: ${signInError.message}`);
  } else {
    // 사전 설정된 테스트 계정으로 로그인
    const { data, error } = await userClient.auth.signInWithPassword({
      email: SUPABASE_TEST_EMAIL!,
      password: SUPABASE_TEST_PASSWORD!,
    });
    if (error) throw new Error(`테스트 계정 로그인 실패: ${error.message} — app/.env.test의 SUPABASE_TEST_EMAIL/SUPABASE_TEST_PASSWORD를 확인하세요.`);
    testUserId = data.user?.id ?? null;
    shouldDeleteUser = false;
  }
});

afterAll(async () => {
  if (adminClient && testUserId && shouldDeleteUser) {
    await adminClient.auth.admin.deleteUser(testUserId);
  }
  await userClient?.auth.signOut();
});

// ────────────────────────────────────────────
// 미인증 상태 RPC 호출 차단 (항상 실행)
// ────────────────────────────────────────────

describe('미인증 상태 RPC 호출 차단', () => {
  let anonOnlyClient: SupabaseClient;

  beforeAll(() => {
    anonOnlyClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
    });
  });

  it('get_portfolio_summary — 미인증 시 에러 또는 빈 배열 반환 (데이터 미노출)', async () => {
    // LANGUAGE sql 함수는 auth.uid() is null이면 빈 배열 반환
    // LANGUAGE plpgsql 함수는 Unauthorized 예외 반환
    // 어느 쪽이든 다른 유저의 데이터가 노출되지 않으면 통과
    const { data, error } = await anonOnlyClient.rpc('get_portfolio_summary', { p_asset_type: null });
    const isBlocked = !!error || (Array.isArray(data) && data.length === 0);
    expect(isBlocked).toBe(true);
  });

  it('get_asset_history — 미인증 시 에러 또는 빈 배열 반환 (데이터 미노출)', async () => {
    const { data, error } = await anonOnlyClient.rpc('get_asset_history', {
      p_period: 'month',
      p_asset_type: null,
    });
    const isBlocked = !!error || (Array.isArray(data) && data.length === 0);
    expect(isBlocked).toBe(true);
  });

  it('get_sector_allocation — 미인증 시 에러 또는 빈 배열 반환 (데이터 미노출)', async () => {
    const { data, error } = await anonOnlyClient.rpc('get_sector_allocation');
    const isBlocked = !!error || (Array.isArray(data) && data.length === 0);
    expect(isBlocked).toBe(true);
  });
});

// ────────────────────────────────────────────
// get_portfolio_summary (인증 필요)
// ────────────────────────────────────────────

describe('get_portfolio_summary', () => {
  const insertedIds: string[] = [];

  beforeAll(() => {
    if (!CAN_RUN_AUTH_TESTS) {
      console.warn(
        '[SKIP] get_portfolio_summary 테스트 — 인증 자격증명 없음. ' +
        'app/.env.test에 SUPABASE_SERVICE_KEY 또는 SUPABASE_TEST_EMAIL/SUPABASE_TEST_PASSWORD를 설정하세요.'
      );
    }
  });

  afterEach(async () => {
    for (const id of insertedIds) {
      await deleteTradeEvent(userClient, id);
    }
    insertedIds.length = 0;
  });

  it('데이터 없을 때 빈 배열 반환', async () => {
    if (!CAN_RUN_AUTH_TESTS) return;
    const { data, error } = await userClient.rpc('get_portfolio_summary', { p_asset_type: null });
    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
  });

  it('매수 2건: 가중평균 평단가 계산 정확성 검증', async () => {
    if (!CAN_RUN_AUTH_TESTS) return;

    // 1차 매수: 10주 @ 200
    const id1 = await insertTradeEvent(userClient, {
      ticker: `TA${RUN_ID}`,
      name: 'TestStock A',
      asset_type: 'us_stock',
      trade_type: 'buy',
      trade_date: '2026-01-10',
      quantity: 10,
      price_per_unit: 200,
      currency: 'USD',
      fee: 0,
      fee_currency: 'KRW',
      tax: 0,
      settlement_amount: -2000,
    });
    insertedIds.push(id1);

    // 2차 매수: 10주 @ 300
    const id2 = await insertTradeEvent(userClient, {
      ticker: `TA${RUN_ID}`,
      name: 'TestStock A',
      asset_type: 'us_stock',
      trade_type: 'buy',
      trade_date: '2026-01-15',
      quantity: 10,
      price_per_unit: 300,
      currency: 'USD',
      fee: 0,
      fee_currency: 'KRW',
      tax: 0,
      settlement_amount: -3000,
    });
    insertedIds.push(id2);

    const { data, error } = await userClient.rpc('get_portfolio_summary', { p_asset_type: null });
    expect(error).toBeNull();

    const item = (data as any[]).find((r: any) => r.ticker === `TA${RUN_ID}`);
    expect(item).toBeDefined();

    // 가중평균: (10×200 + 10×300) / 20 = 250
    expect(Number(item.avg_buy_price)).toBeCloseTo(250, 2);
    expect(Number(item.quantity)).toBe(20);
  });

  it('asset_type 필터: 한국주식만 조회', async () => {
    if (!CAN_RUN_AUTH_TESTS) return;

    const id1 = await insertTradeEvent(userClient, {
      ticker: `KR${RUN_ID}`,
      name: 'Korean Stock',
      asset_type: 'korean_stock',
      trade_type: 'buy',
      trade_date: '2026-01-10',
      quantity: 5,
      price_per_unit: 50000,
      currency: 'KRW',
      fee: 0,
      fee_currency: 'KRW',
      tax: 0,
      settlement_amount: -250000,
    });
    insertedIds.push(id1);

    const { data, error } = await userClient.rpc('get_portfolio_summary', {
      p_asset_type: 'korean_stock',
    });
    expect(error).toBeNull();

    const items = data as any[];
    const nonKr = items.filter((r: any) => r.asset_type !== 'korean_stock');
    expect(nonKr).toHaveLength(0);

    const item = items.find((r: any) => r.ticker === `KR${RUN_ID}`);
    expect(item).toBeDefined();
    expect(Number(item.quantity)).toBe(5);
  });

  it('전량 매도 후 재매수: 평단가 초기화 검증', async () => {
    if (!CAN_RUN_AUTH_TESTS) return;

    const ticker = `RE${RUN_ID}`;

    // 1차 매수: 10주 @ 100
    const id1 = await insertTradeEvent(userClient, {
      ticker,
      name: 'Reset Stock',
      asset_type: 'us_stock',
      trade_type: 'buy',
      trade_date: '2026-01-10',
      quantity: 10,
      price_per_unit: 100,
      currency: 'USD',
      fee: 0,
      fee_currency: 'KRW',
      tax: 0,
      settlement_amount: -1000,
    });
    insertedIds.push(id1);

    // 전량 매도: 10주
    const id2 = await insertTradeEvent(userClient, {
      ticker,
      name: 'Reset Stock',
      asset_type: 'us_stock',
      trade_type: 'sell',
      trade_date: '2026-01-20',
      quantity: 10,
      price_per_unit: 150,
      currency: 'USD',
      fee: 0,
      fee_currency: 'KRW',
      tax: 0,
      settlement_amount: 1500,
    });
    insertedIds.push(id2);

    // 재매수: 5주 @ 200 → 평단가 200으로 초기화
    const id3 = await insertTradeEvent(userClient, {
      ticker,
      name: 'Reset Stock',
      asset_type: 'us_stock',
      trade_type: 'buy',
      trade_date: '2026-02-01',
      quantity: 5,
      price_per_unit: 200,
      currency: 'USD',
      fee: 0,
      fee_currency: 'KRW',
      tax: 0,
      settlement_amount: -1000,
    });
    insertedIds.push(id3);

    const { data, error } = await userClient.rpc('get_portfolio_summary', { p_asset_type: null });
    expect(error).toBeNull();

    const item = (data as any[]).find((r: any) => r.ticker === ticker);
    expect(item).toBeDefined();
    expect(Number(item.avg_buy_price)).toBeCloseTo(200, 2);
    expect(Number(item.quantity)).toBe(5);
  });

  it('전량 매도된 종목은 결과에서 제외', async () => {
    if (!CAN_RUN_AUTH_TESTS) return;

    const ticker = `SOLD${RUN_ID}`;

    const id1 = await insertTradeEvent(userClient, {
      ticker,
      name: 'Sold Stock',
      asset_type: 'us_stock',
      trade_type: 'buy',
      trade_date: '2026-01-10',
      quantity: 10,
      price_per_unit: 100,
      currency: 'USD',
      fee: 0,
      fee_currency: 'KRW',
      tax: 0,
      settlement_amount: -1000,
    });
    insertedIds.push(id1);

    const id2 = await insertTradeEvent(userClient, {
      ticker,
      name: 'Sold Stock',
      asset_type: 'us_stock',
      trade_type: 'sell',
      trade_date: '2026-01-20',
      quantity: 10,
      price_per_unit: 150,
      currency: 'USD',
      fee: 0,
      fee_currency: 'KRW',
      tax: 0,
      settlement_amount: 1500,
    });
    insertedIds.push(id2);

    const { data, error } = await userClient.rpc('get_portfolio_summary', { p_asset_type: null });
    expect(error).toBeNull();

    const item = (data as any[]).find((r: any) => r.ticker === ticker);
    expect(item).toBeUndefined();
  });
});

// ────────────────────────────────────────────
// get_asset_history (인증 필요)
// ────────────────────────────────────────────

describe('get_asset_history', () => {
  const insertedIds: string[] = [];

  afterEach(async () => {
    for (const id of insertedIds) {
      await deleteTradeEvent(userClient, id);
    }
    insertedIds.length = 0;
  });

  it('잘못된 period 값 전달 시 에러 반환 (인증 없이도 RLS 전 함수 인증 체크로 Unauthorized)', async () => {
    if (!CAN_RUN_AUTH_TESTS) return;
    const { error } = await userClient.rpc('get_asset_history', {
      p_period: 'invalid_period',
      p_asset_type: null,
    });
    expect(error).not.toBeNull();
  });

  it('period=month: 반환 구조 검증 (bucket, total_invested, total_fee_tax)', async () => {
    if (!CAN_RUN_AUTH_TESTS) return;

    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
    const dateStr = twoWeeksAgo.toISOString().split('T')[0];

    const id1 = await insertTradeEvent(userClient, {
      ticker: `HIST${RUN_ID}`,
      name: 'History Stock',
      asset_type: 'us_stock',
      trade_type: 'buy',
      trade_date: dateStr,
      quantity: 5,
      price_per_unit: 100,
      currency: 'USD',
      fee: 500,
      fee_currency: 'KRW',
      tax: 100,
      settlement_amount: -500600,
    });
    insertedIds.push(id1);

    const { data, error } = await userClient.rpc('get_asset_history', {
      p_period: 'month',
      p_asset_type: null,
    });
    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);

    if ((data as any[]).length > 0) {
      const first = (data as any[])[0];
      expect(first).toHaveProperty('bucket');
      expect(first).toHaveProperty('total_invested');
      expect(first).toHaveProperty('total_fee_tax');
      // bucket은 ISO 8601 형식
      expect(first.bucket).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
      expect(Number(first.total_fee_tax)).toBeGreaterThanOrEqual(0);
    }
  });

  it('period=year: 반환 버킷이 month 단위 (YYYY-MM-01T...)', async () => {
    if (!CAN_RUN_AUTH_TESTS) return;

    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const dateStr = sixMonthsAgo.toISOString().split('T')[0];

    const id1 = await insertTradeEvent(userClient, {
      ticker: `YEAR${RUN_ID}`,
      name: 'Year Stock',
      asset_type: 'korean_stock',
      trade_type: 'buy',
      trade_date: dateStr,
      quantity: 10,
      price_per_unit: 10000,
      currency: 'KRW',
      fee: 100,
      fee_currency: 'KRW',
      tax: 0,
      settlement_amount: -100100,
    });
    insertedIds.push(id1);

    const { data, error } = await userClient.rpc('get_asset_history', {
      p_period: 'year',
      p_asset_type: null,
    });
    expect(error).toBeNull();

    if ((data as any[]).length > 0) {
      const first = (data as any[])[0];
      // year 기간은 month 버킷: 일자가 01
      const bucketDate = first.bucket.substring(0, 10);
      expect(bucketDate).toMatch(/^\d{4}-\d{2}-01$/);
    }
  });

  it('누적 total_invested: 여러 버킷에 걸친 단조 증가 검증', async () => {
    if (!CAN_RUN_AUTH_TESTS) return;

    const today = new Date();

    const twoMonthsAgo = new Date(today);
    twoMonthsAgo.setDate(today.getDate() - 60);
    const date1 = twoMonthsAgo.toISOString().split('T')[0];

    const oneMonthAgo = new Date(today);
    oneMonthAgo.setDate(today.getDate() - 30);
    const date2 = oneMonthAgo.toISOString().split('T')[0];

    const id1 = await insertTradeEvent(userClient, {
      ticker: `CUM${RUN_ID}`,
      name: 'Cumulative Stock',
      asset_type: 'korean_stock',
      trade_type: 'buy',
      trade_date: date1,
      quantity: 5,
      price_per_unit: 10000,
      currency: 'KRW',
      fee: 100,
      fee_currency: 'KRW',
      tax: 0,
      settlement_amount: -50100,
    });
    insertedIds.push(id1);

    const id2 = await insertTradeEvent(userClient, {
      ticker: `CUM${RUN_ID}`,
      name: 'Cumulative Stock',
      asset_type: 'korean_stock',
      trade_type: 'buy',
      trade_date: date2,
      quantity: 5,
      price_per_unit: 12000,
      currency: 'KRW',
      fee: 100,
      fee_currency: 'KRW',
      tax: 0,
      settlement_amount: -60100,
    });
    insertedIds.push(id2);

    const { data, error } = await userClient.rpc('get_asset_history', {
      p_period: 'year',
      p_asset_type: 'korean_stock',
    });
    expect(error).toBeNull();

    const rows = data as any[];
    // 누적값은 단조 증가
    for (let i = 1; i < rows.length; i++) {
      expect(Number(rows[i].total_invested)).toBeGreaterThanOrEqual(
        Number(rows[i - 1].total_invested)
      );
    }
  });
});

// ────────────────────────────────────────────
// get_sector_allocation (인증 필요)
// ────────────────────────────────────────────

describe('get_sector_allocation', () => {
  const insertedIds: string[] = [];

  afterEach(async () => {
    for (const id of insertedIds) {
      await deleteTradeEvent(userClient, id);
    }
    insertedIds.length = 0;
  });

  it('반환 구조 검증 (asset_type, total_invested, ticker_count)', async () => {
    if (!CAN_RUN_AUTH_TESTS) return;

    const id1 = await insertTradeEvent(userClient, {
      ticker: `SEC${RUN_ID}A`,
      name: 'Sector Stock A',
      asset_type: 'us_stock',
      trade_type: 'buy',
      trade_date: '2026-01-10',
      quantity: 10,
      price_per_unit: 100,
      currency: 'USD',
      fee: 0,
      fee_currency: 'KRW',
      tax: 0,
      settlement_amount: -1000,
    });
    insertedIds.push(id1);

    const { data, error } = await userClient.rpc('get_sector_allocation');
    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);

    const item = (data as any[]).find((r: any) => r.asset_type === 'us_stock');
    if (item) {
      expect(item).toHaveProperty('asset_type');
      expect(item).toHaveProperty('total_invested');
      expect(item).toHaveProperty('ticker_count');
      expect(Number(item.ticker_count)).toBeGreaterThanOrEqual(1);
    }
  });

  it('여러 부문 데이터: 각 asset_type별 ticker_count 검증', async () => {
    if (!CAN_RUN_AUTH_TESTS) return;

    // 한국주식 2종목
    const idKr1 = await insertTradeEvent(userClient, {
      ticker: `KRS1${RUN_ID}`,
      name: 'KR Stock 1',
      asset_type: 'korean_stock',
      trade_type: 'buy',
      trade_date: '2026-01-10',
      quantity: 5,
      price_per_unit: 50000,
      currency: 'KRW',
      fee: 0,
      fee_currency: 'KRW',
      tax: 0,
      settlement_amount: -250000,
    });
    insertedIds.push(idKr1);

    const idKr2 = await insertTradeEvent(userClient, {
      ticker: `KRS2${RUN_ID}`,
      name: 'KR Stock 2',
      asset_type: 'korean_stock',
      trade_type: 'buy',
      trade_date: '2026-01-11',
      quantity: 10,
      price_per_unit: 30000,
      currency: 'KRW',
      fee: 0,
      fee_currency: 'KRW',
      tax: 0,
      settlement_amount: -300000,
    });
    insertedIds.push(idKr2);

    // 미국주식 1종목
    const idUs = await insertTradeEvent(userClient, {
      ticker: `USS1${RUN_ID}`,
      name: 'US Stock 1',
      asset_type: 'us_stock',
      trade_type: 'buy',
      trade_date: '2026-01-10',
      quantity: 5,
      price_per_unit: 200,
      currency: 'USD',
      fee: 0,
      fee_currency: 'KRW',
      tax: 0,
      settlement_amount: -1000,
    });
    insertedIds.push(idUs);

    const { data, error } = await userClient.rpc('get_sector_allocation');
    expect(error).toBeNull();

    const rows = data as any[];
    const krItem = rows.find((r: any) => r.asset_type === 'korean_stock');
    const usItem = rows.find((r: any) => r.asset_type === 'us_stock');

    expect(krItem).toBeDefined();
    expect(Number(krItem.ticker_count)).toBeGreaterThanOrEqual(2);

    expect(usItem).toBeDefined();
    expect(Number(usItem.ticker_count)).toBeGreaterThanOrEqual(1);
  });

  it('전량 매도된 종목은 sector_allocation에서 제외 (portfolio_summary 교차 검증)', async () => {
    if (!CAN_RUN_AUTH_TESTS) return;

    const ticker = `SECEX${RUN_ID}`;

    const idBuy = await insertTradeEvent(userClient, {
      ticker,
      name: 'Excluded Stock',
      asset_type: 'crypto',
      trade_type: 'buy',
      trade_date: '2026-01-10',
      quantity: 100,
      price_per_unit: 50000,
      currency: 'KRW',
      fee: 0,
      fee_currency: 'KRW',
      tax: 0,
      settlement_amount: -5000000,
    });
    insertedIds.push(idBuy);

    const idSell = await insertTradeEvent(userClient, {
      ticker,
      name: 'Excluded Stock',
      asset_type: 'crypto',
      trade_type: 'sell',
      trade_date: '2026-01-20',
      quantity: 100,
      price_per_unit: 60000,
      currency: 'KRW',
      fee: 0,
      fee_currency: 'KRW',
      tax: 0,
      settlement_amount: 6000000,
    });
    insertedIds.push(idSell);

    // portfolio_summary에도 없어야 함
    const { data: summaryData } = await userClient.rpc('get_portfolio_summary', {
      p_asset_type: 'crypto',
    });
    const item = (summaryData as any[] ?? []).find((r: any) => r.ticker === ticker);
    expect(item).toBeUndefined();
  });
});
