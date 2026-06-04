/**
 * [009] 섹터 마스터 및 종목 마스터 데이터 레이어 통합 테스트
 *
 * 테스트 범위:
 *   1. sectors 목록 조회 (12개 시드 확인)
 *   2. upsertStockWithSector — 한국 주식 (kr_sector_map 자동 추천)
 *   3. upsertStockWithSector — 암호화폐 (CRYPTO 고정)
 *   4. upsertStockWithSector — 미국 주식 (GICS 코드 직접 전달)
 *   5. upsertStockWithSector — 중복 등록 (upsert, is_new=false)
 *   6. updateStockSector — 섹터 수동 변경
 *   7. getStock — 단건 조회 (sectors join 포함)
 *   8. RLS 검증 (미인증, 쓰기 정책)
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

// service_role 클라이언트 (RLS 우회, 데이터 정리 + 유저 생성용)
let adminClient: SupabaseClient;
// 일반 사용자 클라이언트 (RLS 적용)
let userClient: SupabaseClient;

let testUserId: string;

const TEST_EMAIL = `sector-test-${RUN_ID}@example.com`;
const TEST_PASSWORD = 'TestPassword123!';

// 테스트 중 생성된 stocks id 추적 (afterAll에서 정리)
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
});

afterAll(async () => {
  // 테스트에서 생성된 stocks 행 삭제
  if (createdStockIds.length > 0) {
    await adminClient.from('stocks').delete().in('id', createdStockIds);
  }

  // 테스트 유저 삭제
  if (testUserId) {
    await adminClient.auth.admin.deleteUser(testUserId);
  }

  await userClient.auth.signOut();
});

// ════════════════════════════════════════════
// 1. sectors 목록 조회
// ════════════════════════════════════════════

describe('sectors 목록 조회', () => {
  it('인증된 사용자가 sectors를 조회하면 12개 행이 반환된다', async () => {
    const { data, error } = await userClient
      .from('sectors')
      .select('*')
      .order('id', { ascending: true });

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data!.length).toBe(12);
  });

  it('id 1~12가 모두 존재한다', async () => {
    const { data, error } = await userClient
      .from('sectors')
      .select('id, code, name')
      .order('id', { ascending: true });

    expect(error).toBeNull();
    const ids = data!.map((r: any) => r.id);
    expect(ids).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it('CRYPTO 섹터(id=12)가 존재한다', async () => {
    const { data, error } = await userClient
      .from('sectors')
      .select('*')
      .eq('code', 'CRYPTO')
      .single();

    expect(error).toBeNull();
    expect(data!.id).toBe(12);
    expect(data!.name).toBe('가상자산');
  });

  it('미인증 사용자는 sectors SELECT 불가', async () => {
    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
    });

    const { data, error } = await anonClient.from('sectors').select('*');

    // RLS에 의해 에러 또는 빈 배열 반환
    const isBlocked = !!error || (Array.isArray(data) && data.length === 0);
    expect(isBlocked).toBe(true);
  });

  it('인증된 사용자는 sectors INSERT 불가', async () => {
    const { error } = await userClient
      .from('sectors')
      .insert({ id: 99, code: 'TEST', name: '테스트섹터' });

    expect(error).not.toBeNull();
  });
});

// ════════════════════════════════════════════
// 2. upsert_stock_with_sector RPC
// ════════════════════════════════════════════

describe('upsert_stock_with_sector RPC', () => {
  // 한국 주식 — kr_sector_map 자동 추천
  it('한국 주식 등록 시 kr_sector_map 기반 섹터가 자동 추천된다', async () => {
    const ticker = `KR${RUN_ID}`;

    const { data, error } = await userClient.rpc('upsert_stock_with_sector', {
      p_ticker: ticker,
      p_asset_type: 'korean_stock',
      p_name: '삼성전자',
      p_naver_industry: '반도체',
    });

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data.ticker).toBe(ticker);
    expect(data.asset_type).toBe('korean_stock');
    expect(data.is_new).toBe(true);
    // '반도체' → IT(id=1)
    expect(data.sector_id).toBe(1);
    expect(data.recommended_sector).not.toBeNull();
    expect(data.recommended_sector.code).toBe('IT');

    createdStockIds.push(data.id);
  });

  // 암호화폐 — CRYPTO(id=12) 고정
  it('암호화폐 등록 시 CRYPTO 섹터가 자동 지정된다', async () => {
    const ticker = `BTC${RUN_ID}`;

    const { data, error } = await userClient.rpc('upsert_stock_with_sector', {
      p_ticker: ticker,
      p_asset_type: 'crypto',
      p_name: '비트코인',
      p_naver_industry: null,
    });

    expect(error).toBeNull();
    expect(data.ticker).toBe(ticker);
    expect(data.asset_type).toBe('crypto');
    expect(data.is_new).toBe(true);
    expect(data.sector_id).toBe(12);
    expect(data.recommended_sector).not.toBeNull();
    expect(data.recommended_sector.code).toBe('CRYPTO');

    createdStockIds.push(data.id);
  });

  // 미국 주식 — GICS 코드 직접 전달
  it('미국 주식 등록 시 p_naver_industry에 GICS 코드 전달하면 섹터가 매핑된다', async () => {
    const ticker = `AAPL${RUN_ID}`;

    const { data, error } = await userClient.rpc('upsert_stock_with_sector', {
      p_ticker: ticker,
      p_asset_type: 'us_stock',
      p_name: 'Apple Inc.',
      p_naver_industry: 'IT',
    });

    expect(error).toBeNull();
    expect(data.ticker).toBe(ticker);
    expect(data.asset_type).toBe('us_stock');
    expect(data.is_new).toBe(true);
    // 'IT' → id=1
    expect(data.sector_id).toBe(1);
    expect(data.recommended_sector.code).toBe('IT');

    createdStockIds.push(data.id);
  });

  // 미국 주식 — naver_industry 없이 등록 시 섹터 null
  it('미국 주식 등록 시 p_naver_industry 미전달이면 sector_id가 null이다', async () => {
    const ticker = `MSFT${RUN_ID}`;

    const { data, error } = await userClient.rpc('upsert_stock_with_sector', {
      p_ticker: ticker,
      p_asset_type: 'us_stock',
      p_name: 'Microsoft Corp.',
      p_naver_industry: null,
    });

    expect(error).toBeNull();
    expect(data.sector_id).toBeNull();
    expect(data.recommended_sector).toBeNull();
    expect(data.is_new).toBe(true);

    createdStockIds.push(data.id);
  });

  // 중복 등록 — upsert: is_new=false, 기존 레코드 반환
  it('이미 등록된 종목을 다시 등록하면 is_new=false로 기존 레코드가 반환된다', async () => {
    const ticker = `DUP${RUN_ID}`;

    // 최초 등록
    const { data: first, error: e1 } = await userClient.rpc('upsert_stock_with_sector', {
      p_ticker: ticker,
      p_asset_type: 'us_stock',
      p_name: 'Duplicate Stock',
      p_naver_industry: null,
    });
    expect(e1).toBeNull();
    expect(first.is_new).toBe(true);
    createdStockIds.push(first.id);

    // 중복 등록
    const { data: second, error: e2 } = await userClient.rpc('upsert_stock_with_sector', {
      p_ticker: ticker,
      p_asset_type: 'us_stock',
      p_name: 'Duplicate Stock Again',
      p_naver_industry: null,
    });
    expect(e2).toBeNull();
    expect(second.is_new).toBe(false);
    // 같은 id 반환
    expect(second.id).toBe(first.id);
  });

  // 미인증 사용자 차단
  it('미인증 사용자는 upsert_stock_with_sector RPC 호출 불가', async () => {
    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
    });

    const { error } = await anonClient.rpc('upsert_stock_with_sector', {
      p_ticker: `ANON${RUN_ID}`,
      p_asset_type: 'us_stock',
      p_name: 'Anon Stock',
      p_naver_industry: null,
    });

    expect(error).not.toBeNull();
  });

  // 잘못된 asset_type
  it('잘못된 asset_type 전달 시 에러 반환', async () => {
    const { error } = await userClient.rpc('upsert_stock_with_sector', {
      p_ticker: `INVALID${RUN_ID}`,
      p_asset_type: 'wrong_type',
      p_name: 'Invalid Type Stock',
      p_naver_industry: null,
    });

    expect(error).not.toBeNull();
  });
});

// ════════════════════════════════════════════
// 3. updateStockSector (섹터 수동 변경)
// ════════════════════════════════════════════

describe('updateStockSector (섹터 수동 변경)', () => {
  let stockId: string;

  beforeAll(async () => {
    // 섹터 없이 종목 하나 등록
    const { data, error } = await userClient.rpc('upsert_stock_with_sector', {
      p_ticker: `UPD_SECTOR${RUN_ID}`,
      p_asset_type: 'us_stock',
      p_name: 'Sector Update Test',
      p_naver_industry: null,
    });
    expect(error).toBeNull();
    stockId = data.id;
    createdStockIds.push(stockId);
  });

  it('sector_id를 유효한 섹터로 변경하면 업데이트된 레코드가 반환된다', async () => {
    const { data, error } = await userClient
      .from('stocks')
      .update({ sector_id: 3 })  // FINANCIALS
      .eq('id', stockId)
      .select('*, sectors(id, code, name)')
      .single();

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data!.sector_id).toBe(3);
    expect((data as any).sectors).not.toBeNull();
    expect((data as any).sectors.code).toBe('FINANCIALS');
  });

  it('sector_id를 null로 변경하면 미분류 처리된다', async () => {
    const { data, error } = await userClient
      .from('stocks')
      .update({ sector_id: null })
      .eq('id', stockId)
      .select('*, sectors(id, code, name)')
      .single();

    expect(error).toBeNull();
    expect(data!.sector_id).toBeNull();
    expect((data as any).sectors).toBeNull();
  });
});

// ════════════════════════════════════════════
// 4. getStock (단건 조회)
// ════════════════════════════════════════════

describe('getStock (단건 조회)', () => {
  const ticker = `GETSTOCK${RUN_ID}`;
  let stockId: string;

  beforeAll(async () => {
    // 조회 대상 종목 생성 (IT 섹터)
    const { data, error } = await userClient.rpc('upsert_stock_with_sector', {
      p_ticker: ticker,
      p_asset_type: 'us_stock',
      p_name: 'GetStock Test',
      p_naver_industry: 'IT',
    });
    expect(error).toBeNull();
    stockId = data.id;
    createdStockIds.push(stockId);
  });

  it('ticker + asset_type으로 종목을 조회하면 sectors join 포함 레코드가 반환된다', async () => {
    const { data, error } = await userClient
      .from('stocks')
      .select('*, sectors(id, code, name)')
      .eq('ticker', ticker)
      .eq('asset_type', 'us_stock')
      .maybeSingle();

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data!.ticker).toBe(ticker);
    expect(data!.asset_type).toBe('us_stock');
    expect((data as any).sectors).not.toBeNull();
    expect((data as any).sectors.code).toBe('IT');
  });

  it('존재하지 않는 종목 조회 시 null 반환', async () => {
    const { data, error } = await userClient
      .from('stocks')
      .select('*, sectors(id, code, name)')
      .eq('ticker', 'NONEXISTENT_TICKER_XYZ')
      .eq('asset_type', 'us_stock')
      .maybeSingle();

    expect(error).toBeNull();
    expect(data).toBeNull();
  });
});

// ════════════════════════════════════════════
// 5. kr_sector_map 시드 확인
// ════════════════════════════════════════════

describe('kr_sector_map 시드 확인', () => {
  it('인증된 사용자는 kr_sector_map SELECT 가능', async () => {
    const { data, error } = await userClient
      .from('kr_sector_map')
      .select('*');

    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
    // 39개 이상의 시드 행이 있어야 함
    expect(data!.length).toBeGreaterThanOrEqual(39);
  });

  it('반도체 → IT(id=1) 매핑이 존재한다', async () => {
    const { data, error } = await userClient
      .from('kr_sector_map')
      .select('*')
      .eq('naver_industry', '반도체')
      .single();

    expect(error).toBeNull();
    expect(data!.sector_id).toBe(1);
  });

  it('인증된 사용자는 kr_sector_map INSERT 불가', async () => {
    const { error } = await userClient
      .from('kr_sector_map')
      .insert({ naver_industry: '테스트업종', sector_id: 1 });

    expect(error).not.toBeNull();
  });
});

// ════════════════════════════════════════════
// 6. stocks RLS 검증
// ════════════════════════════════════════════

describe('stocks RLS 검증', () => {
  it('미인증 사용자는 stocks SELECT 불가', async () => {
    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
    });

    const { data, error } = await anonClient.from('stocks').select('*');

    const isBlocked = !!error || (Array.isArray(data) && data.length === 0);
    expect(isBlocked).toBe(true);
  });

  it('인증된 사용자는 stocks에 직접 INSERT 가능', async () => {
    const ticker = `DIRECT_INSERT${RUN_ID}`;

    const { data, error } = await userClient
      .from('stocks')
      .insert({
        ticker,
        asset_type: 'us_stock',
        name: 'Direct Insert Test',
        sector_id: null,
      })
      .select()
      .single();

    expect(error).toBeNull();
    expect(data!.ticker).toBe(ticker);

    createdStockIds.push(data!.id);
  });

  it('service_role은 stocks DELETE 가능', async () => {
    // 삭제 대상 종목 생성
    const ticker = `DELETE_TEST${RUN_ID}`;
    const { data: inserted, error: insertErr } = await userClient
      .from('stocks')
      .insert({
        ticker,
        asset_type: 'us_stock',
        name: 'Delete Test',
        sector_id: null,
      })
      .select()
      .single();

    expect(insertErr).toBeNull();
    const id = inserted!.id;

    // service_role로 삭제
    const { error: deleteErr } = await adminClient
      .from('stocks')
      .delete()
      .eq('id', id);

    expect(deleteErr).toBeNull();

    // 삭제 확인
    const { data: afterDelete } = await userClient
      .from('stocks')
      .select()
      .eq('id', id);

    expect(afterDelete).toHaveLength(0);
    // createdStockIds에 추가하지 않음 (이미 삭제됨)
  });
});
