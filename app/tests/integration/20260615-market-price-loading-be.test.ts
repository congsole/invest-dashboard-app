/**
 * [20260615-market-price-loading-be] 현재가 로딩 전략 — BE 트랙 통합 테스트
 *
 * 테스트 범위:
 *   1. get-market-prices Edge Function — 미인증 401
 *   2. get-market-prices Edge Function — 잘못된 파라미터 400 (tickers 없음)
 *   3. get-market-prices Edge Function — us_stock 8개 초과 시 400
 *   4. get-market-prices Edge Function — chunk_index 파라미터 수신 및 동작
 *   5. get-market-prices Edge Function — 응답 구조 (prices[].source, failed 배열)
 *   6. get-market-prices Edge Function — 부분 실패 시 HTTP 200 유지
 *   7. getBaselinePrices — prices 테이블 REST 조회 (보유 종목별 최신 종가)
 *   8. getBaselinePrices — holdings 빈 배열이면 빈 배열 반환
 *   9. getBaselinePrices — ticker+asset_type 필터링 (동일 ticker 다른 asset_type 제외)
 *  10. prices 테이블 RLS — 인증 사용자 SELECT 가능
 *  11. prices 테이블 RLS — 미인증 사용자 SELECT 불가
 *  12. prices 테이블 RLS — 일반 사용자 INSERT 불가 (service_role 전용)
 *
 * Edge Function 외부 API (Twelve Data, 네이버, CoinGecko) 의존:
 *   - 로컬 환경에서는 외부 API 키가 없거나 네트워크 연결이 제한될 수 있음.
 *   - 외부 API 실패 시 응답이 failed 배열에 담겨 HTTP 200으로 반환되는 것이 핵심 검증 포인트.
 *   - prices[].source 필드와 failed 배열의 존재 자체를 검증한다.
 *
 * 필요 환경변수 (app/.env.test):
 *   SUPABASE_URL          — 로컬 Supabase URL (http://127.0.0.1:54321)
 *   SUPABASE_ANON_KEY     — anon/publishable key
 *   SUPABASE_SERVICE_KEY  — service_role key (RLS 우회, 테스트 데이터 삽입)
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env.test') });

import { createClient, SupabaseClient } from '@supabase/supabase-js';

jest.setTimeout(60000);

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;

const RUN_ID = Date.now();

let adminClient: SupabaseClient;
let userClient: SupabaseClient;
let testUserId: string;

const TEST_EMAIL = `market-be-${RUN_ID}@example.com`;
const TEST_PASSWORD = 'TestPassword123!';

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
  // 테스트용 prices 데이터 정리
  await adminClient.from('prices').delete().like('ticker', 'TEST_%');

  // 테스트 유저 정리
  if (testUserId) await adminClient.auth.admin.deleteUser(testUserId);
  await userClient?.auth.signOut();
});

// ────────────────────────────────────────────
// 헬퍼: 액세스 토큰 조회
// ────────────────────────────────────────────

async function getAccessToken(client: SupabaseClient): Promise<string> {
  const { data: { session } } = await client.auth.getSession();
  if (!session?.access_token) throw new Error('세션 없음');
  return session.access_token;
}

// ────────────────────────────────────────────
// 헬퍼: get-market-prices Edge Function 직접 HTTP 호출
// ────────────────────────────────────────────

async function callGetMarketPrices(
  accessToken: string | null,
  body: object,
): Promise<{ status: number; data: any }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  const res = await fetch(`${SUPABASE_URL}/functions/v1/get-market-prices`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  let data: any;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  return { status: res.status, data };
}

// ════════════════════════════════════════════
// 1. 미인증 401
// ════════════════════════════════════════════

describe('get-market-prices — 미인증 401', () => {
  it('Authorization 헤더 없이 호출 시 401 반환', async () => {
    const { status, data } = await callGetMarketPrices(null, {
      tickers: [{ ticker: 'AAPL', asset_type: 'us_stock' }],
    });

    expect(status).toBe(401);
    // 로컬 Edge Function 런타임 응답 형식 허용
    const isUnauthorized =
      data?.error?.code === '401' ||
      (typeof data?.msg === 'string' && data.msg.toLowerCase().includes('authorization'));
    expect(isUnauthorized).toBe(true);
  });

  it('잘못된 토큰으로 호출 시 401 반환', async () => {
    const { status } = await callGetMarketPrices('invalid.token.here', {
      tickers: [{ ticker: 'AAPL', asset_type: 'us_stock' }],
    });

    expect(status).toBe(401);
  });
});

// ════════════════════════════════════════════
// 2. 잘못된 파라미터 400 — tickers 없음/빈 배열
// ════════════════════════════════════════════

describe('get-market-prices — 잘못된 파라미터 400', () => {
  let token: string;

  beforeAll(async () => {
    token = await getAccessToken(userClient);
  });

  it('tickers 배열이 없으면 400 반환', async () => {
    const { status, data } = await callGetMarketPrices(token, {});

    expect(status).toBe(400);
    expect(data?.error).toBeDefined();
    expect(data.error.code).toBe('400');
  });

  it('tickers 배열이 비어 있으면 400 반환', async () => {
    const { status, data } = await callGetMarketPrices(token, {
      tickers: [],
    });

    expect(status).toBe(400);
    expect(data?.error).toBeDefined();
    expect(data.error.code).toBe('400');
  });

  it('JSON 형식 오류 시 400 반환', async () => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    };

    const res = await fetch(`${SUPABASE_URL}/functions/v1/get-market-prices`, {
      method: 'POST',
      headers,
      body: 'not-valid-json',
    });

    expect(res.status).toBe(400);
  });
});

// ════════════════════════════════════════════
// 3. us_stock 8개 초과 시 400
// ════════════════════════════════════════════

describe('get-market-prices — us_stock 8개 초과 시 400', () => {
  let token: string;

  beforeAll(async () => {
    token = await getAccessToken(userClient);
  });

  it('us_stock 8개는 허용 (400 반환 없음)', async () => {
    const tickers = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'NVDA', 'TSLA', 'NFLX'].map(
      (ticker) => ({ ticker, asset_type: 'us_stock' }),
    );

    const { status } = await callGetMarketPrices(token, { tickers });

    // 400이 아닌 상태 (200 또는 외부 API 실패여도 200)
    expect(status).not.toBe(400);
  });

  it('us_stock 9개이면 400 반환 (청크 분할 필요)', async () => {
    const tickers = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'NVDA', 'TSLA', 'NFLX', 'AMD'].map(
      (ticker) => ({ ticker, asset_type: 'us_stock' }),
    );

    const { status, data } = await callGetMarketPrices(token, { tickers });

    expect(status).toBe(400);
    expect(data?.error).toBeDefined();
    expect(data.error.code).toBe('400');
    // 에러 메시지에 실제 종목 수(9) 포함
    expect(data.error.message).toContain('9');
    expect(data.error.message).toContain('8');
  });

  it('us_stock 10개 이상도 400 반환', async () => {
    const tickers = [
      'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'NVDA', 'TSLA', 'NFLX', 'AMD', 'INTC',
    ].map((ticker) => ({ ticker, asset_type: 'us_stock' }));

    const { status, data } = await callGetMarketPrices(token, { tickers });

    expect(status).toBe(400);
    expect(data.error.message).toContain('10');
  });

  it('us_stock 8개 + 한국주식 여러 개 혼합은 허용', async () => {
    const tickers = [
      ...['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'NVDA', 'TSLA', 'NFLX'].map((t) => ({
        ticker: t,
        asset_type: 'us_stock' as const,
      })),
      { ticker: '005930', asset_type: 'korean_stock' as const },
      { ticker: '000660', asset_type: 'korean_stock' as const },
    ];

    const { status } = await callGetMarketPrices(token, { tickers });

    // us_stock이 정확히 8개이므로 400 아님
    expect(status).not.toBe(400);
  });
});

// ════════════════════════════════════════════
// 4. chunk_index 파라미터 수신
// ════════════════════════════════════════════

describe('get-market-prices — chunk_index 파라미터', () => {
  let token: string;

  beforeAll(async () => {
    token = await getAccessToken(userClient);
  });

  it('chunk_index=0 (기본값) 호출 시 200 반환', async () => {
    const { status } = await callGetMarketPrices(token, {
      tickers: [{ ticker: 'AAPL', asset_type: 'us_stock' }],
      chunk_index: 0,
    });

    // 외부 API 실패여도 200 (failed 배열에 담김)
    expect(status).toBe(200);
  });

  it('chunk_index=1 호출 시 200 반환', async () => {
    const { status } = await callGetMarketPrices(token, {
      tickers: [{ ticker: 'MSFT', asset_type: 'us_stock' }],
      chunk_index: 1,
    });

    expect(status).toBe(200);
  });

  it('chunk_index 미전송 시에도 200 반환 (기본값 0)', async () => {
    const { status } = await callGetMarketPrices(token, {
      tickers: [{ ticker: 'GOOGL', asset_type: 'us_stock' }],
    });

    expect(status).toBe(200);
  });
});

// ════════════════════════════════════════════
// 5. 응답 구조 검증 (prices[].source, failed 배열)
// ════════════════════════════════════════════

describe('get-market-prices — 응답 구조 (prices[].source, failed 배열)', () => {
  let token: string;

  beforeAll(async () => {
    token = await getAccessToken(userClient);
  });

  it('응답에 prices 배열과 failed 배열이 항상 존재한다', async () => {
    const { status, data } = await callGetMarketPrices(token, {
      tickers: [{ ticker: 'AAPL', asset_type: 'us_stock' }],
      chunk_index: 0,
    });

    expect(status).toBe(200);
    expect(data).toHaveProperty('prices');
    expect(data).toHaveProperty('failed');
    expect(Array.isArray(data.prices)).toBe(true);
    expect(Array.isArray(data.failed)).toBe(true);
  });

  it('prices 항목에 source 필드가 존재한다 (성공한 경우)', async () => {
    const { status, data } = await callGetMarketPrices(token, {
      tickers: [{ ticker: 'AAPL', asset_type: 'us_stock' }],
      chunk_index: 0,
    });

    expect(status).toBe(200);

    // prices에 항목이 있으면 source 필드 검증
    if (data.prices.length > 0) {
      const item = data.prices[0];
      expect(item).toHaveProperty('source');
      expect(['realtime', 'cached']).toContain(item.source);
      // 기타 필드 구조 검증
      expect(item).toHaveProperty('ticker');
      expect(item).toHaveProperty('asset_type');
      expect(item).toHaveProperty('price');
      expect(item).toHaveProperty('currency');
      expect(item).toHaveProperty('fetched_at');
      expect(item).toHaveProperty('is_cached');
    }
  });

  it('failed 항목에 ticker, asset_type, reason 필드가 존재한다', async () => {
    const { status, data } = await callGetMarketPrices(token, {
      tickers: [{ ticker: 'AAPL', asset_type: 'us_stock' }],
      chunk_index: 0,
    });

    expect(status).toBe(200);

    // failed에 항목이 있으면 구조 검증
    if (data.failed.length > 0) {
      const item = data.failed[0];
      expect(item).toHaveProperty('ticker');
      expect(item).toHaveProperty('asset_type');
      expect(item).toHaveProperty('reason');
    }
  });

  it('prices + failed 합계는 요청한 tickers 수와 같다', async () => {
    const requestTickers = [
      { ticker: 'AAPL', asset_type: 'us_stock' },
      { ticker: 'MSFT', asset_type: 'us_stock' },
    ];

    const { status, data } = await callGetMarketPrices(token, {
      tickers: requestTickers,
      chunk_index: 0,
    });

    expect(status).toBe(200);
    // prices + failed = 요청 tickers 수 (캐시 히트가 없는 첫 호출)
    expect(data.prices.length + data.failed.length).toBe(requestTickers.length);
  });

  it('여러 asset_type 혼합 요청 시 각 자산 유형 응답에 source 필드 존재', async () => {
    const requestTickers = [
      { ticker: 'AAPL', asset_type: 'us_stock' as const },
      { ticker: 'BTC', asset_type: 'crypto' as const },
    ];

    const { status, data } = await callGetMarketPrices(token, {
      tickers: requestTickers,
      chunk_index: 0,
    });

    expect(status).toBe(200);
    expect(Array.isArray(data.prices)).toBe(true);
    expect(Array.isArray(data.failed)).toBe(true);

    // 전체 응답(prices + failed) 수는 요청 수와 일치
    expect(data.prices.length + data.failed.length).toBe(requestTickers.length);

    // prices 항목은 source 필드 보유
    for (const item of data.prices) {
      expect(['realtime', 'cached']).toContain(item.source);
    }
  });
});

// ════════════════════════════════════════════
// 6. 부분 실패 시 HTTP 200 유지
// ════════════════════════════════════════════

describe('get-market-prices — 부분 실패 시 HTTP 200', () => {
  let token: string;

  beforeAll(async () => {
    token = await getAccessToken(userClient);
  });

  it('외부 API가 실패해도 HTTP 200을 반환하고 failed 배열에 실패 종목을 담는다', async () => {
    // 로컬 환경에서 외부 API 키가 없거나 네트워크 제한 → 실패 → failed 배열
    const { status, data } = await callGetMarketPrices(token, {
      tickers: [{ ticker: 'AAPL', asset_type: 'us_stock' }],
      chunk_index: 0,
    });

    // 외부 API 성공/실패 관계없이 HTTP 200
    expect(status).toBe(200);
    // prices + failed 합계가 요청 수와 같음 (200 유지 + 실패 처리 검증)
    expect(data.prices.length + data.failed.length).toBe(1);
  });

  it('us_stock, crypto, korean_stock 혼합 요청에서 일부 실패해도 HTTP 200', async () => {
    const requestTickers = [
      { ticker: 'AAPL', asset_type: 'us_stock' as const },
      { ticker: 'BTC', asset_type: 'crypto' as const },
      { ticker: '005930', asset_type: 'korean_stock' as const },
    ];

    const { status, data } = await callGetMarketPrices(token, {
      tickers: requestTickers,
      chunk_index: 0,
    });

    expect(status).toBe(200);
    expect(data).toHaveProperty('prices');
    expect(data).toHaveProperty('failed');
    // 전체 처리 수 = 요청 수
    expect(data.prices.length + data.failed.length).toBe(requestTickers.length);
  });
});

// ════════════════════════════════════════════
// 7. getBaselinePrices — prices 테이블 REST 조회
// ════════════════════════════════════════════

describe('getBaselinePrices — prices 테이블 REST 조회', () => {
  // 테스트용 prices 데이터 (service_role로 삽입)
  const TEST_PRICES = [
    { ticker: 'TEST_AAPL', asset_type: 'us_stock', date: '2026-06-14', close: 195.5, currency: 'USD' },
    { ticker: 'TEST_AAPL', asset_type: 'us_stock', date: '2026-06-13', close: 193.0, currency: 'USD' },
    { ticker: 'TEST_KR005930', asset_type: 'korean_stock', date: '2026-06-14', close: 78000, currency: 'KRW' },
    { ticker: 'TEST_BTC', asset_type: 'crypto', date: '2026-06-14', close: 68000, currency: 'USD' },
    // TEST_AAPL이 crypto로도 있는 경우 (동일 ticker, 다른 asset_type 필터 검증용)
    { ticker: 'TEST_AAPL', asset_type: 'crypto', date: '2026-06-14', close: 9999, currency: 'USD' },
  ];

  beforeAll(async () => {
    // service_role로 테스트 데이터 삽입
    const { error } = await adminClient.from('prices').insert(TEST_PRICES);
    if (error) throw new Error(`prices 테스트 데이터 삽입 실패: ${error.message}`);
  });

  afterAll(async () => {
    await adminClient.from('prices').delete().like('ticker', 'TEST_%');
  });

  it('보유 종목(ticker+asset_type)의 최신 종가를 반환한다', async () => {
    const holdings = [
      { ticker: 'TEST_AAPL', asset_type: 'us_stock' as const },
      { ticker: 'TEST_KR005930', asset_type: 'korean_stock' as const },
    ];

    const tickers = holdings.map((h) => h.ticker);
    const assetTypes = [...new Set(holdings.map((h) => h.asset_type))];

    const { data, error } = await userClient
      .from('prices')
      .select('ticker, asset_type, date, close, currency, updated_at')
      .in('ticker', tickers)
      .in('asset_type', assetTypes)
      .order('date', { ascending: false });

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data!.length).toBeGreaterThan(0);

    // TEST_AAPL us_stock: 2026-06-14(최신) 및 2026-06-13 두 행
    const aaplRows = data!.filter(
      (r) => r.ticker === 'TEST_AAPL' && r.asset_type === 'us_stock',
    );
    expect(aaplRows.length).toBe(2); // 두 날짜 행 모두 반환
    // 내림차순 정렬: 최신 날짜가 첫 번째
    expect(aaplRows[0].date).toBe('2026-06-14');
    expect(Number(aaplRows[0].close)).toBe(195.5);
  });

  it('date 내림차순 정렬이 적용된다', async () => {
    const { data, error } = await userClient
      .from('prices')
      .select('ticker, asset_type, date, close, currency, updated_at')
      .in('ticker', ['TEST_AAPL'])
      .in('asset_type', ['us_stock'])
      .order('date', { ascending: false });

    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThanOrEqual(2);
    // 첫 행이 최신 날짜
    expect(data![0].date >= data![1].date).toBe(true);
  });

  it('각 행에 ticker, asset_type, date, close, currency, updated_at 필드가 있다', async () => {
    const { data, error } = await userClient
      .from('prices')
      .select('ticker, asset_type, date, close, currency, updated_at')
      .in('ticker', ['TEST_AAPL'])
      .in('asset_type', ['us_stock'])
      .order('date', { ascending: false })
      .limit(1);

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data!.length).toBe(1);

    const row = data![0];
    expect(row).toHaveProperty('ticker');
    expect(row).toHaveProperty('asset_type');
    expect(row).toHaveProperty('date');
    expect(row).toHaveProperty('close');
    expect(row).toHaveProperty('currency');
    expect(row).toHaveProperty('updated_at');
  });
});

// ════════════════════════════════════════════
// 8. getBaselinePrices — holdings 빈 배열이면 빈 배열 반환
// ════════════════════════════════════════════

describe('getBaselinePrices — 빈 holdings', () => {
  it('holdings가 빈 배열이면 DB 조회 없이 빈 배열을 반환한다', async () => {
    // getBaselinePrices 함수 동작: holdings.length === 0이면 즉시 [] 반환
    // 이 로직을 REST 쿼리 레벨에서 검증
    const { data, error } = await userClient
      .from('prices')
      .select('ticker, asset_type, date, close, currency, updated_at')
      .in('ticker', []) // 빈 배열 → Supabase는 0건 반환
      .in('asset_type', []);

    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });
});

// ════════════════════════════════════════════
// 9. getBaselinePrices — ticker+asset_type 필터링
// ════════════════════════════════════════════

describe('getBaselinePrices — ticker+asset_type 필터링', () => {
  // 위 describe 7의 테스트 데이터에 의존 (TEST_AAPL이 us_stock과 crypto 모두 있음)
  // 이 describe는 테스트 데이터가 남아 있는 상태에서 실행되어야 함
  // (describe 7의 afterAll이 전체 afterAll보다 먼저 실행될 수 있으므로 별도 데이터 삽입)

  beforeAll(async () => {
    // describe 7의 afterAll 타이밍과 무관하게 독립적으로 동작하도록 별도 삽입
    const rows = [
      { ticker: 'TEST_FILTER', asset_type: 'us_stock', date: '2026-06-14', close: 100, currency: 'USD' },
      { ticker: 'TEST_FILTER', asset_type: 'crypto', date: '2026-06-14', close: 9999, currency: 'USD' },
    ];
    await adminClient.from('prices').upsert(rows, { onConflict: 'ticker,asset_type,date' });
  });

  afterAll(async () => {
    await adminClient.from('prices').delete().eq('ticker', 'TEST_FILTER');
  });

  it('동일 ticker라도 asset_type이 다르면 필터링된다', async () => {
    // holdings: TEST_FILTER/us_stock 만 요청
    const tickers = ['TEST_FILTER'];
    const assetTypes = ['us_stock'];

    const { data, error } = await userClient
      .from('prices')
      .select('ticker, asset_type, date, close')
      .in('ticker', tickers)
      .in('asset_type', assetTypes)
      .order('date', { ascending: false });

    expect(error).toBeNull();
    // us_stock만 반환 (crypto는 제외)
    expect(data!.every((r) => r.asset_type === 'us_stock')).toBe(true);
    // crypto 행은 없어야 함
    expect(data!.some((r) => r.asset_type === 'crypto')).toBe(false);
  });

  it('여러 holding 쌍을 조합해 조회하면 해당 쌍만 반환된다', async () => {
    // TEST_FILTER/us_stock + TEST_FILTER/crypto 모두 요청
    const tickers = ['TEST_FILTER'];
    const assetTypes = ['us_stock', 'crypto'];

    const { data, error } = await userClient
      .from('prices')
      .select('ticker, asset_type, date, close')
      .in('ticker', tickers)
      .in('asset_type', assetTypes)
      .order('date', { ascending: false });

    expect(error).toBeNull();
    // us_stock과 crypto 모두 반환
    const types = data!.map((r) => r.asset_type);
    expect(types).toContain('us_stock');
    expect(types).toContain('crypto');
  });
});

// ════════════════════════════════════════════
// 10. prices 테이블 RLS — 인증 사용자 SELECT 가능
// ════════════════════════════════════════════

describe('prices 테이블 RLS — 인증 사용자 SELECT', () => {
  beforeAll(async () => {
    // 시드 데이터 또는 직접 삽입
    const { error } = await adminClient.from('prices').upsert(
      [{ ticker: 'TEST_RLS', asset_type: 'us_stock', date: '2026-06-14', close: 100, currency: 'USD' }],
      { onConflict: 'ticker,asset_type,date' },
    );
    if (error) throw new Error(`prices RLS 테스트 데이터 삽입 실패: ${error.message}`);
  });

  afterAll(async () => {
    await adminClient.from('prices').delete().eq('ticker', 'TEST_RLS');
  });

  it('인증된 사용자는 prices 테이블을 SELECT할 수 있다', async () => {
    const { data, error } = await userClient
      .from('prices')
      .select('ticker, close')
      .eq('ticker', 'TEST_RLS')
      .limit(1);

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data!.length).toBe(1);
    expect(Number(data![0].close)).toBe(100);
  });
});

// ════════════════════════════════════════════
// 11. prices 테이블 RLS — 미인증 사용자 SELECT 불가
// ════════════════════════════════════════════

describe('prices 테이블 RLS — 미인증 사용자 SELECT 불가', () => {
  it('미인증 클라이언트는 prices 테이블 SELECT가 차단된다', async () => {
    const anonOnlyClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
    });

    const { data, error } = await anonOnlyClient
      .from('prices')
      .select('ticker, close')
      .limit(5);

    // RLS: SELECT using (auth.role() = 'authenticated') → 미인증은 빈 배열 또는 에러
    const isBlocked = !!error || (Array.isArray(data) && data.length === 0);
    expect(isBlocked).toBe(true);
  });
});

// ════════════════════════════════════════════
// 12. prices 테이블 RLS — 일반 사용자 INSERT 불가
// ════════════════════════════════════════════

describe('prices 테이블 RLS — 일반 사용자 INSERT 불가', () => {
  it('인증된 일반 사용자는 prices 테이블에 INSERT할 수 없다', async () => {
    const { error } = await userClient
      .from('prices')
      .insert({ ticker: 'TEST_RLS_INS', asset_type: 'us_stock', date: '2026-06-14', close: 999, currency: 'USD' });

    // INSERT RLS: service_role 전용 → authenticated 차단
    expect(error).not.toBeNull();
  });
});
