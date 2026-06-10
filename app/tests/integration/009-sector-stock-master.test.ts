/**
 * [009] 섹터 마스터 및 종목 마스터 데이터 레이어 통합 테스트
 *
 * 테스트 범위:
 *   1. sectors 목록 조회 (L1 12개 시드 확인 — [016] GICS 4단계 확장 반영)
 *   2. updateStockSector — 섹터 수동 변경
 *   3. getStock — 단건 조회 (sectors join 포함)
 *   4. RLS 검증 (미인증, 쓰기 정책)
 *
 * [016] 변경 반영:
 *   - upsert_stock_with_sector / kr_sector_map은 폐기됨 (yfinance 기반
 *     get_or_recommend_stock_sector로 대체 — 016-sector-gics.test.ts가 커버)
 *   - stocks.asset_type → market ([012])
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
  it('인증된 사용자가 L1 sectors를 조회하면 12개 행이 반환된다', async () => {
    const { data, error } = await userClient
      .from('sectors')
      .select('*')
      .eq('level', 1)
      .order('id', { ascending: true });

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data!.length).toBe(12);
  });

  it('L1 id 1~12가 모두 존재한다 ([016] GICS 확장 후에도 L1 시드 유지)', async () => {
    const { data, error } = await userClient
      .from('sectors')
      .select('id, code, name')
      .eq('level', 1)
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
// 2. updateStockSector (섹터 수동 변경)
// ════════════════════════════════════════════
// [016] upsert_stock_with_sector / kr_sector_map RPC 테스트는 폐기 —
//       yfinance 기반 get_or_recommend_stock_sector는 016-sector-gics.test.ts가 커버

describe('stocks 섹터 변경 (RLS)', () => {
  // [012] 일반 사용자의 stocks 직접 쓰기 정책은 제거됨 —
  //       앱의 섹터 수동 변경(updateStockSector)은 FastAPI(service key) 경유
  let stockId: string;

  beforeAll(async () => {
    // 섹터 없이 종목 하나 등록 (service_role)
    const { data, error } = await adminClient
      .from('stocks')
      .insert({
        ticker: `UPD_SECTOR${RUN_ID}`,
        market: 'US',
        currency: 'USD',
        name: 'Sector Update Test',
        sector_id: null,
      })
      .select('id')
      .single();
    expect(error).toBeNull();
    stockId = data!.id;
    createdStockIds.push(stockId);
  });

  it('일반 사용자의 stocks 직접 UPDATE는 RLS로 차단된다 ([012])', async () => {
    const { data } = await userClient
      .from('stocks')
      .update({ sector_id: 3 })
      .eq('id', stockId)
      .select();

    // 쓰기 정책이 없으므로 영향받은 행이 없어야 함
    expect(data ?? []).toHaveLength(0);

    const { data: after } = await adminClient
      .from('stocks')
      .select('sector_id')
      .eq('id', stockId)
      .single();
    expect(after!.sector_id).toBeNull();
  });

  it('service_role은 sector_id를 변경/해제할 수 있다', async () => {
    const { data, error } = await adminClient
      .from('stocks')
      .update({ sector_id: 3 })  // FINANCIALS
      .eq('id', stockId)
      .select('*, sectors(id, code, name)')
      .single();

    expect(error).toBeNull();
    expect(data!.sector_id).toBe(3);
    expect((data as any).sectors.code).toBe('FINANCIALS');

    const { data: cleared, error: clearErr } = await adminClient
      .from('stocks')
      .update({ sector_id: null })
      .eq('id', stockId)
      .select('*, sectors(id, code, name)')
      .single();

    expect(clearErr).toBeNull();
    expect(cleared!.sector_id).toBeNull();
    expect((cleared as any).sectors).toBeNull();
  });
});

// ════════════════════════════════════════════
// 4. getStock (단건 조회)
// ════════════════════════════════════════════

describe('getStock (단건 조회)', () => {
  const ticker = `GETSTOCK${RUN_ID}`;
  let stockId: string;

  beforeAll(async () => {
    // 조회 대상 종목 생성 (IT 섹터, id=1) — [012] 사용자 직접 INSERT 불가, service_role 사용
    const { data, error } = await adminClient
      .from('stocks')
      .insert({
        ticker,
        market: 'US',
        currency: 'USD',
        name: 'GetStock Test',
        sector_id: 1,
      })
      .select('id')
      .single();
    expect(error).toBeNull();
    stockId = data!.id;
    createdStockIds.push(stockId);
  });

  it('ticker + market으로 종목을 조회하면 sectors join 포함 레코드가 반환된다', async () => {
    const { data, error } = await userClient
      .from('stocks')
      .select('*, sectors(id, code, name)')
      .eq('ticker', ticker)
      .eq('market', 'US')
      .maybeSingle();

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data!.ticker).toBe(ticker);
    expect(data!.market).toBe('US');
    expect((data as any).sectors).not.toBeNull();
    expect((data as any).sectors.code).toBe('IT');
  });

  it('존재하지 않는 종목 조회 시 null 반환', async () => {
    const { data, error } = await userClient
      .from('stocks')
      .select('*, sectors(id, code, name)')
      .eq('ticker', 'NONEXISTENT_TICKER_XYZ')
      .eq('market', 'US')
      .maybeSingle();

    expect(error).toBeNull();
    expect(data).toBeNull();
  });
});

// ════════════════════════════════════════════
// 4. stocks RLS 검증
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

  it('인증된 사용자의 stocks 직접 INSERT는 RLS로 차단된다 ([012] 등록은 RPC 경유)', async () => {
    const ticker = `DIRECT_INSERT${RUN_ID}`;

    const { error } = await userClient
      .from('stocks')
      .insert({
        ticker,
        market: 'US',
        currency: 'USD',
        name: 'Direct Insert Test',
        sector_id: null,
      })
      .select()
      .single();

    expect(error).not.toBeNull();
    expect(error!.code).toBe('42501'); // RLS violation
  });

  it('service_role은 stocks DELETE 가능', async () => {
    // 삭제 대상 종목 생성
    const ticker = `DELETE_TEST${RUN_ID}`;
    const { data: inserted, error: insertErr } = await adminClient
      .from('stocks')
      .insert({
        ticker,
        market: 'US',
        currency: 'USD',
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
