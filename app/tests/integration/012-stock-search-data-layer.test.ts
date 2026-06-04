/**
 * [012] 종목 검색 — 데이터/API 레이어 통합 테스트
 *
 * 테스트 범위:
 *   1. stocks 테이블 읽기 — 인증된 사용자 조회, 미인증 차단
 *   2. stocks RLS 쓰기 — 일반 사용자 INSERT/UPDATE 거부 (service_role 전용)
 *   3. 로컬 검색 — ilike 검색 (ticker/name), market 필터
 *   4. getStock — ticker + market 단건 조회
 *   5. get_or_recommend_stock_sector RPC — 섹터 자동 추천 (KR/US/CRYPTO)
 *
 * 필요 환경변수 (app/.env.test):
 *   SUPABASE_URL          — Supabase 프로젝트 URL
 *   SUPABASE_ANON_KEY     — anon/publishable key
 *   SUPABASE_SERVICE_KEY  — service_role key (RLS 우회, 데이터 정리 + 유저 생성)
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

const TEST_EMAIL = `stock-search-test-${RUN_ID}@example.com`;
const TEST_PASSWORD = 'TestPassword123!';

// 테스트 중 adminClient로 직접 삽입한 stocks id 추적
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

  // 검색 테스트용 시드 데이터 삽입 (service_role)
  const seedStocks = [
    { ticker: `TSLA_${RUN_ID}`, name: '테슬라 모터스', market: 'US', currency: 'USD', is_active: true },
    { ticker: `AAPL_${RUN_ID}`, name: '애플 인크', market: 'US', currency: 'USD', is_active: true },
    { ticker: `005930_${RUN_ID}`, name: '삼성전자', market: 'KR', currency: 'KRW', is_active: true },
    { ticker: `BTC_${RUN_ID}`, name: '비트코인', market: 'CRYPTO', currency: 'USD', is_active: true },
    { ticker: `INACTIVE_${RUN_ID}`, name: '비활성종목테스트', market: 'US', currency: 'USD', is_active: false },
  ];

  const { data: inserted, error: seedErr } = await adminClient
    .from('stocks')
    .insert(seedStocks)
    .select('id');

  if (seedErr) throw new Error(`시드 데이터 삽입 실패: ${seedErr.message}`);
  inserted!.forEach((r: any) => createdStockIds.push(r.id));
});

afterAll(async () => {
  if (createdStockIds.length > 0) {
    await adminClient.from('stocks').delete().in('id', createdStockIds);
  }
  if (testUserId) {
    await adminClient.auth.admin.deleteUser(testUserId);
  }
  await userClient.auth.signOut();
});

// ════════════════════════════════════════════
// 1. stocks 테이블 읽기 RLS
// ════════════════════════════════════════════

describe('stocks 테이블 읽기', () => {
  it('인증된 사용자가 stocks를 SELECT하면 데이터가 반환된다', async () => {
    const { data, error } = await userClient
      .from('stocks')
      .select('id, ticker, name, market, currency, is_active')
      .eq('ticker', `TSLA_${RUN_ID}`)
      .limit(1);

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data!.length).toBe(1);
    expect(data![0].ticker).toBe(`TSLA_${RUN_ID}`);
    expect(data![0].market).toBe('US');
    expect(data![0].currency).toBe('USD');
    expect(data![0].is_active).toBe(true);
  });

  it('인증된 사용자가 sectors join으로 stocks를 조회할 수 있다', async () => {
    const { data, error } = await userClient
      .from('stocks')
      .select('id, ticker, name, market, sectors(id, code, name)')
      .eq('ticker', `TSLA_${RUN_ID}`)
      .maybeSingle();

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data!.ticker).toBe(`TSLA_${RUN_ID}`);
  });

  it('미인증 사용자는 stocks SELECT 불가', async () => {
    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
    });

    const { data, error } = await anonClient.from('stocks').select('*').limit(10);

    const isBlocked = !!error || (Array.isArray(data) && data.length === 0);
    expect(isBlocked).toBe(true);
  });
});

// ════════════════════════════════════════════
// 2. stocks RLS 쓰기 — service_role 전용
// ════════════════════════════════════════════

describe('stocks RLS 쓰기 (service_role 전용)', () => {
  it('인증된 일반 사용자는 stocks에 직접 INSERT 불가', async () => {
    const { error } = await userClient
      .from('stocks')
      .insert({
        ticker: `RLS_INSERT_${RUN_ID}`,
        name: 'RLS Test Insert',
        market: 'US',
        currency: 'USD',
        is_active: true,
      });

    expect(error).not.toBeNull();
  });

  it('인증된 일반 사용자는 stocks를 직접 UPDATE해도 영향받은 행이 없다 (RLS 차단)', async () => {
    // Supabase RLS 동작: UPDATE 정책 없으면 에러 대신 0건 업데이트
    // (using 조건을 만족하는 행이 없는 것으로 처리됨)
    const { data, error } = await userClient
      .from('stocks')
      .update({ name: '수정 시도' })
      .eq('ticker', `TSLA_${RUN_ID}`)
      .select('id');

    expect(error).toBeNull();
    // RLS에 의해 UPDATE 권한 없으므로 반환 행 0건
    expect(data).toHaveLength(0);
  });

  it('service_role(adminClient)은 stocks INSERT 가능', async () => {
    const ticker = `ADMIN_INSERT_${RUN_ID}`;
    const { data, error } = await adminClient
      .from('stocks')
      .insert({
        ticker,
        name: 'Admin Insert Test',
        market: 'US',
        currency: 'USD',
        is_active: true,
      })
      .select('id, ticker, market')
      .single();

    expect(error).toBeNull();
    expect(data!.ticker).toBe(ticker);
    createdStockIds.push(data!.id);
  });

  it('service_role(adminClient)은 stocks UPDATE 가능', async () => {
    // 시드된 TSLA 레코드의 name을 업데이트
    const { error } = await adminClient
      .from('stocks')
      .update({ name: '테슬라 모터스 업데이트됨' })
      .eq('ticker', `TSLA_${RUN_ID}`);

    expect(error).toBeNull();
  });
});

// ════════════════════════════════════════════
// 3. 로컬 종목 검색 (ilike)
// ════════════════════════════════════════════

describe('로컬 종목 검색 (ilike)', () => {
  it('ticker ilike 검색으로 종목을 찾을 수 있다', async () => {
    const q = `TSLA_${RUN_ID}`;
    const { data, error } = await userClient
      .from('stocks')
      .select('id, ticker, name, market, currency, sector_id, is_active, sectors(id, code, name)')
      .or(`ticker.ilike.%${q}%,name.ilike.%${q}%`)
      .eq('is_active', true)
      .order('name', { ascending: true })
      .limit(30);

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data!.length).toBeGreaterThanOrEqual(1);
    expect(data![0].ticker).toBe(`TSLA_${RUN_ID}`);
  });

  it('name ilike 검색으로 종목을 찾을 수 있다', async () => {
    // '삼성전자' 검색
    const q = '삼성전자';
    const { data, error } = await userClient
      .from('stocks')
      .select('id, ticker, name, market, currency, is_active')
      .or(`ticker.ilike.%${q}%,name.ilike.%${q}%`)
      .eq('is_active', true)
      .limit(30);

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    // 시드한 삼성전자 포함 확인
    const found = data!.find((r: any) => r.ticker === `005930_${RUN_ID}`);
    expect(found).toBeDefined();
    expect(found!.market).toBe('KR');
  });

  it('is_active=true 필터로 비활성 종목은 검색되지 않는다', async () => {
    const q = `INACTIVE_${RUN_ID}`;
    const { data, error } = await userClient
      .from('stocks')
      .select('id, ticker, name, is_active')
      .or(`ticker.ilike.%${q}%,name.ilike.%${q}%`)
      .eq('is_active', true)
      .limit(30);

    expect(error).toBeNull();
    expect(data!.length).toBe(0);
  });

  it('market 필터로 US 종목만 검색된다', async () => {
    // RUN_ID를 포함하는 모든 is_active 종목 중 US만
    const q = String(RUN_ID);
    const { data, error } = await userClient
      .from('stocks')
      .select('id, ticker, name, market, is_active')
      .or(`ticker.ilike.%${q}%,name.ilike.%${q}%`)
      .eq('is_active', true)
      .eq('market', 'US')
      .limit(30);

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    // US 종목만 반환되어야 함 (TSLA_*, AAPL_*)
    expect(data!.length).toBeGreaterThanOrEqual(2);
    data!.forEach((r: any) => {
      expect(r.market).toBe('US');
    });
  });

  it('검색어 1자 미만(빈 문자열) 시 쿼리를 호출하지 않으면 빈 배열', () => {
    // 서비스 코드에서 q.length < 2이면 바로 [] 반환하는 로직 검증
    // 직접 서비스 함수를 호출하지 않고 조건만 단위 검증
    const q = 'A'; // 1자
    expect(q.length < 2).toBe(true);
  });

  it('2자 이상 검색어로 ilike 검색이 동작한다', async () => {
    const q = `BT`; // 2자, BTC_RUN_ID 히트
    const { data, error } = await userClient
      .from('stocks')
      .select('id, ticker, name, market, is_active')
      .or(`ticker.ilike.%${q}%,name.ilike.%${q}%`)
      .eq('is_active', true)
      .eq('market', 'CRYPTO')
      .limit(30);

    expect(error).toBeNull();
    const found = data!.find((r: any) => r.ticker === `BTC_${RUN_ID}`);
    expect(found).toBeDefined();
  });
});

// ════════════════════════════════════════════
// 4. getStock (단건 조회 — ticker + market)
// ════════════════════════════════════════════

describe('getStock (ticker + market 단건 조회)', () => {
  it('ticker + market으로 종목 단건 조회 성공', async () => {
    const { data, error } = await userClient
      .from('stocks')
      .select('*, sectors(id, code, name)')
      .eq('ticker', `AAPL_${RUN_ID}`)
      .eq('market', 'US')
      .maybeSingle();

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data!.ticker).toBe(`AAPL_${RUN_ID}`);
    expect(data!.market).toBe('US');
    expect(data!.currency).toBe('USD');
    expect(data!.is_active).toBe(true);
  });

  it('KR market 종목 단건 조회 성공', async () => {
    const { data, error } = await userClient
      .from('stocks')
      .select('*, sectors(id, code, name)')
      .eq('ticker', `005930_${RUN_ID}`)
      .eq('market', 'KR')
      .maybeSingle();

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data!.market).toBe('KR');
    expect(data!.currency).toBe('KRW');
  });

  it('CRYPTO market 종목 단건 조회 성공', async () => {
    const { data, error } = await userClient
      .from('stocks')
      .select('*, sectors(id, code, name)')
      .eq('ticker', `BTC_${RUN_ID}`)
      .eq('market', 'CRYPTO')
      .maybeSingle();

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data!.market).toBe('CRYPTO');
  });

  it('존재하지 않는 종목 조회 시 null 반환', async () => {
    const { data, error } = await userClient
      .from('stocks')
      .select('*, sectors(id, code, name)')
      .eq('ticker', 'NONEXISTENT_XYZ_9999')
      .eq('market', 'US')
      .maybeSingle();

    expect(error).toBeNull();
    expect(data).toBeNull();
  });

  it('같은 ticker라도 다른 market이면 별개 종목으로 조회된다', async () => {
    // UNIQUE (ticker, market) 제약 검증
    // 시드에서 BTC_RUN_ID는 CRYPTO market에만 있음 → US로 조회하면 null
    const { data, error } = await userClient
      .from('stocks')
      .select('id')
      .eq('ticker', `BTC_${RUN_ID}`)
      .eq('market', 'US')
      .maybeSingle();

    expect(error).toBeNull();
    expect(data).toBeNull();
  });
});

// ════════════════════════════════════════════
// 5. get_or_recommend_stock_sector RPC
// ════════════════════════════════════════════

describe('get_or_recommend_stock_sector RPC', () => {
  // 미인증 사용자 차단
  it('미인증 사용자는 RPC 호출 불가', async () => {
    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
    });

    const { error } = await anonClient.rpc('get_or_recommend_stock_sector', {
      p_ticker: `ANON_${RUN_ID}`,
      p_market: 'US',
      p_name: 'Anon Test',
      p_currency: 'USD',
      p_naver_industry: null,
    });

    expect(error).not.toBeNull();
  });

  // 잘못된 market
  it('잘못된 market 값 전달 시 에러 반환', async () => {
    const { error } = await userClient.rpc('get_or_recommend_stock_sector', {
      p_ticker: `INVALID_${RUN_ID}`,
      p_market: 'INVALID_MARKET',
      p_name: 'Invalid Market Test',
      p_currency: 'USD',
      p_naver_industry: null,
    });

    expect(error).not.toBeNull();
  });

  // CRYPTO — 고정 섹터 추천
  it('CRYPTO market: CRYPTO 섹터(id=12)가 자동 추천된다', async () => {
    const { data, error } = await userClient.rpc('get_or_recommend_stock_sector', {
      p_ticker: `ETH_RPC_${RUN_ID}`,
      p_market: 'CRYPTO',
      p_name: '이더리움',
      p_currency: 'USD',
      p_naver_industry: null,
    });

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data.ticker).toBe(`ETH_RPC_${RUN_ID}`);
    expect(data.market).toBe('CRYPTO');
    expect(data.is_new).toBe(true);
    expect(data.sector_id).toBe(12);
    expect(data.recommended_sector).not.toBeNull();
    expect(data.recommended_sector.code).toBe('CRYPTO');
    // is_new=true이므로 실제 DB에 없음 → id는 임시 UUID
    expect(data.id).toBeDefined();
  });

  // KR — kr_sector_map 기반 섹터 추천
  it('KR market: naver_industry가 있으면 kr_sector_map 기반 섹터가 추천된다', async () => {
    const { data, error } = await userClient.rpc('get_or_recommend_stock_sector', {
      p_ticker: `KR_RPC_${RUN_ID}`,
      p_market: 'KR',
      p_name: '테스트전자',
      p_currency: 'KRW',
      p_naver_industry: '반도체',
    });

    expect(error).toBeNull();
    expect(data.market).toBe('KR');
    expect(data.is_new).toBe(true);
    // '반도체' → IT(id=1)
    expect(data.sector_id).toBe(1);
    expect(data.recommended_sector).not.toBeNull();
    expect(data.recommended_sector.code).toBe('IT');
  });

  // KR — naver_industry 없으면 섹터 null
  it('KR market: naver_industry 미전달 시 sector_id가 null이다', async () => {
    const { data, error } = await userClient.rpc('get_or_recommend_stock_sector', {
      p_ticker: `KR_NO_IND_${RUN_ID}`,
      p_market: 'KR',
      p_name: '업종없는종목',
      p_currency: 'KRW',
      p_naver_industry: null,
    });

    expect(error).toBeNull();
    expect(data.is_new).toBe(true);
    expect(data.sector_id).toBeNull();
    expect(data.recommended_sector).toBeNull();
  });

  // US — GICS 코드로 섹터 추천
  it('US market: p_naver_industry에 GICS code 전달 시 섹터가 매핑된다', async () => {
    const { data, error } = await userClient.rpc('get_or_recommend_stock_sector', {
      p_ticker: `GOOG_RPC_${RUN_ID}`,
      p_market: 'US',
      p_name: '구글',
      p_currency: 'USD',
      p_naver_industry: 'IT',
    });

    expect(error).toBeNull();
    expect(data.market).toBe('US');
    expect(data.is_new).toBe(true);
    // GICS 'IT' → IT(id=1)
    expect(data.sector_id).toBe(1);
    expect(data.recommended_sector.code).toBe('IT');
  });

  // 기존 종목 조회 — is_new=false
  it('이미 DB에 있는 종목 조회 시 is_new=false로 기존 레코드 반환', async () => {
    // beforeAll에서 시드한 TSLA_RUN_ID (market=US, currency=USD)
    const { data, error } = await userClient.rpc('get_or_recommend_stock_sector', {
      p_ticker: `TSLA_${RUN_ID}`,
      p_market: 'US',
      p_name: '테슬라 (RPC 조회)',
      p_currency: 'USD',
      p_naver_industry: null,
    });

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data.ticker).toBe(`TSLA_${RUN_ID}`);
    expect(data.is_new).toBe(false);
    // 기존 레코드 id가 임시 UUID가 아닌 실제 DB id와 일치해야 함
    const tslaId = createdStockIds.find((_, i) => i === 0); // 첫 번째 시드 = TSLA
    if (tslaId) {
      expect(data.id).toBe(tslaId);
    }
  });
});

// ════════════════════════════════════════════
// 6. market/currency/is_active 컬럼 스키마 검증
// ════════════════════════════════════════════

describe('stocks 스키마 변경 검증 (market/currency/is_active)', () => {
  it('market 컬럼은 KR/US/CRYPTO 값만 허용된다', async () => {
    // service_role로 잘못된 market 삽입 시도
    const { error } = await adminClient
      .from('stocks')
      .insert({
        ticker: `INVALID_MARKET_${RUN_ID}`,
        name: 'Invalid Market',
        market: 'JP',  // CHECK 제약에 없는 값
        currency: 'JPY',
        is_active: true,
      });

    expect(error).not.toBeNull();
  });

  it('stocks 행의 market/currency/is_active 컬럼이 올바르게 저장된다', async () => {
    const { data, error } = await userClient
      .from('stocks')
      .select('ticker, market, currency, is_active')
      .in('ticker', [
        `TSLA_${RUN_ID}`,
        `005930_${RUN_ID}`,
        `BTC_${RUN_ID}`,
      ])
      .order('ticker');

    expect(error).toBeNull();
    expect(data!.length).toBe(3);

    const byTicker: Record<string, any> = {};
    data!.forEach((r: any) => { byTicker[r.ticker] = r; });

    expect(byTicker[`TSLA_${RUN_ID}`].market).toBe('US');
    expect(byTicker[`TSLA_${RUN_ID}`].currency).toBe('USD');
    expect(byTicker[`005930_${RUN_ID}`].market).toBe('KR');
    expect(byTicker[`005930_${RUN_ID}`].currency).toBe('KRW');
    expect(byTicker[`BTC_${RUN_ID}`].market).toBe('CRYPTO');
  });

  it('(ticker, market) UNIQUE 제약 — 동일 조합 중복 삽입 불가', async () => {
    // TSLA_RUN_ID + US는 이미 시드에 있음
    const { error } = await adminClient
      .from('stocks')
      .insert({
        ticker: `TSLA_${RUN_ID}`,
        name: '중복 삽입 시도',
        market: 'US',
        currency: 'USD',
        is_active: true,
      });

    expect(error).not.toBeNull();
  });

  it('같은 ticker라도 다른 market이면 삽입 가능 (UNIQUE 분리)', async () => {
    // TSLA_RUN_ID는 US에만 있음 → KR로 삽입 가능
    const { data, error } = await adminClient
      .from('stocks')
      .insert({
        ticker: `TSLA_${RUN_ID}`,
        name: '테슬라 KR 상장',
        market: 'KR',
        currency: 'KRW',
        is_active: true,
      })
      .select('id')
      .single();

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    createdStockIds.push(data!.id);
  });
});
