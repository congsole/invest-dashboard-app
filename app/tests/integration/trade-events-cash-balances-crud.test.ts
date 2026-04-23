/**
 * 이슈 003 — trade_events & cash_balances CRUD 통합 테스트
 *
 * 필요 환경변수 (app/.env.test):
 *   SUPABASE_URL         — Supabase 프로젝트 URL
 *   SUPABASE_ANON_KEY    — anon/publishable key
 *   SUPABASE_SERVICE_KEY — service_role key (RLS 우회, 테스트 유저 생성/삭제)
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

let userClient: SupabaseClient;
let adminClient: SupabaseClient;
let testUserId: string;

// 유저 A/B RLS 격리 테스트용
let userClientB: SupabaseClient;
let testUserIdB: string;

// ──────────────────────────────────────────────────────────────────────────────
// 테스트 유저 생성/정리
// ──────────────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_KEY) {
    throw new Error('SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_KEY 환경변수가 필요합니다.');
  }

  adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });

  userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });

  userClientB = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });

  // 유저 A 생성 및 로그인
  const emailA = `crud-test-a-${RUN_ID}@example.com`;
  const { data: userAData, error: userAErr } = await adminClient.auth.admin.createUser({
    email: emailA,
    password: 'TestPassword123!',
    email_confirm: true,
  });
  if (userAErr) throw new Error(`유저 A 생성 실패: ${userAErr.message}`);
  testUserId = userAData.user.id;

  const { error: signInA } = await userClient.auth.signInWithPassword({
    email: emailA,
    password: 'TestPassword123!',
  });
  if (signInA) throw new Error(`유저 A 로그인 실패: ${signInA.message}`);

  // 유저 B 생성 및 로그인 (RLS 격리 검증용)
  const emailB = `crud-test-b-${RUN_ID}@example.com`;
  const { data: userBData, error: userBErr } = await adminClient.auth.admin.createUser({
    email: emailB,
    password: 'TestPassword123!',
    email_confirm: true,
  });
  if (userBErr) throw new Error(`유저 B 생성 실패: ${userBErr.message}`);
  testUserIdB = userBData.user.id;

  const { error: signInB } = await userClientB.auth.signInWithPassword({
    email: emailB,
    password: 'TestPassword123!',
  });
  if (signInB) throw new Error(`유저 B 로그인 실패: ${signInB.message}`);
});

afterAll(async () => {
  await userClient?.auth.signOut();
  await userClientB?.auth.signOut();

  // 테스트 데이터 잔여분 정리 (멱등)
  if (adminClient && testUserId) {
    await adminClient.from('trade_events').delete().eq('user_id', testUserId);
    await adminClient.from('cash_balances').delete().eq('user_id', testUserId);
    await adminClient.auth.admin.deleteUser(testUserId);
  }
  if (adminClient && testUserIdB) {
    await adminClient.from('trade_events').delete().eq('user_id', testUserIdB);
    await adminClient.from('cash_balances').delete().eq('user_id', testUserIdB);
    await adminClient.auth.admin.deleteUser(testUserIdB);
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// 헬퍼
// ──────────────────────────────────────────────────────────────────────────────

function tradeEventDefaults(overrides: Record<string, unknown> = {}) {
  return {
    asset_type: 'us_stock',
    trade_type: 'buy',
    ticker: `TEST${RUN_ID}`,
    name: 'Test Stock',
    trade_date: '2026-01-10',
    quantity: 10,
    price_per_unit: 200,
    currency: 'USD',
    fee: 1000,
    fee_currency: 'KRW',
    tax: 0,
    settlement_amount: -2001000,
    ...overrides,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// trade_events CRUD
// ──────────────────────────────────────────────────────────────────────────────

describe('trade_events CRUD', () => {
  const insertedIds: string[] = [];

  afterEach(async () => {
    // 각 테스트에서 생성한 데이터를 admin으로 정리
    for (const id of insertedIds) {
      await adminClient.from('trade_events').delete().eq('id', id);
    }
    insertedIds.length = 0;
  });

  // ── CREATE ──────────────────────────────────────────────────────────────────

  describe('CREATE — createTradeEvent', () => {
    it('필수 필드 모두 제공 시 레코드 생성 성공 및 id 반환', async () => {
      const { data, error } = await userClient
        .from('trade_events')
        .insert(tradeEventDefaults())
        .select()
        .single();

      expect(error).toBeNull();
      expect(data).not.toBeNull();
      expect(data!.id).toBeDefined();
      expect(data!.ticker).toBe(`TEST${RUN_ID}`);
      expect(data!.user_id).toBe(testUserId);

      insertedIds.push(data!.id);
    });

    it('선택 필드(fee, tax) 생략 시에도 등록 성공 (fee_currency는 NOT NULL이므로 포함)', async () => {
      // DB 스키마 상 fee_currency는 NOT NULL — fee_currency는 반드시 제공해야 한다
      const input = {
        asset_type: 'korean_stock',
        trade_type: 'sell',
        ticker: `NOFEE${RUN_ID}`,
        name: 'No Fee Stock',
        trade_date: '2026-02-01',
        quantity: 5,
        price_per_unit: 50000,
        currency: 'KRW',
        fee_currency: 'KRW',
        settlement_amount: 250000,
      };

      const { data, error } = await userClient
        .from('trade_events')
        .insert(input)
        .select()
        .single();

      expect(error).toBeNull();
      expect(data!.id).toBeDefined();

      insertedIds.push(data!.id);
    });

    it('잘못된 asset_type(CHECK 위반) 시 에러 반환', async () => {
      const { error } = await userClient
        .from('trade_events')
        .insert(tradeEventDefaults({ asset_type: 'invalid_type' }))
        .select()
        .single();

      expect(error).not.toBeNull();
    });

    it('잘못된 trade_type(CHECK 위반) 시 에러 반환', async () => {
      const { error } = await userClient
        .from('trade_events')
        .insert(tradeEventDefaults({ trade_type: 'hold' }))
        .select()
        .single();

      expect(error).not.toBeNull();
    });

    it('미인증 상태에서 INSERT 시도 시 에러 반환 (RLS 차단)', async () => {
      const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: false },
      });

      const { error } = await anonClient
        .from('trade_events')
        .insert(tradeEventDefaults())
        .select()
        .single();

      expect(error).not.toBeNull();
    });
  });

  // ── READ ────────────────────────────────────────────────────────────────────

  describe('READ — getTradeEvents', () => {
    it('등록된 레코드 목록 조회 성공', async () => {
      const { data: created } = await userClient
        .from('trade_events')
        .insert(tradeEventDefaults())
        .select()
        .single();
      insertedIds.push(created!.id);

      const { data, error } = await userClient
        .from('trade_events')
        .select('*')
        .order('trade_date', { ascending: false });

      expect(error).toBeNull();
      expect(Array.isArray(data)).toBe(true);
      expect(data!.some((r) => r.id === created!.id)).toBe(true);
    });

    it('asset_type 필터: 지정 타입만 반환', async () => {
      const { data: created } = await userClient
        .from('trade_events')
        .insert(tradeEventDefaults({ asset_type: 'crypto', ticker: `CRYPTO${RUN_ID}` }))
        .select()
        .single();
      insertedIds.push(created!.id);

      const { data, error } = await userClient
        .from('trade_events')
        .select('*')
        .eq('asset_type', 'crypto');

      expect(error).toBeNull();
      const otherTypes = (data ?? []).filter((r) => r.asset_type !== 'crypto');
      expect(otherTypes).toHaveLength(0);
    });

    it('ticker 필터: 정확한 종목만 반환', async () => {
      const ticker = `FILTER${RUN_ID}`;
      const { data: created } = await userClient
        .from('trade_events')
        .insert(tradeEventDefaults({ ticker }))
        .select()
        .single();
      insertedIds.push(created!.id);

      const { data, error } = await userClient
        .from('trade_events')
        .select('*')
        .eq('ticker', ticker);

      expect(error).toBeNull();
      expect(data!.length).toBeGreaterThanOrEqual(1);
      expect(data!.every((r) => r.ticker === ticker)).toBe(true);
    });

    it('from/to 날짜 필터: 범위 내 데이터만 반환', async () => {
      const { data: created } = await userClient
        .from('trade_events')
        .insert(tradeEventDefaults({ trade_date: '2025-06-15', ticker: `RANGE${RUN_ID}` }))
        .select()
        .single();
      insertedIds.push(created!.id);

      const { data, error } = await userClient
        .from('trade_events')
        .select('*')
        .gte('trade_date', '2025-06-01')
        .lte('trade_date', '2025-06-30')
        .eq('ticker', `RANGE${RUN_ID}`);

      expect(error).toBeNull();
      expect(data!.length).toBeGreaterThanOrEqual(1);
    });

    it('미인증 상태에서 SELECT 시 빈 배열 또는 에러 반환 (RLS 차단)', async () => {
      const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: false },
      });

      const { data, error } = await anonClient
        .from('trade_events')
        .select('*');

      const isBlocked = !!error || (Array.isArray(data) && data.length === 0);
      expect(isBlocked).toBe(true);
    });
  });

  // ── UPDATE ──────────────────────────────────────────────────────────────────

  describe('UPDATE — updateTradeEvent', () => {
    it('부분 업데이트: 지정 필드만 변경되고 나머지 유지', async () => {
      const { data: created } = await userClient
        .from('trade_events')
        .insert(tradeEventDefaults())
        .select()
        .single();
      insertedIds.push(created!.id);

      const { data, error } = await userClient
        .from('trade_events')
        .update({ price_per_unit: 999, name: 'Updated Name' })
        .eq('id', created!.id)
        .select()
        .single();

      expect(error).toBeNull();
      expect(data!.price_per_unit).toBe(999);
      expect(data!.name).toBe('Updated Name');
      // 나머지 필드는 그대로
      expect(data!.ticker).toBe(created!.ticker);
      expect(data!.trade_type).toBe(created!.trade_type);
    });

    it('존재하지 않는 id 업데이트 시 null 반환', async () => {
      const { data, error } = await userClient
        .from('trade_events')
        .update({ name: 'Ghost' })
        .eq('id', '00000000-0000-0000-0000-000000000000')
        .select()
        .single();

      // RLS로 인해 타인 레코드나 없는 레코드는 PGRST116(결과 없음) 에러 반환
      expect(data === null || error !== null).toBe(true);
    });

    it('다른 유저의 레코드 업데이트 시 RLS 차단', async () => {
      // 유저 A가 생성
      const { data: created } = await userClient
        .from('trade_events')
        .insert(tradeEventDefaults({ ticker: `RLS_UPD${RUN_ID}` }))
        .select()
        .single();
      insertedIds.push(created!.id);

      // 유저 B가 업데이트 시도
      const { data, error } = await userClientB
        .from('trade_events')
        .update({ name: 'Hacked' })
        .eq('id', created!.id)
        .select()
        .single();

      expect(data === null || error !== null).toBe(true);

      // 원본 데이터 변경 없음 확인
      const { data: original } = await userClient
        .from('trade_events')
        .select('name')
        .eq('id', created!.id)
        .single();
      expect(original!.name).toBe('Test Stock');
    });
  });

  // ── DELETE ──────────────────────────────────────────────────────────────────

  describe('DELETE — deleteTradeEvent', () => {
    it('본인 레코드 삭제 성공', async () => {
      const { data: created } = await userClient
        .from('trade_events')
        .insert(tradeEventDefaults({ ticker: `DEL${RUN_ID}` }))
        .select()
        .single();

      const { error } = await userClient
        .from('trade_events')
        .delete()
        .eq('id', created!.id);

      expect(error).toBeNull();

      // 삭제 확인
      const { data: after } = await userClient
        .from('trade_events')
        .select('id')
        .eq('id', created!.id)
        .single();
      expect(after).toBeNull();
    });

    it('다른 유저의 레코드 삭제 시 RLS 차단 (원본 데이터 유지)', async () => {
      const { data: created } = await userClient
        .from('trade_events')
        .insert(tradeEventDefaults({ ticker: `RLS_DEL${RUN_ID}` }))
        .select()
        .single();
      insertedIds.push(created!.id);

      // 유저 B가 삭제 시도
      const { error } = await userClientB
        .from('trade_events')
        .delete()
        .eq('id', created!.id);

      // RLS 차단: 에러이거나 영향 없음
      // 원본 레코드 여전히 존재 확인
      const { data: still } = await userClient
        .from('trade_events')
        .select('id')
        .eq('id', created!.id)
        .single();
      expect(still).not.toBeNull();
    });
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// cash_balances CRUD
// ──────────────────────────────────────────────────────────────────────────────

describe('cash_balances CRUD', () => {
  const insertedIds: string[] = [];

  afterEach(async () => {
    for (const id of insertedIds) {
      await adminClient.from('cash_balances').delete().eq('id', id);
    }
    insertedIds.length = 0;
  });

  // ── CREATE ──────────────────────────────────────────────────────────────────

  describe('CREATE — createCashBalance', () => {
    it('KRW 잔액 등록 성공 및 id 반환', async () => {
      const { data, error } = await userClient
        .from('cash_balances')
        .insert({ balance: 5000000, currency: 'KRW' })
        .select()
        .single();

      expect(error).toBeNull();
      expect(data!.id).toBeDefined();
      expect(data!.balance).toBe(5000000);
      expect(data!.currency).toBe('KRW');
      expect(data!.user_id).toBe(testUserId);

      insertedIds.push(data!.id);
    });

    it('USD 잔액 등록 성공', async () => {
      const { data, error } = await userClient
        .from('cash_balances')
        .insert({ balance: 10000, currency: 'USD' })
        .select()
        .single();

      expect(error).toBeNull();
      expect(data!.currency).toBe('USD');

      insertedIds.push(data!.id);
    });

    it('recorded_at 명시적 지정 시 해당 값으로 저장 (UTC 동등성 검증)', async () => {
      const ts = '2026-03-01T09:00:00Z';
      const { data, error } = await userClient
        .from('cash_balances')
        .insert({ balance: 1000, currency: 'KRW', recorded_at: ts })
        .select()
        .single();

      expect(error).toBeNull();
      // DB가 +00:00 또는 Z 형식으로 반환할 수 있으므로 UTC 밀리초로 비교
      expect(new Date(data!.recorded_at).getTime()).toBe(new Date(ts).getTime());

      insertedIds.push(data!.id);
    });

    it('잘못된 currency(CHECK 위반) 시 에러 반환', async () => {
      const { error } = await userClient
        .from('cash_balances')
        .insert({ balance: 1000, currency: 'JPY' })
        .select()
        .single();

      expect(error).not.toBeNull();
    });

    it('미인증 상태에서 INSERT 시도 시 에러 반환 (RLS 차단)', async () => {
      const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: false },
      });

      const { error } = await anonClient
        .from('cash_balances')
        .insert({ balance: 1000, currency: 'KRW' })
        .select()
        .single();

      expect(error).not.toBeNull();
    });
  });

  // ── READ ────────────────────────────────────────────────────────────────────

  describe('READ — getCashBalances', () => {
    it('등록된 잔액 목록 조회 성공 및 recorded_at 내림차순 정렬', async () => {
      const { data: r1 } = await userClient
        .from('cash_balances')
        .insert({ balance: 1000, currency: 'KRW', recorded_at: '2026-01-01T00:00:00Z' })
        .select()
        .single();
      insertedIds.push(r1!.id);

      const { data: r2 } = await userClient
        .from('cash_balances')
        .insert({ balance: 2000, currency: 'KRW', recorded_at: '2026-02-01T00:00:00Z' })
        .select()
        .single();
      insertedIds.push(r2!.id);

      const { data, error } = await userClient
        .from('cash_balances')
        .select('*')
        .order('recorded_at', { ascending: false });

      expect(error).toBeNull();
      expect(data!.some((r) => r.id === r1!.id)).toBe(true);
      expect(data!.some((r) => r.id === r2!.id)).toBe(true);

      // 내림차순 정렬 검증
      for (let i = 1; i < data!.length; i++) {
        expect(data![i - 1].recorded_at >= data![i].recorded_at).toBe(true);
      }
    });

    it('currency 필터: KRW만 조회 시 USD 미포함', async () => {
      const { data: krw } = await userClient
        .from('cash_balances')
        .insert({ balance: 3000, currency: 'KRW' })
        .select()
        .single();
      insertedIds.push(krw!.id);

      const { data: usd } = await userClient
        .from('cash_balances')
        .insert({ balance: 500, currency: 'USD' })
        .select()
        .single();
      insertedIds.push(usd!.id);

      const { data, error } = await userClient
        .from('cash_balances')
        .select('*')
        .eq('currency', 'KRW');

      expect(error).toBeNull();
      const usdRows = (data ?? []).filter((r) => r.currency === 'USD');
      expect(usdRows).toHaveLength(0);
    });

    it('미인증 상태에서 SELECT 시 빈 배열 또는 에러 반환 (RLS 차단)', async () => {
      const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: false },
      });

      const { data, error } = await anonClient
        .from('cash_balances')
        .select('*');

      const isBlocked = !!error || (Array.isArray(data) && data.length === 0);
      expect(isBlocked).toBe(true);
    });
  });

  // ── RLS 격리 ─────────────────────────────────────────────────────────────────

  describe('RLS 격리 — 유저 간 데이터 분리', () => {
    it('유저 A의 cash_balance가 유저 B에게 보이지 않음', async () => {
      const { data: created } = await userClient
        .from('cash_balances')
        .insert({ balance: 9999999, currency: 'KRW' })
        .select()
        .single();
      insertedIds.push(created!.id);

      // 유저 B의 조회 결과에 유저 A의 레코드 없음
      const { data } = await userClientB
        .from('cash_balances')
        .select('*')
        .eq('id', created!.id);

      expect((data ?? []).length).toBe(0);
    });
  });
});
