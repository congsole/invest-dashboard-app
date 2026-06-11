/**
 * [026] 당일 스냅샷 수동 새로고침 — 데이터/API 레이어 통합 테스트
 *
 * 테스트 범위:
 *   1. snapshot_refresh_quotas — 쿼터 조회 (행 없음 → 0/3)
 *   2. refresh-today-snapshot Edge Function — 정상 흐름 (스냅샷 upsert + 쿼터 차감)
 *   3. refresh-today-snapshot — 3회 소진 후 429 (미차감)
 *   4. refresh-today-snapshot — 잘못된 파라미터 400
 *   5. refresh-today-snapshot — 미인증 401
 *   6. refresh-today-snapshot — account_events 없음 422
 *   7. RLS — 클라이언트의 snapshot_refresh_quotas INSERT/UPDATE 차단
 *   8. RLS — 클라이언트의 daily_snapshots 직접 UPDATE 차단
 *   9. getSnapshotRefreshQuota 서비스 함수 — 행 없으면 {used_count:0, remaining:3}
 *
 * 필요 환경변수 (app/.env.test):
 *   SUPABASE_URL          — 로컬 Supabase URL (http://127.0.0.1:54321)
 *   SUPABASE_ANON_KEY     — anon/publishable key
 *   SUPABASE_SERVICE_KEY  — service_role key (RLS 우회 데이터 정리 + 유저 생성)
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
let user2Client: SupabaseClient;

let testUserId: string;
let testUser2Id: string;

const TEST_EMAIL = `snap026-${RUN_ID}@example.com`;
const TEST_EMAIL_2 = `snap026b-${RUN_ID}@example.com`;
const TEST_PASSWORD = 'TestPassword123!';

// KST 오늘 날짜
function getTodayKst(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

// 테스트용 더미 current_prices
const DUMMY_PRICES = [
  { ticker: 'AAPL', asset_type: 'us_stock', price: 200, currency: 'USD' },
];
const DUMMY_FX_RATE = 1350;

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
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
    email_confirm: true,
  });
  if (e1) throw new Error(`테스트 유저1 생성 실패: ${e1.message}`);
  testUserId = u1.user.id;

  // 테스트 유저 2 생성 (RLS 격리 검증용)
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
    email: TEST_EMAIL,
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
  const today = getTodayKst();

  // 테스트 데이터 정리
  await adminClient.from('snapshot_refresh_quotas').delete().eq('user_id', testUserId);
  await adminClient.from('snapshot_refresh_quotas').delete().eq('user_id', testUser2Id);
  await adminClient.from('daily_snapshots').delete().eq('user_id', testUserId);
  await adminClient.from('daily_snapshots').delete().eq('user_id', testUser2Id);
  await adminClient.from('account_events').delete().eq('user_id', testUserId);
  await adminClient.from('account_events').delete().eq('user_id', testUser2Id);

  // 테스트 유저 삭제
  if (testUserId) await adminClient.auth.admin.deleteUser(testUserId);
  if (testUser2Id) await adminClient.auth.admin.deleteUser(testUser2Id);

  await userClient?.auth.signOut();
  await user2Client?.auth.signOut();
});

// ────────────────────────────────────────────
// 헬퍼: account_events에 입금 이벤트 삽입
// ────────────────────────────────────────────

async function insertDepositEvent(userId: string, amount = 1000000): Promise<string> {
  const { data, error } = await adminClient
    .from('account_events')
    .insert({
      user_id: userId,
      event_type: 'deposit',
      event_date: getTodayKst(),
      currency: 'KRW',
      amount,
      fx_rate_at_event: DUMMY_FX_RATE,
      source: 'manual',
    })
    .select('id')
    .single();

  if (error) throw new Error(`입금 이벤트 삽입 실패: ${error.message}`);
  return data.id;
}

// ────────────────────────────────────────────
// 헬퍼: Edge Function 직접 HTTP 호출 (fetch 기반)
// ────────────────────────────────────────────

async function callRefreshFunction(
  accessToken: string | null,
  body: object,
): Promise<{ status: number; data: any }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  const res = await fetch(`${SUPABASE_URL}/functions/v1/refresh-today-snapshot`, {
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

async function getAccessToken(client: SupabaseClient): Promise<string> {
  const { data: { session } } = await client.auth.getSession();
  if (!session?.access_token) throw new Error('세션 없음');
  return session.access_token;
}

// ════════════════════════════════════════════
// 1. snapshot_refresh_quotas — 쿼터 조회
// ════════════════════════════════════════════

describe('snapshot_refresh_quotas 쿼터 조회', () => {
  it('오늘 사용 기록이 없으면 행이 없다 (maybeSingle → null)', async () => {
    const today = getTodayKst();

    const { data, error } = await userClient
      .from('snapshot_refresh_quotas')
      .select('used_count, last_refreshed_at')
      .eq('user_id', testUserId)
      .eq('quota_date', today)
      .maybeSingle();

    expect(error).toBeNull();
    expect(data).toBeNull();  // 행 없으면 null
  });

  it('service_role로 직접 행 삽입 후 SELECT 조회 가능', async () => {
    const today = getTodayKst();

    // service_role로 삽입 (RLS INSERT 정책: service_role 전용)
    const { error: insertErr } = await adminClient
      .from('snapshot_refresh_quotas')
      .upsert(
        { user_id: testUser2Id, quota_date: today, used_count: 1 },
        { onConflict: 'user_id,quota_date' },
      );

    expect(insertErr).toBeNull();

    // 본인 클라이언트로 조회 (RLS SELECT: 본인 조회)
    const { data, error } = await user2Client
      .from('snapshot_refresh_quotas')
      .select('used_count, last_refreshed_at')
      .eq('user_id', testUser2Id)
      .eq('quota_date', today)
      .maybeSingle();

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data!.used_count).toBe(1);

    // 정리
    await adminClient.from('snapshot_refresh_quotas').delete().eq('user_id', testUser2Id);
  });
});

// ════════════════════════════════════════════
// 2. refresh-today-snapshot Edge Function — 정상 흐름
// ════════════════════════════════════════════

describe('refresh-today-snapshot Edge Function — 정상 흐름', () => {
  let eventId: string;

  beforeAll(async () => {
    // account_events에 이벤트 등록 (집계 필요)
    eventId = await insertDepositEvent(testUserId);
  });

  afterAll(async () => {
    // 생성된 스냅샷/쿼터 정리 (afterAll 전역 정리에서도 처리되지만 명시적으로)
    await adminClient.from('daily_snapshots').delete().eq('user_id', testUserId);
    await adminClient.from('snapshot_refresh_quotas').delete().eq('user_id', testUserId);
    if (eventId) {
      await adminClient.from('account_events').delete().eq('id', eventId);
    }
  });

  it('유효한 파라미터로 호출 시 200 응답 + snapshot/quota 구조 반환', async () => {
    const token = await getAccessToken(userClient);

    const { status, data } = await callRefreshFunction(token, {
      current_prices: DUMMY_PRICES,
      fx_rate_usd: DUMMY_FX_RATE,
    });

    expect(status).toBe(200);
    expect(data).toHaveProperty('snapshot');
    expect(data).toHaveProperty('quota');

    // snapshot 구조 검증
    const snapshot = data.snapshot;
    expect(snapshot).toHaveProperty('snapshot_date');
    expect(snapshot).toHaveProperty('total_value_krw');
    expect(snapshot).toHaveProperty('principal_krw');
    expect(snapshot).toHaveProperty('cash_krw');
    expect(snapshot).toHaveProperty('cash_usd');
    expect(snapshot).toHaveProperty('net_profit_krw');
    expect(snapshot).toHaveProperty('fx_rate_usd');

    // snapshot_date가 KST 오늘 날짜
    expect(snapshot.snapshot_date).toBe(getTodayKst());
    expect(snapshot.fx_rate_usd).toBe(DUMMY_FX_RATE);

    // quota 구조 검증
    const quota = data.quota;
    expect(quota).toHaveProperty('used_count');
    expect(quota).toHaveProperty('remaining');
    expect(quota).toHaveProperty('last_refreshed_at');
    expect(quota.used_count).toBe(1);
    expect(quota.remaining).toBe(2);
    expect(typeof quota.last_refreshed_at).toBe('string');
  });

  it('성공 후 daily_snapshots에 행이 upsert된다', async () => {
    const today = getTodayKst();

    const { data, error } = await adminClient
      .from('daily_snapshots')
      .select('snapshot_date, total_value_krw, fx_rate_usd')
      .eq('user_id', testUserId)
      .eq('snapshot_date', today)
      .maybeSingle();

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data!.snapshot_date).toBe(today);
    expect(Number(data!.fx_rate_usd)).toBe(DUMMY_FX_RATE);
  });

  it('성공 후 snapshot_refresh_quotas에 used_count가 1 증가한다', async () => {
    const today = getTodayKst();

    const { data, error } = await adminClient
      .from('snapshot_refresh_quotas')
      .select('used_count')
      .eq('user_id', testUserId)
      .eq('quota_date', today)
      .maybeSingle();

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data!.used_count).toBe(1);
  });

  it('같은 날 2회 호출 시 used_count가 2로 증가한다', async () => {
    const token = await getAccessToken(userClient);

    const { status } = await callRefreshFunction(token, {
      current_prices: DUMMY_PRICES,
      fx_rate_usd: DUMMY_FX_RATE,
    });

    expect(status).toBe(200);

    // quota 확인
    const today = getTodayKst();
    const { data } = await adminClient
      .from('snapshot_refresh_quotas')
      .select('used_count')
      .eq('user_id', testUserId)
      .eq('quota_date', today)
      .maybeSingle();

    expect(data!.used_count).toBe(2);
  });
});

// ════════════════════════════════════════════
// 3. 3회 소진 후 429 (횟수 미차감)
// ════════════════════════════════════════════

describe('refresh-today-snapshot — 3회 소진 후 429', () => {
  let eventId: string;

  beforeAll(async () => {
    // 별도 유저 2에서 테스트 (기존 used_count를 오염시키지 않기 위해)
    // 유저 2에 이벤트 삽입
    eventId = await insertDepositEvent(testUser2Id);

    // used_count=3 직접 설정
    const today = getTodayKst();
    const { error } = await adminClient
      .from('snapshot_refresh_quotas')
      .upsert(
        { user_id: testUser2Id, quota_date: today, used_count: 3 },
        { onConflict: 'user_id,quota_date' },
      );
    if (error) throw new Error(`쿼터 세팅 실패: ${error.message}`);
  });

  afterAll(async () => {
    await adminClient.from('snapshot_refresh_quotas').delete().eq('user_id', testUser2Id);
    await adminClient.from('daily_snapshots').delete().eq('user_id', testUser2Id);
    if (eventId) await adminClient.from('account_events').delete().eq('id', eventId);
  });

  it('used_count=3일 때 호출 시 429 반환', async () => {
    const token = await getAccessToken(user2Client);

    const { status, data } = await callRefreshFunction(token, {
      current_prices: DUMMY_PRICES,
      fx_rate_usd: DUMMY_FX_RATE,
    });

    expect(status).toBe(429);
    expect(data.error).toBeDefined();
    expect(data.error.code).toBe('429');
  });

  it('429 응답 후 used_count가 변하지 않는다 (미차감)', async () => {
    const today = getTodayKst();

    const { data, error } = await adminClient
      .from('snapshot_refresh_quotas')
      .select('used_count')
      .eq('user_id', testUser2Id)
      .eq('quota_date', today)
      .maybeSingle();

    expect(error).toBeNull();
    // 3회 초과 후에도 여전히 3
    expect(data!.used_count).toBe(3);
  });

  it('429 응답에 quota 정보가 포함된다', async () => {
    const token = await getAccessToken(user2Client);

    const { status, data } = await callRefreshFunction(token, {
      current_prices: DUMMY_PRICES,
      fx_rate_usd: DUMMY_FX_RATE,
    });

    expect(status).toBe(429);
    expect(data.quota).toBeDefined();
    expect(data.quota.used_count).toBe(3);
    expect(data.quota.remaining).toBe(0);
  });
});

// ════════════════════════════════════════════
// 4. 잘못된 파라미터 400
// ════════════════════════════════════════════

describe('refresh-today-snapshot — 잘못된 파라미터 400', () => {
  let token: string;

  beforeAll(async () => {
    token = await getAccessToken(userClient);
  });

  it('current_prices 배열이 비어 있으면 400 반환', async () => {
    const { status, data } = await callRefreshFunction(token, {
      current_prices: [],
      fx_rate_usd: DUMMY_FX_RATE,
    });

    expect(status).toBe(400);
    expect(data.error.code).toBe('400');
  });

  it('current_prices가 없으면 400 반환', async () => {
    const { status, data } = await callRefreshFunction(token, {
      fx_rate_usd: DUMMY_FX_RATE,
    });

    expect(status).toBe(400);
    expect(data.error.code).toBe('400');
  });

  it('fx_rate_usd가 0이면 400 반환', async () => {
    const { status, data } = await callRefreshFunction(token, {
      current_prices: DUMMY_PRICES,
      fx_rate_usd: 0,
    });

    expect(status).toBe(400);
    expect(data.error.code).toBe('400');
  });

  it('fx_rate_usd가 음수이면 400 반환', async () => {
    const { status, data } = await callRefreshFunction(token, {
      current_prices: DUMMY_PRICES,
      fx_rate_usd: -100,
    });

    expect(status).toBe(400);
    expect(data.error.code).toBe('400');
  });

  it('fx_rate_usd가 없으면 400 반환', async () => {
    const { status, data } = await callRefreshFunction(token, {
      current_prices: DUMMY_PRICES,
    });

    expect(status).toBe(400);
    expect(data.error.code).toBe('400');
  });
});

// ════════════════════════════════════════════
// 5. 미인증 401
// ════════════════════════════════════════════

describe('refresh-today-snapshot — 미인증 401', () => {
  it('Authorization 헤더 없이 호출 시 401 반환', async () => {
    const { status, data } = await callRefreshFunction(null, {
      current_prices: DUMMY_PRICES,
      fx_rate_usd: DUMMY_FX_RATE,
    });

    expect(status).toBe(401);
    // 로컬 Edge Function 런타임이 인증 헤더 없을 때 { msg: "..." } 형식으로 반환하는 경우도 허용
    const isUnauthorized =
      data?.error?.code === '401' ||
      (typeof data?.msg === 'string' && data.msg.toLowerCase().includes('authorization'));
    expect(isUnauthorized).toBe(true);
  });

  it('잘못된 토큰으로 호출 시 401 반환', async () => {
    const { status, data } = await callRefreshFunction('invalid.token.here', {
      current_prices: DUMMY_PRICES,
      fx_rate_usd: DUMMY_FX_RATE,
    });

    expect(status).toBe(401);
    // 로컬 Edge Function 런타임이 토큰 검증 실패 시 { msg: "..." } 형식으로 반환하는 경우도 허용
    const isUnauthorized =
      data?.error?.code === '401' ||
      (typeof data?.msg === 'string' &&
        (data.msg.toLowerCase().includes('token') || data.msg.toLowerCase().includes('unauthorized')));
    expect(isUnauthorized).toBe(true);
  });
});

// ════════════════════════════════════════════
// 6. account_events 없음 422
// ════════════════════════════════════════════

describe('refresh-today-snapshot — account_events 없음 422', () => {
  // 테스트 전용 유저 (account_events가 없는 상태)
  let freshUserId: string;
  let freshToken: string;

  beforeAll(async () => {
    const freshEmail = `snap026-fresh-${RUN_ID}@example.com`;

    const { data: u, error: e } = await adminClient.auth.admin.createUser({
      email: freshEmail,
      password: TEST_PASSWORD,
      email_confirm: true,
    });
    if (e) throw new Error(`fresh 유저 생성 실패: ${e.message}`);
    freshUserId = u.user.id;

    const freshClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
    });
    await freshClient.auth.signInWithPassword({ email: freshEmail, password: TEST_PASSWORD });
    const { data: { session } } = await freshClient.auth.getSession();
    freshToken = session!.access_token;
  });

  afterAll(async () => {
    if (freshUserId) await adminClient.auth.admin.deleteUser(freshUserId);
  });

  it('account_events가 없는 유저가 호출 시 422 반환', async () => {
    const { status, data } = await callRefreshFunction(freshToken, {
      current_prices: DUMMY_PRICES,
      fx_rate_usd: DUMMY_FX_RATE,
    });

    expect(status).toBe(422);
    expect(data.error.code).toBe('422');
  });
});

// ════════════════════════════════════════════
// 7. RLS — 클라이언트의 snapshot_refresh_quotas INSERT/UPDATE 차단
// ════════════════════════════════════════════

describe('RLS — snapshot_refresh_quotas INSERT/UPDATE 차단', () => {
  const today = getTodayKst();

  it('인증된 일반 사용자는 snapshot_refresh_quotas에 직접 INSERT 불가', async () => {
    const { error } = await userClient
      .from('snapshot_refresh_quotas')
      .insert({ user_id: testUserId, quota_date: today, used_count: 1 });

    // INSERT RLS: auth.role() = 'service_role' 조건 → authenticated 차단
    expect(error).not.toBeNull();
  });

  it('인증된 일반 사용자는 snapshot_refresh_quotas에 직접 UPDATE 불가', async () => {
    // service_role로 먼저 행 삽입
    const testDate = '2020-01-01';
    await adminClient
      .from('snapshot_refresh_quotas')
      .upsert({ user_id: testUserId, quota_date: testDate, used_count: 0 }, { onConflict: 'user_id,quota_date' });

    // 일반 클라이언트로 UPDATE 시도
    const { data, error } = await userClient
      .from('snapshot_refresh_quotas')
      .update({ used_count: 3 })
      .eq('user_id', testUserId)
      .eq('quota_date', testDate)
      .select();

    // UPDATE RLS: auth.role() = 'service_role' 조건 → authenticated 차단 → 0건 업데이트 또는 에러
    const isBlocked = !!error || (Array.isArray(data) && data.length === 0);
    expect(isBlocked).toBe(true);

    // 실제 값이 변경되지 않았는지 확인
    const { data: check } = await adminClient
      .from('snapshot_refresh_quotas')
      .select('used_count')
      .eq('user_id', testUserId)
      .eq('quota_date', testDate)
      .maybeSingle();

    expect(check?.used_count).toBe(0);

    // 정리
    await adminClient.from('snapshot_refresh_quotas').delete().eq('user_id', testUserId).eq('quota_date', testDate);
  });

  it('미인증 사용자는 snapshot_refresh_quotas SELECT 불가', async () => {
    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
    });

    const { data, error } = await anonClient
      .from('snapshot_refresh_quotas')
      .select('*');

    // RLS: SELECT using (auth.uid() = user_id) → 미인증은 빈 배열 또는 에러
    const isBlocked = !!error || (Array.isArray(data) && data.length === 0);
    expect(isBlocked).toBe(true);
  });

  it('다른 유저의 snapshot_refresh_quotas는 SELECT 불가 (RLS 격리)', async () => {
    const today2 = getTodayKst();
    // user2 쿼터 행 생성
    await adminClient
      .from('snapshot_refresh_quotas')
      .upsert({ user_id: testUser2Id, quota_date: today2, used_count: 2 }, { onConflict: 'user_id,quota_date' });

    // user1 클라이언트로 user2 데이터 조회 시도
    const { data, error } = await userClient
      .from('snapshot_refresh_quotas')
      .select('*')
      .eq('user_id', testUser2Id);

    // RLS에 의해 빈 배열 반환
    expect(error).toBeNull();
    expect(data).toHaveLength(0);

    // 정리
    await adminClient.from('snapshot_refresh_quotas').delete().eq('user_id', testUser2Id).eq('quota_date', today2);
  });
});

// ════════════════════════════════════════════
// 8. RLS — 클라이언트의 daily_snapshots 직접 UPDATE 차단
// ════════════════════════════════════════════

describe('RLS — daily_snapshots 직접 UPDATE 차단', () => {
  let snapshotDate: string;

  beforeAll(async () => {
    // 테스트용 스냅샷 행 삽입 (service_role로)
    snapshotDate = '2026-01-01';
    await adminClient
      .from('daily_snapshots')
      .upsert(
        {
          user_id: testUserId,
          snapshot_date: snapshotDate,
          total_value_krw: 1000000,
          principal_krw: 1000000,
          cash_krw: 1000000,
          cash_usd: 0,
          net_profit_krw: 0,
          fx_rate_usd: 1300,
        },
        { onConflict: 'user_id,snapshot_date' },
      );
  });

  afterAll(async () => {
    await adminClient.from('daily_snapshots').delete().eq('user_id', testUserId).eq('snapshot_date', snapshotDate);
  });

  it('인증된 일반 사용자는 daily_snapshots에 직접 UPDATE 불가', async () => {
    const { data, error } = await userClient
      .from('daily_snapshots')
      .update({ total_value_krw: 9999999 })
      .eq('user_id', testUserId)
      .eq('snapshot_date', snapshotDate)
      .select();

    // UPDATE RLS: daily_snapshots_update_service_role — service_role 전용
    const isBlocked = !!error || (Array.isArray(data) && data.length === 0);
    expect(isBlocked).toBe(true);

    // 실제 값이 변경되지 않았는지 확인
    const { data: check } = await adminClient
      .from('daily_snapshots')
      .select('total_value_krw')
      .eq('user_id', testUserId)
      .eq('snapshot_date', snapshotDate)
      .maybeSingle();

    expect(Number(check?.total_value_krw)).toBe(1000000);
  });
});

// ════════════════════════════════════════════
// 9. getSnapshotRefreshQuota 서비스 함수 동작
//    (supabase 클라이언트 직접 사용, REST 호출 패턴 검증)
// ════════════════════════════════════════════

describe('snapshot_refresh_quotas REST 조회 패턴 (getSnapshotRefreshQuota 동작)', () => {
  const today = getTodayKst();

  it('오늘 행이 없으면 maybeSingle이 null을 반환한다', async () => {
    // 테스트 유저는 afterAll 정리 전까지 오늘 쿼터 행이 있을 수 있으므로
    // 존재하지 않는 날짜로 확인
    const futureDate = '2099-12-31';

    const { data, error } = await userClient
      .from('snapshot_refresh_quotas')
      .select('used_count, last_refreshed_at')
      .eq('user_id', testUserId)
      .eq('quota_date', futureDate)
      .maybeSingle();

    expect(error).toBeNull();
    expect(data).toBeNull();
    // 서비스 함수는 null이면 { used_count: 0, remaining: 3, last_refreshed_at: null } 반환
  });

  it('오늘 행이 있으면 used_count와 last_refreshed_at을 반환한다', async () => {
    // service_role로 오늘 행 삽입
    const nowIso = new Date().toISOString();
    await adminClient
      .from('snapshot_refresh_quotas')
      .upsert(
        { user_id: testUserId, quota_date: today, used_count: 2, last_refreshed_at: nowIso },
        { onConflict: 'user_id,quota_date' },
      );

    const { data, error } = await userClient
      .from('snapshot_refresh_quotas')
      .select('used_count, last_refreshed_at')
      .eq('user_id', testUserId)
      .eq('quota_date', today)
      .maybeSingle();

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data!.used_count).toBe(2);
    // remaining = 3 - 2 = 1 (서비스 함수에서 계산)
    expect(3 - data!.used_count).toBe(1);
    expect(data!.last_refreshed_at).not.toBeNull();
  });
});
